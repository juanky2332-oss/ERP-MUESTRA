'use server'

import { revalidatePath } from 'next/cache'
import { getNextSequenceNumber } from '@/lib/sequences'
import { getContexto, assertPermiso, mensajeError, type Contexto } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { crearDocumento, aplicarTotales } from '@/lib/documentos/crear'
import { calcularVencimiento, condicionDeCliente, describirCondicion, etiquetaMetodo, hoyISO, sumarDias } from '@/lib/cobros/vencimientos'

type Tipo = 'presupuesto' | 'albaran' | 'factura'

const tableMap: Record<Tipo, string> = {
    presupuesto: 'presupuestos',
    albaran: 'albaranes',
    factura: 'facturas',
}

function permisoPara(ctx: Contexto, type: Tipo) {
    assertPermiso(ctx, type === 'presupuesto' ? 'presupuestos' : 'documentos')
}

export async function createDocument(data: any, type: Tipo) {
    try {
        const ctx = await getContexto()
        const insertedDoc = await crearDocumento(ctx, data, type)
        if (data?.source_document_type) revalidatePath(`/${tableMap[data.source_document_type as Tipo]}`)
        revalidatePath(`/${tableMap[type]}`)
        revalidatePath('/')
        return { success: true, data: insertedDoc }
    } catch (e) {
        console.error('Error creating document:', e)
        return { success: false, error: { message: mensajeError(e) } }
    }
}

// Campos que cambian importes o impuestos: se auditan con antes/después.
const CAMPOS_ECONOMICOS = ['total', 'base_imponible', 'iva_porcentaje', 'iva_importe', 'lineas', 'fecha_vencimiento']

export async function updateDocument(id: string, data: any, type: Tipo) {
    try {
        const ctx = await getContexto()
        permisoPara(ctx, type)
        const supabase = ctx.supabase

        const cleanUpdateData = { ...data }
        delete cleanUpdateData.source_document_id
        delete cleanUpdateData.source_document_type
        delete cleanUpdateData.albaran_origen_numero
        delete cleanUpdateData.presupuesto_origen_numero
        delete cleanUpdateData.id

        if (type === 'factura' && cleanUpdateData.enviado !== undefined && cleanUpdateData.enviada === undefined) {
            cleanUpdateData.enviada = cleanUpdateData.enviado
        }

        const { data: currentDoc } = await supabase.from(tableMap[type]).select('*').eq('id', id).single()
        if (!currentDoc) throw new Error('Documento no encontrado')

        // Si cambian las líneas o el IVA, los importes se recalculan aquí (no se fían del navegador).
        if (Array.isArray(cleanUpdateData.lineas) || 'iva_porcentaje' in cleanUpdateData) {
            aplicarTotales(Object.assign(cleanUpdateData, {
                lineas: Array.isArray(cleanUpdateData.lineas) ? cleanUpdateData.lineas : currentDoc.lineas,
                iva_porcentaje: 'iva_porcentaje' in cleanUpdateData ? cleanUpdateData.iva_porcentaje : currentDoc.iva_porcentaje,
            }))
        }

        // En facturas, "pagada/pendiente" ya no se cambia a mano en statuses:
        // se registra un cobro (queda trazado y con importe). Si llega desde la
        // pantalla antigua, se ignora esa parte y se conserva el resto.
        if (type === 'factura' && Array.isArray(cleanUpdateData.statuses)) {
            const conservar = (currentDoc.statuses || []).filter((s: string) => s === 'pagada' || s === 'pendiente')
            cleanUpdateData.statuses = Array.from(new Set([...cleanUpdateData.statuses.filter((s: string) => s !== 'pagada' && s !== 'pendiente'), ...conservar]))
        }
        if (type === 'factura' && 'fecha_vencimiento' in cleanUpdateData && cleanUpdateData.fecha_vencimiento !== currentDoc.fecha_vencimiento) {
            cleanUpdateData.vencimiento_manual = true
        }

        if (Array.isArray(cleanUpdateData.statuses)) {
            const oldStatuses: string[] = currentDoc.statuses || []
            const added = cleanUpdateData.statuses.filter((s: string) => !oldStatuses.includes(s))
            if (added.length > 0) {
                await supabase.from('document_status').insert(added.map((status: string) => ({
                    document_type: type, document_id: id, status, created_by: ctx.nombre,
                })))
            }
        }

        const { error } = await supabase.from(tableMap[type]).update(cleanUpdateData).eq('id', id)
        if (error) throw error

        const cambios: Record<string, unknown> = {}
        for (const k of Object.keys(cleanUpdateData)) {
            if (JSON.stringify(currentDoc[k]) !== JSON.stringify(cleanUpdateData[k])) {
                cambios[k] = CAMPOS_ECONOMICOS.includes(k) ? { antes: currentDoc[k], despues: cleanUpdateData[k] } : cleanUpdateData[k]
            }
        }
        if (Object.keys(cambios).length) {
            await auditar(ctx, 'documento_editado', { tipo: type, id, ref: currentDoc.numero }, cambios)
        }

        revalidatePath(`/${tableMap[type]}`)
        return { success: true }
    } catch (e) {
        console.error(`Error en updateDocument (${type}):`, e)
        return { success: false, error: { message: mensajeError(e) } }
    }
}

export async function deleteDocument(id: string, type: Tipo) {
    try {
        const ctx = await getContexto()
        permisoPara(ctx, type)

        const { data: doc } = await ctx.supabase.from(tableMap[type]).select('*').eq('id', id).maybeSingle()
        if (!doc) throw new Error('Documento no encontrado')
        if (type === 'factura') {
            const { count } = await ctx.supabase.from('cobros').select('id', { count: 'exact', head: true }).eq('factura_id', id).eq('estado', 'confirmado').neq('origen', 'importacion')
            if (count && count > 0) throw new Error('Esta factura tiene cobros registrados. Anula los cobros antes de eliminarla, o anula la factura.')
            // Numeración correlativa sin huecos (art. 6 RD 1619/2012): solo se puede borrar
            // la ÚLTIMA factura de la serie y si no se ha enviado. Si no, se anula.
            if (doc.enviada || doc.enviado || doc.es_enviado || doc.enviado_email || (doc.statuses || []).includes('enviado')) {
                throw new Error(`La factura ${doc.numero} ya se envió al cliente: no se puede borrar. Usa «Anular» (queda registrada con su motivo).`)
            }
            const m = /^(.*-)(\d+)-(\d{4})$/.exec(String(doc.numero))
            if (m) {
                const { data: serie } = await ctx.supabase.from('facturas').select('numero').ilike('numero', `${m[1]}%-${m[3]}`)
                const mayor = (serie || []).some((f: any) => { const x = /-(\d+)-\d{4}$/.exec(f.numero); return x && parseInt(x[1], 10) > parseInt(m[2], 10) })
                if (mayor) throw new Error(`La factura ${doc.numero} no es la última de la serie: borrarla dejaría un hueco en la numeración. Usa «Anular».`)
            }
        }

        if (type === 'albaran' && doc.factura_id) {
            const { data: f } = await ctx.supabase.from('facturas').select('numero').eq('id', doc.factura_id).maybeSingle()
            if (f) throw new Error(`El albarán ${doc.numero} está facturado en ${f.numero}: no se puede borrar.`)
        }

        const { error } = await ctx.supabase.from(tableMap[type]).delete().eq('id', id)
        if (error) throw error

        // El documento de origen vuelve a quedar pendiente (si no, desaparecía para siempre
        // de "pendiente de facturar" y no se podía volver a convertir).
        if (type === 'factura') {
            const ids: string[] = Array.isArray(doc.albaran_ids) ? doc.albaran_ids : []
            const { data: albs } = await ctx.supabase.from('albaranes').select('id, statuses').or([`factura_id.eq.${id}`, ...(ids.length ? [`id.in.(${ids.join(',')})`] : [])].join(','))
            for (const a of albs || []) {
                const st = (a.statuses || []).filter((s: string) => s !== 'traspasado')
                await ctx.supabase.from('albaranes').update({ factura_id: null, statuses: st.includes('pendiente') ? st : [...st, 'pendiente'] }).eq('id', a.id)
            }
        }
        if (type === 'albaran' && doc.presupuesto_id) {
            const { data: p } = await ctx.supabase.from('presupuestos').select('statuses').eq('id', doc.presupuesto_id).maybeSingle()
            if (p) {
                const st = (p.statuses || []).filter((s: string) => s !== 'traspasado')
                await ctx.supabase.from('presupuestos').update({ statuses: st.includes('pendiente') ? st : [...st, 'pendiente'] }).eq('id', doc.presupuesto_id)
            }
        }

        await auditar(ctx, 'documento_eliminado', { tipo: type, id, ref: doc?.numero }, { total: doc?.total, cliente: doc?.cliente_razon_social })
        revalidatePath(`/${tableMap[type]}`)
        return { success: true }
    } catch (e) {
        return { success: false, error: { message: mensajeError(e) } }
    }
}

/** Anulación trazable de una factura (no se borra: queda anulada con motivo). */
export async function anularFactura(id: string, motivo: string) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'documentos')
        if (!motivo?.trim()) throw new Error('Indica el motivo de la anulación.')
        const { data: f } = await ctx.supabase.from('facturas').select('numero, statuses').eq('id', id).maybeSingle()
        if (!f) throw new Error('Factura no encontrada')
        const { error } = await ctx.supabase.from('facturas').update({
            anulada: true, motivo_anulacion: motivo.trim(),
            statuses: Array.from(new Set([...(f.statuses || []), 'anulada'])),
        }).eq('id', id)
        if (error) throw error
        await ctx.supabase.from('document_status').insert({ document_type: 'factura', document_id: id, status: 'anulada', created_by: ctx.nombre })
        await auditar(ctx, 'factura_anulada', { tipo: 'factura', id, ref: f.numero }, { motivo })
        revalidatePath('/facturas')
        revalidatePath('/cobros')
        return { success: true }
    } catch (e) {
        return { success: false, error: mensajeError(e) }
    }
}

/** Vencimiento que tendría una factura para un cliente (para mostrarlo en el formulario). */
export async function previsualizarVencimiento(clienteId: string, fecha: string) {
    try {
        const ctx = await getContexto()
        const { data: cliente } = await ctx.supabase
            .from('contactos')
            .select('metodo_pago, condicion_pago_tipo, condicion_pago_dias, condicion_pago_dia_mes, condicion_pago_meses, condicion_pago_texto, condicion_pago_activa')
            .eq('id', clienteId).maybeSingle()
        if (!cliente) return { success: true, fecha: null, condicion: null }
        const cond = condicionDeCliente(cliente)
        return {
            success: true,
            fecha: calcularVencimiento(fecha.slice(0, 10), cond),
            condicion: cliente.condicion_pago_texto || describirCondicion(cond, cliente.metodo_pago),
            metodo: cliente.metodo_pago || null,
        }
    } catch (e) {
        return { success: false, error: mensajeError(e) }
    }
}

/** Número que tendrá el próximo documento (solo orientativo para el PDF de vista previa). */
export async function siguienteNumeroDocumento(type: Tipo) {
    try {
        const ctx = await getContexto()
        return await getNextSequenceNumber(type, ctx.supabase)
    } catch {
        return null
    }
}

/** Duplica un presupuesto (mismas líneas y cliente, número nuevo, fecha de hoy, estado pendiente). */
export async function duplicarPresupuesto(id: string) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'presupuestos')
        const { data: p } = await ctx.supabase.from('presupuestos').select('*').eq('id', id).maybeSingle()
        if (!p) throw new Error('Presupuesto no encontrado')
        const { id: _id, numero, created_at, updated_at, statuses, estado_vida, es_enviado, enviado, enviado_email, aceptado, rechazado, fecha_envio, pdf_url, empresa_id, ...resto } = p
        const hoy = hoyISO()
        const r = await createDocument({ ...resto, fecha: hoy, fecha_validez: sumarDias(hoyISO(), 30), estado: 'borrador' }, 'presupuesto')
        if (!r.success) throw new Error((r.error as any)?.message)
        await auditar(ctx, 'presupuesto_duplicado', { tipo: 'presupuesto', id, ref: numero }, { nuevo: r.data.numero })
        return { success: true, numero: r.data.numero as string }
    } catch (e) {
        return { success: false, error: mensajeError(e) }
    }
}

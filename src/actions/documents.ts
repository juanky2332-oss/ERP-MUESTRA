'use server'

import { revalidatePath } from 'next/cache'
import { getNextSequenceNumber } from '@/lib/sequences'
import { getContexto, assertPermiso, mensajeError, type Contexto } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { calcularVencimiento, condicionDeCliente, describirCondicion, etiquetaMetodo } from '@/lib/cobros/vencimientos'

type Tipo = 'presupuesto' | 'albaran' | 'factura'

const tableMap: Record<Tipo, string> = {
    presupuesto: 'presupuestos',
    albaran: 'albaranes',
    factura: 'facturas',
}

function permisoPara(ctx: Contexto, type: Tipo) {
    assertPermiso(ctx, type === 'presupuesto' ? 'presupuestos' : 'documentos')
}

/**
 * Vencimiento y forma de pago de una factura nueva a partir de las
 * condiciones del cliente. Si el usuario ya puso una fecha, se respeta.
 */
async function completarCobroFactura(ctx: Contexto, payload: any) {
    if (!payload.cliente_id) return
    const { data: cliente } = await ctx.supabase
        .from('contactos')
        .select('metodo_pago, condicion_pago_tipo, condicion_pago_dias, condicion_pago_dia_mes, condicion_pago_meses, condicion_pago_texto, condicion_pago_activa')
        .eq('id', payload.cliente_id)
        .maybeSingle()
    if (!cliente) return

    const fecha = String(payload.fecha || new Date().toISOString()).slice(0, 10)
    if (payload.fecha_vencimiento) {
        payload.vencimiento_manual = true
    } else {
        payload.fecha_vencimiento = calcularVencimiento(fecha, condicionDeCliente(cliente))
        payload.vencimiento_manual = false
    }
    if (!payload.metodo_pago && cliente.metodo_pago) payload.metodo_pago = cliente.metodo_pago
    if (!payload.forma_pago) {
        payload.forma_pago = cliente.condicion_pago_texto || describirCondicion(condicionDeCliente(cliente), cliente.metodo_pago)
    }
}

export async function createDocument(data: any, type: Tipo) {
    try {
        const ctx = await getContexto()
        permisoPara(ctx, type)
        const supabase = ctx.supabase

        // Campos solo para el PDF / enlace de origen que no son columnas reales.
        const {
            source_document_id, source_document_type,
            albaran_origen_numero, presupuesto_origen_numero,
            ...cleanData
        } = data

        const payloadToInsert: any = { ...cleanData }

        // Evitar conversiones duplicadas: un presupuesto solo se convierte en un
        // albarán, y un albarán solo en una factura.
        if (source_document_id && source_document_type === 'presupuesto' && type === 'albaran') {
            const { data: yaExiste } = await supabase.from('albaranes').select('numero').eq('presupuesto_id', source_document_id).limit(1).maybeSingle()
            if (yaExiste) throw new Error(`Este presupuesto ya se convirtió en el albarán ${yaExiste.numero}.`)
            payloadToInsert.presupuesto_id = source_document_id
        }
        if (source_document_id && source_document_type === 'albaran' && type === 'factura') {
            const { data: alb } = await supabase.from('albaranes').select('factura_id, statuses').eq('id', source_document_id).maybeSingle()
            if (alb?.factura_id) {
                const { data: fac } = await supabase.from('facturas').select('numero').eq('id', alb.factura_id).maybeSingle()
                if (fac) throw new Error(`Este albarán ya está facturado en la factura ${fac.numero}.`)
            }
            payloadToInsert.albaran_ids = [source_document_id]
        }

        if (type === 'factura') await completarCobroFactura(ctx, payloadToInsert)

        const numero = await getNextSequenceNumber(type, supabase)

        const payload = {
            ...payloadToInsert,
            numero,
            statuses: ['pendiente'],
            estado_vida: 'Pendiente',
            created_at: new Date().toISOString(),
            fecha: payloadToInsert.fecha || new Date().toISOString(),
            ...(type === 'factura' ? { importe_cobrado: 0, estado_cobro: 'pendiente' } : {}),
        }

        const { data: insertedDoc, error } = await supabase
            .from(tableMap[type])
            .insert(payload)
            .select()
            .single()

        if (error) {
            if (error.code === '23505') throw new Error('Ya existe un documento con ese número. Vuelve a intentarlo.')
            throw error
        }

        // Estado del documento de origen: pasa a "traspasado".
        if (source_document_id && (source_document_type === 'presupuesto' || source_document_type === 'albaran')) {
            const tablaOrigen = tableMap[source_document_type as Tipo]
            const { data: sourceDoc } = await supabase.from(tablaOrigen).select('statuses, numero').eq('id', source_document_id).single()
            const currentStatuses: string[] = sourceDoc?.statuses || []
            const update: any = {}
            if (!currentStatuses.includes('traspasado')) {
                update.statuses = [...currentStatuses.filter(s => s !== 'pendiente'), 'traspasado']
            }
            if (source_document_type === 'albaran' && type === 'factura') update.factura_id = insertedDoc.id
            if (Object.keys(update).length) {
                const { error: updateError } = await supabase.from(tablaOrigen).update(update).eq('id', source_document_id)
                if (updateError) console.error(`Error actualizando documento origen ${tablaOrigen}:`, updateError)
                await supabase.from('document_status').insert({ document_type: source_document_type, document_id: source_document_id, status: 'traspasado', created_by: ctx.nombre })
            }
            await auditar(ctx, 'documento_convertido', { tipo: source_document_type, id: source_document_id, ref: sourceDoc?.numero }, { destino: type, destino_numero: insertedDoc.numero })
            revalidatePath(`/${tablaOrigen}`)
        }

        await supabase.from('document_status').insert({ document_type: type, document_id: insertedDoc.id, status: 'pendiente', created_by: ctx.nombre })
        await auditar(ctx, 'documento_creado', { tipo: type, id: insertedDoc.id, ref: insertedDoc.numero }, {
            total: insertedDoc.total, cliente: insertedDoc.cliente_razon_social,
            ...(type === 'factura' ? { vencimiento: insertedDoc.fecha_vencimiento, metodo_pago: insertedDoc.metodo_pago ? etiquetaMetodo(insertedDoc.metodo_pago) : null } : {}),
        })

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

        const { data: doc } = await ctx.supabase.from(tableMap[type]).select('numero, total, cliente_razon_social').eq('id', id).maybeSingle()
        if (type === 'factura') {
            const { count } = await ctx.supabase.from('cobros').select('id', { count: 'exact', head: true }).eq('factura_id', id).eq('estado', 'confirmado').neq('origen', 'importacion')
            if (count && count > 0) throw new Error('Esta factura tiene cobros registrados. Anula los cobros antes de eliminarla, o anula la factura.')
        }

        const { error } = await ctx.supabase.from(tableMap[type]).delete().eq('id', id)
        if (error) throw error

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
        const hoy = new Date().toISOString().slice(0, 10)
        const r = await createDocument({ ...resto, fecha: hoy, fecha_validez: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), estado: 'borrador' }, 'presupuesto')
        if (!r.success) throw new Error((r.error as any)?.message)
        await auditar(ctx, 'presupuesto_duplicado', { tipo: 'presupuesto', id, ref: numero }, { nuevo: r.data.numero })
        return { success: true, numero: r.data.numero as string }
    } catch (e) {
        return { success: false, error: mensajeError(e) }
    }
}

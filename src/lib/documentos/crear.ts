import 'server-only'
import { getNextSequenceNumber } from '@/lib/sequences'
import { assertPermiso, type Contexto } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { calcularVencimiento, condicionDeCliente, describirCondicion, etiquetaMetodo } from '@/lib/cobros/vencimientos'
import { propagarFirmasAFactura } from '@/lib/firmados/servidor'

/**
 * Alta de presupuestos, albaranes y facturas (también por conversión:
 * presupuesto → albarán → factura). La usan la web, El Maikel y Telegram
 * para que el resultado sea idéntico venga de donde venga.
 */

export type Tipo = 'presupuesto' | 'albaran' | 'factura'

export const tableMap: Record<Tipo, string> = {
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
export async function completarCobroFactura(ctx: Contexto, payload: any) {
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

export async function crearDocumento(ctx: Contexto, data: any, type: Tipo) {
    {
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
            // Si el albarán ya estaba firmado, la firma queda unida también a la nueva factura
            if (source_document_type === 'albaran' && type === 'factura') await propagarFirmasAFactura(ctx, insertedDoc.id, [source_document_id])
            await auditar(ctx, 'documento_convertido', { tipo: source_document_type, id: source_document_id, ref: sourceDoc?.numero }, { destino: type, destino_numero: insertedDoc.numero })
        }

        await supabase.from('document_status').insert({ document_type: type, document_id: insertedDoc.id, status: 'pendiente', created_by: ctx.nombre })
        await auditar(ctx, 'documento_creado', { tipo: type, id: insertedDoc.id, ref: insertedDoc.numero }, {
            total: insertedDoc.total, cliente: insertedDoc.cliente_razon_social,
            ...(type === 'factura' ? { vencimiento: insertedDoc.fecha_vencimiento, metodo_pago: insertedDoc.metodo_pago ? etiquetaMetodo(insertedDoc.metodo_pago) : null } : {}),
        })

        return insertedDoc
    }
}


'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getNextSequenceNumber } from '@/lib/sequences'

export type TravelRateType = 'fixed' | 'per_km' | 'none'

export interface EffectiveRate {
    source: 'client' | 'default'
    hourly_rate: number
    travel_rate_type: TravelRateType
    travel_fixed_amount: number
    travel_rate_per_km: number
    minimum_billable_minutes: number
    label: string
}

/** Tarifa efectiva para un cliente: la suya propia si existe y está activa, si no la de empresa. */
export async function getEffectiveRate(clienteId: string | null): Promise<EffectiveRate> {
    const supabase = await createClient()

    if (clienteId) {
        const { data: card } = await supabase
            .from('client_rate_cards')
            .select('*')
            .eq('cliente_id', clienteId)
            .eq('active', true)
            .maybeSingle()

        if (card) {
            return {
                source: 'client',
                hourly_rate: Number(card.hourly_rate),
                travel_rate_type: card.travel_rate_type,
                travel_fixed_amount: Number(card.travel_fixed_amount) || 0,
                travel_rate_per_km: Number(card.travel_rate_per_km) || 0,
                minimum_billable_minutes: card.minimum_billable_minutes || 60,
                label: `Tarifa del cliente: ${Number(card.hourly_rate).toFixed(2)} €/h`,
            }
        }
    }

    const { data: defaults } = await supabase
        .from('company_default_rates')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

    return {
        source: 'default',
        hourly_rate: Number(defaults?.default_hourly_rate) || 35,
        travel_rate_type: (defaults?.default_travel_rate_type as TravelRateType) || 'fixed',
        travel_fixed_amount: Number(defaults?.default_travel_fixed_amount) || 15,
        travel_rate_per_km: Number(defaults?.default_travel_rate_per_km) || 0.3,
        minimum_billable_minutes: defaults?.default_minimum_billable_minutes || 60,
        label: `Tarifa de empresa: ${(Number(defaults?.default_hourly_rate) || 35).toFixed(2)} €/h`,
    }
}

export interface MaterialLineInput {
    descripcion: string
    cantidad: number
    precio_unitario: number
}

export interface WorkOrderInput {
    id?: string
    cliente_id: string | null
    cliente_razon_social: string
    cliente_direccion?: string
    cliente_telefono?: string
    cliente_email?: string
    tecnico_id: string | null
    tecnico_nombre?: string
    service_date: string
    descripcion: string
    diagnostico?: string
    resolucion?: string
    hours_worked_minutes: number
    include_travel: boolean
    travel_km: number
    materials: MaterialLineInput[]
    iva_porcentaje: number
    status: string
}

function computeMissingInfo(input: WorkOrderInput, subtotal: number): string[] {
    const missing: string[] = []
    if (!input.cliente_id) missing.push('Selecciona un cliente')
    if (!input.descripcion?.trim()) missing.push('Describe la intervención')
    if (!input.service_date) missing.push('Indica la fecha de la intervención')
    if (subtotal <= 0) missing.push('Añade al menos una línea valorada (mano de obra, desplazamiento o material)')
    if (!input.iva_porcentaje && input.iva_porcentaje !== 0) missing.push('Selecciona el IVA aplicable')
    return missing
}

/** Calcula importes SIEMPRE en el servidor: nunca se confía en totales enviados desde el cliente. */
async function computeAmounts(input: WorkOrderInput) {
    const rate = await getEffectiveRate(input.cliente_id)

    const billableMinutes = Math.max(input.hours_worked_minutes || 0, input.hours_worked_minutes > 0 ? rate.minimum_billable_minutes : 0)
    const labor_amount = Math.round(((billableMinutes / 60) * rate.hourly_rate) * 100) / 100

    let travel_amount = 0
    if (input.include_travel) {
        if (rate.travel_rate_type === 'fixed') travel_amount = rate.travel_fixed_amount
        else if (rate.travel_rate_type === 'per_km') travel_amount = Math.round((input.travel_km || 0) * rate.travel_rate_per_km * 100) / 100
    }

    const materials_amount = Math.round(
        (input.materials || []).reduce((acc, m) => acc + (Number(m.cantidad) || 0) * (Number(m.precio_unitario) || 0), 0) * 100
    ) / 100

    const subtotal = Math.round((labor_amount + travel_amount + materials_amount) * 100) / 100
    const iva_importe = Math.round(subtotal * ((input.iva_porcentaje || 0) / 100) * 100) / 100
    const total = Math.round((subtotal + iva_importe) * 100) / 100

    return { rate, billableMinutes, labor_amount, travel_amount, materials_amount, subtotal, iva_importe, total }
}

export async function saveWorkOrder(input: WorkOrderInput, source: string = 'web') {
    const supabase = await createClient()
    const amounts = await computeAmounts(input)
    const missing = computeMissingInfo(input, amounts.subtotal)

    // Si el usuario pidió un estado "avanzado" pero faltan datos mínimos,
    // el parte se queda en pendiente_informacion (nunca se puede facturar a ciegas).
    const finalStatus = missing.length > 0 ? 'pendiente_informacion' : input.status

    const payload = {
        cliente_id: input.cliente_id,
        cliente_razon_social: input.cliente_razon_social,
        cliente_direccion: input.cliente_direccion || null,
        cliente_telefono: input.cliente_telefono || null,
        cliente_email: input.cliente_email || null,
        tecnico_id: input.tecnico_id,
        tecnico_nombre: input.tecnico_nombre || null,
        status: finalStatus,
        service_date: input.service_date || null,
        descripcion: input.descripcion,
        diagnostico: input.diagnostico || null,
        resolucion: input.resolucion || null,
        hours_worked_minutes: input.hours_worked_minutes || 0,
        hourly_rate_snapshot: amounts.rate.hourly_rate,
        labor_amount: amounts.labor_amount,
        travel_rate_type_snapshot: amounts.rate.travel_rate_type,
        travel_fixed_amount_snapshot: amounts.rate.travel_fixed_amount,
        travel_rate_per_km_snapshot: amounts.rate.travel_rate_per_km,
        travel_km: input.travel_km || 0,
        travel_amount: amounts.travel_amount,
        materials_amount: amounts.materials_amount,
        subtotal: amounts.subtotal,
        iva_porcentaje: input.iva_porcentaje,
        iva_importe: amounts.iva_importe,
        total: amounts.total,
        missing_information: missing.length > 0 ? missing.join(' · ') : null,
        source,
        updated_at: new Date().toISOString(),
    }

    let workOrderId = input.id

    if (workOrderId) {
        const { error } = await supabase.from('work_orders').update(payload).eq('id', workOrderId)
        if (error) return { success: false, error: error.message }
    } else {
        const numero = await getNextSequenceNumber('parte', supabase)
        const { data, error } = await supabase
            .from('work_orders')
            .insert({ ...payload, numero })
            .select('id')
            .single()
        if (error) return { success: false, error: error.message }
        workOrderId = data.id
    }

    // Reescribimos las líneas del parte (mano de obra + desplazamiento + materiales)
    await supabase.from('work_order_lines').delete().eq('work_order_id', workOrderId)

    const lines: any[] = []
    if (amounts.labor_amount > 0) {
        lines.push({
            work_order_id: workOrderId,
            line_type: 'labor',
            descripcion: `Mano de obra (${amounts.billableMinutes} min a ${amounts.rate.hourly_rate.toFixed(2)} €/h)`,
            cantidad: 1,
            precio_unitario: amounts.labor_amount,
            sort_order: 0,
        })
    }
    if (amounts.travel_amount > 0) {
        const desc = amounts.rate.travel_rate_type === 'per_km'
            ? `Desplazamiento (${input.travel_km} km a ${amounts.rate.travel_rate_per_km.toFixed(2)} €/km)`
            : 'Desplazamiento'
        lines.push({
            work_order_id: workOrderId,
            line_type: 'travel',
            descripcion: desc,
            cantidad: 1,
            precio_unitario: amounts.travel_amount,
            sort_order: 1,
        })
    }
    input.materials.forEach((m, i) => {
        if (!m.descripcion) return
        lines.push({
            work_order_id: workOrderId,
            line_type: 'material',
            descripcion: m.descripcion,
            cantidad: m.cantidad || 1,
            precio_unitario: m.precio_unitario || 0,
            sort_order: 10 + i,
        })
    })

    if (lines.length > 0) {
        const { error: linesError } = await supabase.from('work_order_lines').insert(lines)
        if (linesError) return { success: false, error: linesError.message }
    }

    revalidatePath('/partes-de-trabajo')
    revalidatePath(`/partes-de-trabajo/${workOrderId}`)
    return { success: true, id: workOrderId, missing, amounts }
}

export async function addWorkOrderAttachment(formData: FormData) {
    const supabase = await createClient()
    const workOrderId = formData.get('work_order_id') as string
    const caption = formData.get('caption') as string
    const file = formData.get('file') as File

    if (!file || !workOrderId) return { success: false, error: 'Faltan datos del archivo' }

    const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const path = `${workOrderId}/${Date.now()}_${sanitized}`

    const { error: uploadError } = await supabase.storage.from('partes-trabajo').upload(path, file)
    if (uploadError) return { success: false, error: uploadError.message }

    const { data: { publicUrl } } = supabase.storage.from('partes-trabajo').getPublicUrl(path)
    const fileType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type === 'application/pdf' ? 'pdf' : 'other'

    const { error } = await supabase.from('work_order_attachments').insert({
        work_order_id: workOrderId,
        file_url: publicUrl,
        file_path: path,
        file_type: fileType,
        caption: caption || null,
    })

    if (error) return { success: false, error: error.message }

    revalidatePath(`/partes-de-trabajo/${workOrderId}`)
    return { success: true, url: publicUrl }
}

export async function deleteWorkOrderAttachment(id: string, workOrderId: string) {
    const supabase = await createClient()
    const { data: attachment } = await supabase.from('work_order_attachments').select('file_path').eq('id', id).single()
    if (attachment?.file_path) {
        await supabase.storage.from('partes-trabajo').remove([attachment.file_path])
    }
    const { error } = await supabase.from('work_order_attachments').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath(`/partes-de-trabajo/${workOrderId}`)
    return { success: true }
}

export async function deleteWorkOrder(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('work_orders').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/partes-de-trabajo')
    return { success: true }
}

/**
 * Convierte un parte de trabajo en albarán. Idempotente: si ya tiene
 * related_delivery_note_id, devuelve el existente en vez de duplicar.
 */
export async function convertWorkOrderToDeliveryNote(workOrderId: string) {
    const supabase = await createClient()

    const { data: wo, error: woError } = await supabase
        .from('work_orders')
        .select('*, work_order_lines(*)')
        .eq('id', workOrderId)
        .single()

    if (woError || !wo) return { success: false, error: 'Parte de trabajo no encontrado' }

    if (wo.related_delivery_note_id) {
        return { success: true, albaranId: wo.related_delivery_note_id, alreadyConverted: true }
    }

    const missing: string[] = []
    if (!wo.cliente_id) missing.push('cliente')
    if (Number(wo.subtotal) <= 0) missing.push('al menos una línea valorada')
    if (wo.iva_porcentaje === null || wo.iva_porcentaje === undefined) missing.push('IVA aplicable')
    if (!wo.service_date) missing.push('fecha de intervención')

    if (missing.length > 0) {
        return { success: false, error: `Faltan datos para convertir: ${missing.join(', ')}` }
    }

    const lineas = (wo.work_order_lines || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((l: any) => ({
            descripcion: l.descripcion,
            cantidad: Number(l.cantidad),
            precio_unitario: Number(l.precio_unitario),
        }))

    const numero = await getNextSequenceNumber('albaran', supabase)

    const { data: albaran, error: albaranError } = await supabase
        .from('albaranes')
        .insert({
            numero,
            fecha: wo.service_date,
            cliente_id: wo.cliente_id,
            cliente_razon_social: wo.cliente_razon_social,
            cliente_direccion: wo.cliente_direccion,
            cliente_telefono: wo.cliente_telefono,
            lineas,
            subtotal: wo.subtotal,
            iva_importe: wo.iva_importe,
            total: wo.total,
            descripcion: wo.descripcion,
            observaciones: `Generado desde el parte de trabajo ${wo.numero}.`,
            statuses: ['pendiente'],
            estado_vida: 'Pendiente',
            created_at: new Date().toISOString(),
        })
        .select('id')
        .single()

    if (albaranError || !albaran) return { success: false, error: albaranError?.message || 'Error creando el albarán' }

    await supabase
        .from('work_orders')
        .update({ status: 'convertido', related_delivery_note_id: albaran.id, updated_at: new Date().toISOString() })
        .eq('id', workOrderId)

    await supabase.from('document_status').insert({ document_type: 'albaran', document_id: albaran.id, status: 'pendiente' })

    revalidatePath('/partes-de-trabajo')
    revalidatePath(`/partes-de-trabajo/${workOrderId}`)
    revalidatePath('/albaranes')

    return { success: true, albaranId: albaran.id, alreadyConverted: false }
}

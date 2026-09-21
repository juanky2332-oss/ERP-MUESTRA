'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendEmailAction } from './send-email'
import { OWN_COMPANY } from '@/lib/company'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export async function registerInvoicePayment(facturaId: string, metodo_pago: string, fecha_pago: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('facturas')
        .update({ pagada: true, fecha_pago, metodo_pago, statuses: ['pagada'] })
        .eq('id', facturaId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/cobros')
    revalidatePath('/facturas')
    revalidatePath('/')
    return { success: true }
}

export async function setInvoiceDueDate(facturaId: string, fecha_vencimiento: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('facturas').update({ fecha_vencimiento }).eq('id', facturaId)
    if (error) return { success: false, error: error.message }
    revalidatePath('/cobros')
    return { success: true }
}

/** Recordatorio de pago formal y directo por email, usando el mismo canal que ya usa la app. */
export async function sendPaymentReminder(facturaId: string) {
    const supabase = await createClient()

    const { data: factura, error } = await supabase.from('facturas').select('*').eq('id', facturaId).single()
    if (error || !factura) return { success: false, error: 'Factura no encontrada' }

    if (factura.pagada) return { success: false, error: 'Esta factura ya está cobrada' }

    let email = factura.cliente_email as string | null
    if (!email && factura.cliente_id) {
        const { data: contacto } = await supabase
            .from('contactos')
            .select('email, email_facturacion')
            .eq('id', factura.cliente_id)
            .single()
        email = contacto?.email_facturacion || contacto?.email || null
    }

    if (!email) {
        return { success: false, error: 'Este cliente no tiene un email registrado. Añádelo en su ficha de contacto.' }
    }

    const hoy = new Date()
    const vencida = factura.fecha_vencimiento && new Date(factura.fecha_vencimiento) < hoy
    const diasRetraso = vencida
        ? Math.floor((hoy.getTime() - new Date(factura.fecha_vencimiento).getTime()) / 86400000)
        : null

    const subject = `Recordatorio de pago pendiente — Factura ${factura.numero}`

    const html = `
<p>Estimado/a ${factura.cliente_razon_social || 'cliente'}:</p>
<p>Le escribimos para recordarle que la factura <b>${factura.numero}</b>, de fecha ${format(new Date(factura.fecha), "d 'de' MMMM 'de' yyyy", { locale: es })}, por importe de <b>${formatCurrency(Number(factura.total))}</b>, continúa pendiente de pago${factura.fecha_vencimiento ? ` (vencimiento: ${format(new Date(factura.fecha_vencimiento), "d 'de' MMMM 'de' yyyy", { locale: es })})` : ''}.</p>
${vencida ? `<p>A día de hoy acumula <b>${diasRetraso} día${diasRetraso === 1 ? '' : 's'}</b> de retraso sobre la fecha de vencimiento.</p>` : ''}
<p>Le agradeceríamos que gestionara el pago a la mayor brevedad posible. Si ya lo ha realizado, puede ignorar este mensaje.</p>
<p>Quedamos a su disposición para cualquier aclaración.</p>
<p>Atentamente,<br>${OWN_COMPANY.nombre}</p>
`.trim()

    const fd = new FormData()
    fd.set('to', email)
    fd.set('subject', subject)
    fd.set('html', html)
    fd.set('tipo_documento', 'Factura')
    fd.set('numero_documento', factura.numero)

    const result = await sendEmailAction(fd)

    if (result.success) {
        await supabase
            .from('facturas')
            .update({ last_reminder_at: new Date().toISOString(), reminder_count: (factura.reminder_count || 0) + 1 })
            .eq('id', facturaId)
        revalidatePath('/cobros')
    }

    return result
}

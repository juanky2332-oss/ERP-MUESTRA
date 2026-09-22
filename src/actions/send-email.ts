'use server'

import { requirePermiso, mensajeError } from '@/lib/auth'
import { enviarCorreo, getEmpresa, registrarEnvio } from '@/lib/email/mailer'
import { auditar } from '@/lib/auditoria'

/** Envío manual desde la pantalla Emails (con adjuntos elegidos por el usuario). */
export async function sendEmailAction(formData: FormData) {
    try {
        const ctx = await requirePermiso('enviar')
        const to = (formData.get('to') as string) || ''
        const cc = (formData.get('cc') as string) || ''
        const subject = (formData.get('subject') as string) || ''
        const html = (formData.get('html') as string) || ''
        const files = formData.getAll('attachments') as File[]

        const total = files.reduce((a, f) => a + (f?.size || 0), 0)
        if (total > 20 * 1024 * 1024) throw new Error('Los adjuntos superan 20 MB (límite de Gmail: 25 MB).')

        const attachments = await Promise.all(files.filter(f => f && f.size > 0).map(async (file) => ({
            filename: file.name,
            content: Buffer.from(await file.arrayBuffer()),
            contentType: file.type || undefined,
        })))

        const empresa = await getEmpresa(ctx)
        const res = await enviarCorreo({ to, cc, subject, cuerpo: html, esHtml: true, attachments }, empresa)

        const tipoDoc = (formData.get('tipo_documento') as string) || 'Documento'
        const numeroDoc = (formData.get('numero_documento') as string) || null
        await registrarEnvio(ctx, {
            destinatario: res.cc.length ? `${res.to.join(', ')} (CC: ${res.cc.join(', ')})` : res.to.join(', '),
            tipo_documento: tipoDoc,
            numero_documento: numeroDoc,
            documento_id: (formData.get('documento_id') as string) || null,
            pedido_referencia: (formData.get('pedido_referencia') as string) || null,
            asunto: subject,
            mensaje: html,
        })
        await auditar(ctx, 'correo_enviado', { tipo: tipoDoc.toLowerCase(), ref: numeroDoc }, { to: res.to, cc: res.cc, asunto: subject, adjuntos: attachments.map(a => a.filename) })

        return { success: true }
    } catch (error) {
        console.error('Email send error:', error)
        return { success: false, error: mensajeError(error) }
    }
}

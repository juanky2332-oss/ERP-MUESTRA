'use server'

import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'

// Credenciales desde env: GMAIL_USER y GMAIL_PASS (en Gmail usar "Contraseña de aplicación")
function getMailCredentials() {
    const user = process.env.GMAIL_USER
    const pass = process.env.GMAIL_PASS
    return { user, pass }
}

function getCorporateSignature() {
    return `
<br><br>
--<br>
<b>EMPRESA X, S.L.</b><br>
NIF: B00000000<br>
Calle Ejemplo, 1<br>
30000 - Ciudad Ejemplo (Murcia)<br>
Email: administracion@empresax-demo.com<br>
Tel: 600 000 000
`
}

export async function sendEmailAction(formData: FormData) {
    const to = formData.get('to') as string
    const cc = formData.get('cc') as string
    const subject = formData.get('subject') as string
    const html = formData.get('html') as string

    // Attachments
    const files = formData.getAll('attachments') as File[]

    const { user, pass } = getMailCredentials()
    if (!user || !pass) {
        return {
            success: false,
            error: 'Credenciales de correo no configuradas. Configura GMAIL_USER y GMAIL_PASS en las variables de entorno.',
        }
    }

    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false, // true for 465, false for other ports
        pool: true, // Use a pool of connections
        maxConnections: 5,
        maxMessages: 100,
        connectionTimeout: 10000, // 10s
        socketTimeout: 30000, // 30s
        auth: {
            user,
            pass, // En Gmail debe ser "Contraseña de aplicación", no la contraseña normal
        },
    });

    try {
        const attachments = await Promise.all(files.map(async (file) => {
            const buffer = Buffer.from(await file.arrayBuffer())
            return {
                filename: file.name,
                content: buffer
            }
        }))

        const finalHtml = `${html}${getCorporateSignature()}`

        await transporter.sendMail({
            from: `"Empresa X" <${user}>`,
            to,
            cc,
            subject,
            html: finalHtml,
            attachments
        })

        // 3. Log to History (notificaciones_historial)
        try {
            const supabase = await createClient()
            const tipoDoc = formData.get('tipo_documento') as string || 'Documento'
            const numeroDoc = formData.get('numero_documento') as string || 'N/A'
            const ref = formData.get('pedido_referencia') as string || ''

            await supabase.from('notificaciones_historial').insert({
                remitente: 'Empresa X',
                destinatario: cc ? `${to} (CC: ${cc})` : to,
                tipo_documento: tipoDoc,
                numero_documento: numeroDoc,
                pedido_referencia: ref,
                asunto: subject,
                mensaje: html,
                usuario_nombre: 'ADMIN' // Default for now
            })
        } catch (logError) {
            console.warn('Could not log to notificaciones_historial:', logError)
        }

        return { success: true }
    } catch (error: any) {
        console.error('Email send error:', error)
        let message = error?.message || String(error)
        if (message.includes('Username and Password') || message.includes('BadCredentials') || message.includes('535')) {
            message = 'Gmail no aceptó el usuario/contraseña. Comprueba GMAIL_USER y GMAIL_PASS en las variables de entorno y que uses una Contraseña de aplicación de Google, no la contraseña normal.'
        }
        return { success: false, error: message }
    }
}

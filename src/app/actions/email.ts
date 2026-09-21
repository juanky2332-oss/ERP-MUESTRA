'use server'

import nodemailer from 'nodemailer'

// Credenciales: GMAIL_USER y GMAIL_PASS
function getMailCredentials() {
    const user = process.env.GMAIL_USER
    const pass = process.env.GMAIL_PASS
    return { user, pass }
}

export async function sendEmail(formData: FormData) {
    const to = formData.get('to') as string
    const subject = formData.get('subject') as string
    const html = formData.get('html') as string

    // Process attachments
    const attachments: any[] = []
    const rawAttachments = formData.getAll('attachments')

    for (const entry of rawAttachments) {
        if (entry instanceof File && entry.size > 0) {
            const buffer = Buffer.from(await entry.arrayBuffer())
            attachments.push({
                filename: entry.name,
                content: buffer
            })
        }
    }

    console.log('Attempting to send email to:', to);

    const { user, pass } = getMailCredentials()
    if (!user || !pass) {
        console.error('Missing mail env: GMAIL_USER and GMAIL_PASS');
        return { success: false, error: 'Server configuration error: Missing credentials' };
    }

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user, pass },
        tls: {
            rejectUnauthorized: false
        }
    })

    try {
        const info = await transporter.sendMail({
            from: `"Empresa X" <${user}>`,
            to,
            subject,
            html,
            attachments
        })
        console.log('Email sent:', info.messageId);
        return { success: true, messageId: info.messageId }
    } catch (error: any) {
        console.error('Error sending email:', error)
        return { success: false, error: error.message }
    }
}

import 'server-only'
import nodemailer from 'nodemailer'
import type { Contexto } from '@/lib/auth'

export interface Adjunto {
    filename: string
    content: Buffer
    contentType?: string
}

export interface EnvioCorreo {
    to: string | string[]
    cc?: string | string[]
    subject: string
    /** Texto plano (se convierte a HTML con saltos de línea) o HTML si esHtml=true. */
    cuerpo: string
    esHtml?: boolean
    attachments?: Adjunto[]
}

export interface EmpresaFirma {
    nombre: string
    nif?: string | null
    direccion?: string | null
    email?: string | null
    telefono?: string | null
}

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
    const user = process.env.GMAIL_USER
    const pass = process.env.GMAIL_PASS
    if (!user || !pass) {
        throw new Error('El correo no está configurado: faltan GMAIL_USER y GMAIL_PASS en las variables de entorno.')
    }
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user, pass },
            connectionTimeout: 15000,
            socketTimeout: 30000,
        })
    }
    return transporter
}

export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function textoAHtml(texto: string): string {
    return escapeHtml(texto).replace(/\r?\n/g, '<br>')
}

function firmaHtml(e: EmpresaFirma): string {
    return `<br><br>--<br><b>${escapeHtml(e.nombre)}</b><br>` +
        (e.nif ? `NIF: ${escapeHtml(e.nif)}<br>` : '') +
        (e.direccion ? `${escapeHtml(e.direccion)}<br>` : '') +
        (e.email ? `Email: ${escapeHtml(e.email)}<br>` : '') +
        (e.telefono ? `Tel: ${escapeHtml(e.telefono)}` : '')
}

const listaEmails = (v?: string | string[]) =>
    (Array.isArray(v) ? v : (v || '').split(/[,;]/)).map(s => s.trim()).filter(Boolean)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Envía un correo real por SMTP (Gmail). Devuelve el messageId o lanza un
 * error con un mensaje entendible. No registra nada: eso lo hace quien llama.
 */
export async function enviarCorreo(envio: EnvioCorreo, empresa: EmpresaFirma): Promise<{ messageId: string; to: string[]; cc: string[] }> {
    const to = listaEmails(envio.to)
    const cc = listaEmails(envio.cc)
    if (to.length === 0) throw new Error('No hay ningún destinatario.')
    const invalidos = [...to, ...cc].filter(e => !EMAIL_RE.test(e))
    if (invalidos.length) throw new Error(`Dirección de correo no válida: ${invalidos.join(', ')}`)

    const html = (envio.esHtml ? envio.cuerpo : textoAHtml(envio.cuerpo)) + firmaHtml(empresa)

    try {
        const info = await getTransporter().sendMail({
            from: `"${empresa.nombre.replace(/"/g, '')}" <${process.env.GMAIL_USER}>`,
            replyTo: empresa.email || undefined,
            to,
            cc: cc.length ? cc : undefined,
            subject: envio.subject,
            html,
            attachments: envio.attachments,
        })
        return { messageId: info.messageId, to, cc }
    } catch (error: any) {
        const msg = String(error?.message || error)
        if (/Username and Password|BadCredentials|535/.test(msg)) {
            throw new Error('Gmail rechazó el usuario/contraseña. Revisa GMAIL_USER y GMAIL_PASS (debe ser una contraseña de aplicación).')
        }
        throw new Error('No se pudo enviar el correo: ' + msg)
    }
}

/** Datos de la empresa del usuario para la firma y las plantillas. */
export async function getEmpresa(ctx: Contexto): Promise<EmpresaFirma & Record<string, any>> {
    const { data } = await ctx.supabase.from('empresas').select('*').eq('id', ctx.empresaId).maybeSingle()
    return data || { nombre: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Empresa' }
}

/** Deja constancia del envío en el historial de correos (el que consulta la IA y la pantalla Emails). */
export async function registrarEnvio(ctx: Contexto, datos: {
    destinatario: string
    tipo_documento: string
    numero_documento?: string | null
    documento_id?: string | null
    pedido_referencia?: string | null
    asunto: string
    mensaje: string
    motivo?: string
    resultado?: string
}) {
    const { error } = await ctx.supabase.from('notificaciones_historial').insert({
        empresa_id: ctx.empresaId,
        remitente: ctx.nombre,
        destinatario: datos.destinatario,
        tipo_documento: datos.tipo_documento,
        numero_documento: datos.numero_documento || null,
        documento_id: datos.documento_id || null,
        pedido_referencia: datos.pedido_referencia || null,
        asunto: datos.asunto,
        mensaje: datos.mensaje,
        usuario_nombre: ctx.nombre,
        usuario_id: ctx.userId,
        canal: ctx.origen === 'telegram' ? 'email (desde Telegram)' : 'email',
        resultado: datos.resultado || 'enviado',
        motivo: datos.motivo || null,
    })
    if (error) console.warn('No se pudo registrar el envío:', error.message)
}

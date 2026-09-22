import 'server-only'

// TELEGRAM_API_BASE solo se usa en pruebas (servidor simulado); en producción no se define.
const BASE = () => process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'
const API = () => `${BASE()}/bot${process.env.TELEGRAM_BOT_TOKEN}`

export type Boton = { text: string; callback_data?: string; url?: string }
export type Teclado = Boton[][]

export function esc(s: unknown): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Markdown ligero del asistente (**negrita**) a HTML de Telegram, escapando lo demás. */
export function markdownATelegram(text: string): string {
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\n)#{1,3} (.+)/g, '$1<b>$2</b>')
}

async function llamar(metodo: string, body: any): Promise<any> {
    try {
        const res = await fetch(`${API()}/${metodo}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => null)
        if (data && data.ok === false) console.error(`Telegram ${metodo} rechazado:`, data.description)
        return data
    } catch (e) {
        console.error(`Error llamando a Telegram ${metodo}:`, e)
        return null
    }
}

const recortar = (t: string) => (t.length > 4000 ? t.slice(0, 3990) + '…' : t)

/** Envía un mensaje HTML con botones opcionales. Si el HTML falla, reintenta en texto plano. */
export async function enviar(chatId: string | number, html: string, teclado?: Teclado) {
    const body: any = { chat_id: chatId, text: recortar(html), parse_mode: 'HTML', disable_web_page_preview: true }
    if (teclado?.length) body.reply_markup = { inline_keyboard: teclado }
    const r = await llamar('sendMessage', body)
    if (r && r.ok === false && /parse|entit/i.test(r.description || '')) {
        delete body.parse_mode
        body.text = recortar(html.replace(/<[^>]+>/g, ''))
        return llamar('sendMessage', body)
    }
    return r
}

/** Sustituye el texto de un mensaje (p. ej. tras pulsar un botón, para que no se pulse dos veces). */
export async function editar(chatId: string | number, messageId: number, html: string, teclado?: Teclado) {
    const body: any = { chat_id: chatId, message_id: messageId, text: recortar(html), parse_mode: 'HTML', disable_web_page_preview: true }
    body.reply_markup = { inline_keyboard: teclado || [] }
    return llamar('editMessageText', body)
}

export async function quitarBotones(chatId: string | number, messageId: number) {
    return llamar('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
}

export async function responderCallback(callbackId: string, texto?: string, alerta = false) {
    return llamar('answerCallbackQuery', { callback_query_id: callbackId, text: texto, show_alert: alerta })
}

export async function escribiendo(chatId: string | number, accion: 'typing' | 'upload_document' = 'typing') {
    return llamar('sendChatAction', { chat_id: chatId, action: accion })
}

/** Envía un PDF (Buffer) como documento. */
export async function enviarDocumento(chatId: string | number, buffer: Buffer, nombre: string, caption?: string) {
    const form = new FormData()
    form.append('chat_id', String(chatId))
    form.append('document', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), nombre)
    if (caption) { form.append('caption', caption.slice(0, 1000)); form.append('parse_mode', 'HTML') }
    try {
        const res = await fetch(`${API()}/sendDocument`, { method: 'POST', body: form })
        return await res.json()
    } catch (e) {
        console.error('Error enviando documento a Telegram:', e)
        return null
    }
}

/** Descarga un archivo enviado por el usuario (foto, PDF, audio). */
export async function descargarArchivoTelegram(fileId: string): Promise<{ buffer: Buffer; ruta: string } | null> {
    const info = await llamar('getFile', { file_id: fileId })
    const ruta = info?.result?.file_path
    if (!ruta) return null
    if (info.result.file_size && info.result.file_size > 20 * 1024 * 1024) return null
    const res = await fetch(`${BASE()}/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${ruta}`)
    if (!res.ok) return null
    return { buffer: Buffer.from(await res.arrayBuffer()), ruta }
}

export const COMANDOS_BOT = [
    { command: 'inicio', description: 'Panel principal' },
    { command: 'hoy', description: 'Qué tengo hoy: agenda y vencimientos' },
    { command: 'resumen', description: 'Resumen económico del mes' },
    { command: 'cobros', description: 'Pendiente de cobro' },
    { command: 'vencidas', description: 'Facturas vencidas' },
    { command: 'pendientes', description: 'Facturas pendientes de cobro' },
    { command: 'pagada', description: 'Marcar factura pagada: /pagada F-42' },
    { command: 'facturas', description: 'Últimas facturas' },
    { command: 'presupuestos', description: 'Presupuestos por decidir' },
    { command: 'cliente', description: 'Buscar cliente: /cliente Nombre' },
    { command: 'buscar', description: 'Buscar en todo el ERP' },
    { command: 'gasto', description: 'Registrar un gasto (foto o texto)' },
    { command: 'notificaciones', description: 'Configurar avisos' },
    { command: 'ayuda', description: 'Cómo usar el bot' },
    { command: 'desvincular', description: 'Desconectar este chat del ERP' },
]

export async function configurarComandos() {
    return llamar('setMyCommands', { commands: COMANDOS_BOT, language_code: 'es' })
        .then(() => llamar('setMyCommands', { commands: COMANDOS_BOT }))
}

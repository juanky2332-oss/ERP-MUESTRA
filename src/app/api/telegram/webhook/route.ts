import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleCommand } from '@/lib/telegram/bot'
import { runErpAssistant, type ChatMessage } from '@/lib/ai/erp-assistant'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
const KNOWN_COMMANDS = ['/start', '/ayuda', '/help', '/resumen', '/factura', '/presupuesto', '/cliente']
const MAX_HISTORY = 10 // mensajes (usuario+asistente) que se conservan por chat

async function sendMessage(chatId: string, text: string, html: boolean = false) {
    try {
        // Los comandos rápidos generan sus propias etiquetas <b> controladas.
        // Las respuestas del asistente IA se mandan como texto plano: si el
        // modelo colara un '<' o '&' sueltos, Telegram rechazaría el HTML y
        // el mensaje no llegaría.
        const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(html ? { chat_id: chatId, text, parse_mode: 'HTML' } : { chat_id: chatId, text }),
        })
        const data = await res.json().catch(() => null)
        if (data && data.ok === false) {
            console.error('Telegram sendMessage rechazado:', data.description)
            // Reintento en texto plano por si el fallo fue de parseo de HTML.
            if (html) {
                await fetch(`${TELEGRAM_API}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text }),
                })
            }
        }
    } catch (e) {
        console.error('Error enviando mensaje de Telegram:', e)
    }
}

export async function POST(req: NextRequest) {
    const secret = req.headers.get('x-telegram-bot-api-secret-token')
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
        return NextResponse.json({ ok: false }, { status: 401 })
    }

    const update = await req.json().catch(() => null)
    if (!update) return NextResponse.json({ ok: true })

    const supabase = await createClient()
    const message = update.message
    const chatId: string | undefined = message?.chat?.id?.toString()

    // Auditoría + protección contra duplicados por update_id.
    if (update.update_id) {
        const { error: dupError } = await supabase.from('telegram_events').insert({
            chat_id: chatId || null,
            update_id: update.update_id,
            direction: 'in',
            event_type: message ? 'message' : 'other',
            payload_summary: (message?.text || '').slice(0, 200),
        })
        if (dupError?.code === '23505') {
            return NextResponse.json({ ok: true }) // ya procesado
        }
    }

    if (!message?.text || !chatId) {
        if (message && !message.text) {
            await sendMessage(chatId, 'De momento solo entiendo mensajes de texto por Telegram (fotos y notas de voz llegarán en una próxima mejora).')
        }
        return NextResponse.json({ ok: true })
    }

    const text = message.text.trim()

    // /vincular funciona sin estar todavía vinculado.
    if (text.toLowerCase().startsWith('/vincular')) {
        const code = text.split(/\s+/)[1]?.trim().toUpperCase()
        if (!code) {
            await sendMessage(chatId, 'Escribe el código junto al comando, por ejemplo: <code>/vincular ABC123</code>', true)
            return NextResponse.json({ ok: true })
        }

        const { data: link } = await supabase
            .from('telegram_links')
            .select('*')
            .eq('link_code', code)
            .eq('linked', false)
            .maybeSingle()

        if (!link || (link.code_expires_at && new Date(link.code_expires_at) < new Date())) {
            await sendMessage(chatId, 'Ese código no es válido o ha caducado. Genera uno nuevo desde el ERP → Ajustes → Conectar Telegram.')
            return NextResponse.json({ ok: true })
        }

        const username = message.chat.username || message.from?.first_name || ''
        await supabase
            .from('telegram_links')
            .update({ chat_id: chatId, linked: true, linked_at: new Date().toISOString(), telegram_username: username })
            .eq('id', link.id)

        await sendMessage(chatId, '✅ Cuenta vinculada correctamente. Pregúntame lo que necesites (facturas, clientes, presupuestos...) o escribe /ayuda.')
        return NextResponse.json({ ok: true })
    }

    // Cualquier otro mensaje exige un chat ya vinculado.
    const { data: linkRow } = await supabase
        .from('telegram_links')
        .select('id, conversation')
        .eq('chat_id', chatId)
        .eq('linked', true)
        .maybeSingle()

    if (!linkRow) {
        await sendMessage(chatId, 'Esta cuenta de Telegram todavía no está vinculada al ERP.\nVe a Ajustes → Conectar Telegram, genera un código y escribe aquí:\n<code>/vincular CODIGO</code>', true)
        return NextResponse.json({ ok: true })
    }

    const isKnownCommand = KNOWN_COMMANDS.some(c => text.toLowerCase() === c || text.toLowerCase().startsWith(c + ' '))

    let reply: string
    if (isKnownCommand) {
        // Comandos rápidos: deterministas, sin coste de IA.
        reply = await handleCommand(supabase, text)
    } else {
        // Cualquier otra pregunta o petición en lenguaje natural pasa por el
        // mismo asistente IA (con tools reales sobre la base de datos) que usa
        // el chat web del ERP, con un poco de memoria de conversación.
        const history: ChatMessage[] = Array.isArray(linkRow.conversation) ? linkRow.conversation : []
        const messages: ChatMessage[] = [...history, { role: 'user', content: text }]

        try {
            reply = await runErpAssistant(supabase, messages)
        } catch (e) {
            console.error('Error en el asistente IA de Telegram:', e)
            reply = 'He tenido un problema consultando el ERP. Inténtalo de nuevo en un momento, o usa /ayuda para ver los comandos rápidos.'
        }

        const updatedHistory = [...messages, { role: 'assistant' as const, content: reply }].slice(-MAX_HISTORY)
        await supabase.from('telegram_links').update({ conversation: updatedHistory }).eq('id', linkRow.id)
    }

    await sendMessage(chatId, reply, isKnownCommand)

    // Sin update_id: es un mensaje saliente nuestro, no de Telegram, y el
    // índice único de deduplicación solo aplica a update_id no nulos.
    await supabase.from('telegram_events').insert({
        chat_id: chatId,
        direction: 'out',
        event_type: isKnownCommand ? 'command_reply' : 'ai_reply',
        payload_summary: reply.slice(0, 200),
    })

    return NextResponse.json({ ok: true })
}

export async function GET() {
    return NextResponse.json({ ok: true, service: 'telegram-webhook' })
}

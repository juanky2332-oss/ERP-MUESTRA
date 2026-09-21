import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleCommand } from '@/lib/telegram/bot'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

async function sendMessage(chatId: string, text: string) {
    try {
        await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        })
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

    // Auditoría + protección contra duplicados por update_id (Telegram puede reenviar el mismo update).
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
        return NextResponse.json({ ok: true })
    }

    const text = message.text.trim()

    // /vincular funciona sin estar todavía vinculado.
    if (text.toLowerCase().startsWith('/vincular')) {
        const code = text.split(/\s+/)[1]?.trim().toUpperCase()
        if (!code) {
            await sendMessage(chatId, 'Escribe el código junto al comando, por ejemplo: <code>/vincular ABC123</code>')
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

        await sendMessage(chatId, '✅ Cuenta vinculada correctamente. Escribe /ayuda para ver qué puedo hacer.')
        return NextResponse.json({ ok: true })
    }

    // Cualquier otro mensaje exige un chat ya vinculado.
    const { data: linked } = await supabase
        .from('telegram_links')
        .select('id')
        .eq('chat_id', chatId)
        .eq('linked', true)
        .maybeSingle()

    if (!linked) {
        await sendMessage(chatId, 'Esta cuenta de Telegram todavía no está vinculada al ERP.\nVe a Ajustes → Conectar Telegram, genera un código y escribe aquí:\n<code>/vincular CODIGO</code>')
        return NextResponse.json({ ok: true })
    }

    const reply = await handleCommand(supabase, text)
    await sendMessage(chatId, reply)

    return NextResponse.json({ ok: true })
}

export async function GET() {
    return NextResponse.json({ ok: true, service: 'telegram-webhook' })
}

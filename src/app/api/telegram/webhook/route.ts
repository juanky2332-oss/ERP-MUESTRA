import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { procesarUpdate } from '@/lib/telegram/bot'

export const maxDuration = 60

/**
 * Webhook del bot de Telegram.
 * - Autenticado con el secret_token que Telegram manda en cada petición.
 * - Deduplicado por update_id: si Telegram reintenta, no se procesa dos veces
 *   (evita cobros o correos duplicados).
 * - Cada chat actúa como su usuario del ERP, con RLS y permisos de su rol.
 */
export async function POST(req: NextRequest) {
    const secret = req.headers.get('x-telegram-bot-api-secret-token')
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
        return NextResponse.json({ ok: false }, { status: 401 })
    }

    const update = await req.json().catch(() => null)
    if (!update?.update_id) return NextResponse.json({ ok: true })

    const message = update.message || update.edited_message
    const cb = update.callback_query
    const chatId = (cb?.message?.chat?.id ?? message?.chat?.id)?.toString() || null

    const admin = createAdminClient()
    const { error: dupError } = await admin.from('telegram_events').insert({
        chat_id: chatId,
        update_id: update.update_id,
        direction: 'in',
        event_type: cb ? 'callback' : message?.photo ? 'photo' : message?.document ? 'document' : message?.voice ? 'voice' : message ? 'message' : 'other',
        payload_summary: (cb?.data || message?.text || message?.caption || '').slice(0, 200),
    })
    if (dupError?.code === '23505') return NextResponse.json({ ok: true }) // ya procesado

    try {
        await procesarUpdate(update)
        await admin.from('telegram_events').update({ status: 'ok' }).eq('update_id', update.update_id)
    } catch (e: any) {
        console.error('Error en webhook de Telegram:', e)
        await admin.from('telegram_events').update({ status: 'error: ' + String(e?.message || e).slice(0, 150) }).eq('update_id', update.update_id)
    }
    // Siempre 200: si devolviéramos error, Telegram reintentaría el mismo update.
    return NextResponse.json({ ok: true })
}

export async function GET() {
    return NextResponse.json({ ok: true, service: 'telegram-webhook' })
}

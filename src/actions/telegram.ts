'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function randomCode(length = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin caracteres ambiguos
    let out = ''
    for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
    return out
}

export async function getTelegramStatus() {
    const supabase = await createClient()
    const { data } = await supabase
        .from('telegram_links')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    return {
        linked: !!data?.linked,
        pendingCode: !data?.linked ? data?.link_code : null,
        pendingExpiresAt: !data?.linked ? data?.code_expires_at : null,
        telegramUsername: data?.telegram_username || null,
        linkedAt: data?.linked_at || null,
    }
}

/** Genera un código de vinculación de un solo uso, caduca en 15 minutos. */
export async function generateTelegramLinkCode() {
    const supabase = await createClient()

    // Solo puede haber un enlace activo/vinculado a la vez en esta demo de una sola cuenta.
    const { data: existingLinked } = await supabase.from('telegram_links').select('id').eq('linked', true).maybeSingle()
    if (existingLinked) {
        return { success: false, error: 'Ya tienes una cuenta de Telegram vinculada. Desconéctala primero.' }
    }

    const code = randomCode()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    // Limpia códigos pendientes anteriores y crea uno nuevo.
    await supabase.from('telegram_links').delete().eq('linked', false)
    const { error } = await supabase.from('telegram_links').insert({ link_code: code, code_expires_at: expiresAt, linked: false })

    if (error) return { success: false, error: error.message }

    revalidatePath('/ajustes')
    return { success: true, code, expiresAt }
}

export async function disconnectTelegram() {
    const supabase = await createClient()
    const { error } = await supabase.from('telegram_links').delete().eq('linked', true)
    if (error) return { success: false, error: error.message }
    revalidatePath('/ajustes')
    return { success: true }
}

'use server'

import { revalidatePath } from 'next/cache'
import { randomInt } from 'crypto'
import { getContexto, mensajeError } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { auditar } from '@/lib/auditoria'
import { enviar } from '@/lib/telegram/api'
import { preferencias, esClavePreferencia, type Preferencias } from '@/lib/telegram/preferencias'

function randomCode(length = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin caracteres ambiguos
    let out = ''
    for (let i = 0; i < length; i++) out += chars[randomInt(chars.length)]
    return out
}

/** Estado de la conexión de Telegram del USUARIO actual (cada usuario vincula su propio chat). */
export async function getTelegramStatus() {
    try {
        const ctx = await getContexto()
        const { data } = await createAdminClient()
            .from('telegram_links')
            .select('linked, link_code, code_expires_at, telegram_username, linked_at, notificaciones')
            .eq('user_id', ctx.userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        return {
            linked: !!data?.linked,
            pendingCode: !data?.linked ? data?.link_code : null,
            pendingExpiresAt: !data?.linked ? data?.code_expires_at : null,
            telegramUsername: data?.telegram_username || null,
            linkedAt: data?.linked_at || null,
            notificaciones: preferencias(data?.notificaciones),
            botUsername: process.env.TELEGRAM_BOT_USERNAME || 'ERP_PRUEBA_bot',
        }
    } catch {
        return { linked: false, pendingCode: null, pendingExpiresAt: null, telegramUsername: null, linkedAt: null, notificaciones: preferencias(), botUsername: process.env.TELEGRAM_BOT_USERNAME || 'ERP_PRUEBA_bot' }
    }
}

/** Genera un código de vinculación de un solo uso que caduca en 15 minutos. */
export async function generateTelegramLinkCode() {
    try {
        const ctx = await getContexto()
        const admin = createAdminClient()

        const { data: existingLinked } = await admin.from('telegram_links').select('id').eq('user_id', ctx.userId).eq('linked', true).maybeSingle()
        if (existingLinked) return { success: false, error: 'Ya tienes un chat de Telegram vinculado. Desconéctalo primero.' }

        const code = randomCode()
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

        await admin.from('telegram_links').delete().eq('user_id', ctx.userId).eq('linked', false)
        const { error } = await admin.from('telegram_links').insert({
            link_code: code, code_expires_at: expiresAt, linked: false, user_id: ctx.userId, empresa_id: ctx.empresaId,
        })
        if (error) throw error

        revalidatePath('/ajustes')
        return { success: true, code, expiresAt }
    } catch (e) {
        return { success: false, error: mensajeError(e) }
    }
}

export async function disconnectTelegram() {
    try {
        const ctx = await getContexto()
        const admin = createAdminClient()
        const { data: links } = await admin.from('telegram_links').select('id, chat_id').eq('user_id', ctx.userId).eq('linked', true)
        const { error } = await admin.from('telegram_links').delete().eq('user_id', ctx.userId)
        if (error) throw error
        for (const l of links || []) {
            if (l.chat_id) await enviar(l.chat_id, '👋 Este chat se ha desvinculado del ERP desde la web.')
        }
        await auditar(ctx, 'telegram_desvinculado', { tipo: 'telegram' }, { desde: 'web' })
        revalidatePath('/ajustes')
        return { success: true }
    } catch (e) {
        return { success: false, error: mensajeError(e) }
    }
}

/** Activa o desactiva un aviso de Telegram del usuario actual (`avisos_diarios` = interruptor general). */
export async function setTelegramAviso(clave: string, activo: boolean) {
    try {
        if (!esClavePreferencia(clave)) return { success: false, error: 'Aviso desconocido' }
        const ctx = await getContexto()
        const admin = createAdminClient()
        const { data: link } = await admin.from('telegram_links').select('id, notificaciones').eq('user_id', ctx.userId).eq('linked', true).maybeSingle()
        if (!link) return { success: false, error: 'Primero vincula tu Telegram.' }
        const nuevas: Preferencias = { ...preferencias(link.notificaciones), [clave]: activo }
        const { error } = await admin.from('telegram_links').update({ notificaciones: nuevas }).eq('id', link.id)
        if (error) throw error
        revalidatePath('/ajustes')
        return { success: true, notificaciones: nuevas }
    } catch (e) {
        return { success: false, error: mensajeError(e) }
    }
}

import 'server-only'
import type { Contexto } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { tienePermiso, type Rol } from '@/lib/permisos'
import { formatCurrency } from '@/lib/utils'
import { etiquetaMetodo } from '@/lib/cobros/vencimientos'
import { enviar, esc } from '@/lib/telegram/api'

export interface LinkTelegram {
    id: string
    chat_id: string
    user_id: string
    empresa_id: string
    notificaciones: Record<string, boolean> | null
    rol?: Rol
}

/** Chats vinculados de una empresa, con su rol, para enviar avisos internos. */
export async function chatsDeEmpresa(empresaId: string): Promise<LinkTelegram[]> {
    const admin = createAdminClient()
    const { data: links } = await admin.from('telegram_links').select('id, chat_id, user_id, empresa_id, notificaciones').eq('empresa_id', empresaId).eq('linked', true)
    if (!links?.length) return []
    const { data: perfiles } = await admin.from('perfiles').select('user_id, rol, activo').in('user_id', links.map(l => l.user_id))
    return links
        .map(l => ({ ...l, rol: perfiles?.find(p => p.user_id === l.user_id && p.activo)?.rol as Rol | undefined }))
        .filter(l => !!l.rol && !!l.chat_id)
}

/**
 * Aviso de cobro: a los demás usuarios con permisos económicos (el que lo
 * registra ya lo sabe). Si fue una PROPUESTA de un rol sin permisos, avisa a
 * administración para que la confirme.
 */
export async function notificarCobroTelegram(ctx: Contexto, r: { estado: 'confirmado' | 'propuesto'; importe: number; factura: any; cobroId?: string }) {
    if (!process.env.TELEGRAM_BOT_TOKEN) return
    const chats = await chatsDeEmpresa(ctx.empresaId)
    const f = r.factura
    for (const c of chats) {
        if (c.user_id === ctx.userId) continue
        if (!tienePermiso(c.rol, 'economico')) continue
        if (r.estado === 'propuesto') {
            await enviar(c.chat_id,
                `📨 <b>Propuesta de cobro pendiente</b>\n${esc(ctx.nombre)} indica que se ha cobrado <b>${formatCurrency(r.importe)}</b> de la factura <b>${esc(f.numero)}</b> (${esc(f.cliente_razon_social)}).\nRevísala en el ERP → Cobros.`,
                r.cobroId && tienePermiso(c.rol, 'cobros') ? [[{ text: '✅ Confirmar cobro', callback_data: `cpc:${r.cobroId}` }]] : undefined)
        } else if (c.notificaciones?.cobros !== false) {
            await enviar(c.chat_id,
                `💶 <b>Cobro registrado</b> por ${esc(ctx.nombre)}\n${esc(f.numero)} · ${esc(f.cliente_razon_social)}\nImporte: <b>${formatCurrency(r.importe)}</b>\nEstado: ${f.info.estado === 'pagada' ? '✅ Pagada' : `Parcial · pendiente ${formatCurrency(f.info.pendiente)}`}`)
        }
    }
}

export { etiquetaMetodo }

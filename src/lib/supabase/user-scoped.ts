import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import type { Contexto } from '@/lib/auth'
import type { Rol } from '@/lib/permisos'

const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

function clienteConToken(accessToken: string) {
    return createSupabaseClient(URL(), ANON(), {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
}

/**
 * Cliente de Supabase que actúa COMO un usuario concreto, para procesos sin
 * cookie de navegador (webhook de Telegram, cron). Así RLS aplica igual que en
 * la web: el bot nunca puede ver datos de otra empresa ni saltarse el rol.
 *
 * Cómo: el servidor genera un magic link para ese usuario (sin enviarlo) y lo
 * canjea por una sesión real. Los tokens se cachean en telegram_links (tabla
 * solo accesible con service_role) y se renuevan con el refresh token.
 */
export async function getUserScopedClient(userId: string, cacheLinkId?: string) {
    const admin = createAdminClient()

    if (cacheLinkId) {
        const { data: link } = await admin
            .from('telegram_links')
            .select('sesion_access_token, sesion_refresh_token, sesion_expira_at')
            .eq('id', cacheLinkId)
            .maybeSingle()

        if (link?.sesion_access_token && link.sesion_expira_at && new Date(link.sesion_expira_at).getTime() - Date.now() > 5 * 60 * 1000) {
            return clienteConToken(link.sesion_access_token)
        }

        if (link?.sesion_refresh_token) {
            const anon = createSupabaseClient(URL(), ANON(), { auth: { persistSession: false } })
            const { data } = await anon.auth.refreshSession({ refresh_token: link.sesion_refresh_token })
            if (data.session) {
                await guardarSesion(cacheLinkId, data.session)
                return clienteConToken(data.session.access_token)
            }
        }
    }

    const { data: u, error: uErr } = await admin.auth.admin.getUserById(userId)
    if (uErr || !u.user?.email) throw new Error('Usuario no encontrado para la sesión de servicio')

    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email })
    if (error || !link.properties?.hashed_token) throw new Error('No se pudo abrir sesión de servicio: ' + (error?.message || ''))

    const anon = createSupabaseClient(URL(), ANON(), { auth: { persistSession: false } })
    const { data: verified, error: vErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
    if (vErr || !verified.session) throw new Error('No se pudo verificar la sesión de servicio: ' + (vErr?.message || ''))

    if (cacheLinkId) await guardarSesion(cacheLinkId, verified.session)
    return clienteConToken(verified.session.access_token)
}

async function guardarSesion(linkId: string, session: { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number }) {
    const expira = session.expires_at ? new Date(session.expires_at * 1000) : new Date(Date.now() + (session.expires_in || 3600) * 1000)
    await createAdminClient().from('telegram_links').update({
        sesion_access_token: session.access_token,
        sesion_refresh_token: session.refresh_token,
        sesion_expira_at: expira.toISOString(),
    }).eq('id', linkId)
}

/** Contexto completo (como getContexto) para un usuario, fuera del navegador. */
export async function getContextoDeUsuario(userId: string, origen: Contexto['origen'], cacheLinkId?: string): Promise<Contexto> {
    const supabase = await getUserScopedClient(userId, cacheLinkId)
    const { data: perfil } = await supabase.from('perfiles').select('empresa_id, rol, nombre, email, activo').eq('user_id', userId).maybeSingle()
    if (!perfil || !perfil.activo) throw new Error('El usuario vinculado ya no tiene acceso al ERP.')
    return {
        supabase,
        userId,
        email: perfil.email,
        nombre: perfil.nombre || perfil.email?.split('@')[0] || 'Usuario',
        empresaId: perfil.empresa_id,
        rol: perfil.rol as Rol,
        origen,
    }
}

import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Cliente de Supabase CON la sesión del usuario (cookie). Todas las consultas
 * pasan por RLS: cada usuario solo ve y modifica datos de su empresa.
 *
 * Antes este archivo devolvía un cliente con la clave de servicio, que se
 * saltaba RLS por completo: cualquier llamada a una server action (incluso sin
 * sesión) tenía acceso total. Para procesos internos sin usuario (webhook de
 * Telegram, cron) usar createAdminClient() filtrando SIEMPRE por empresa, o
 * mejor getUserScopedClient() de '@/lib/supabase/user-scoped'.
 */
export const createClient = async () => {
    const cookieStore = await cookies()
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
                    } catch {
                        // Llamado desde un Server Component: el proxy ya refresca la sesión.
                    }
                },
            },
        }
    )
}

/** Cliente con clave de servicio (salta RLS). Solo para código de servidor controlado. */
export function createAdminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}

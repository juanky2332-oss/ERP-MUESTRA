import { createAdminClient } from '@/lib/supabase/server'

/** Cliente con clave de servicio. Solo servidor; filtra siempre por empresa. */
export const supabaseAdmin = createAdminClient()

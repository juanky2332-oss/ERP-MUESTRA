import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

/**
 * Cliente del navegador. Usa createBrowserClient para llevar la sesión del
 * usuario (cookie) en cada petición: sin ella las consultas irían como "anon"
 * y RLS las bloquearía. En servidor (import accidental) cae a un cliente sin
 * sesión, que no ve nada.
 */
export const supabase = typeof window !== 'undefined'
    ? createBrowserClient(supabaseUrl, supabaseAnonKey)
    : createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })

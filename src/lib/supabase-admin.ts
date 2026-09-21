import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceRoleKey) {
    // Warn but don't crash client-side if this is imported by mistake, though it is used server-side mainly.
    console.warn('Missing Supabase Service Role Key')
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey || '', {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

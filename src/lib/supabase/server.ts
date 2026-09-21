import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const createClient = async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // Using Service Role for server actions

    if (!supabaseUrl || !supabaseKey) {
        console.warn('Missing Supabase environment variables - using placeholders for build');
        return createSupabaseClient(
            supabaseUrl || 'https://placeholder.supabase.co',
            supabaseKey || 'placeholder'
        )
    }

    return createSupabaseClient(supabaseUrl, supabaseKey)
}

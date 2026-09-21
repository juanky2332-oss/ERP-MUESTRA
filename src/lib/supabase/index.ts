import { createClient } from '@supabase/supabase-js'

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
let supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase environment variables - using placeholders for build');
    supabaseUrl = supabaseUrl || 'https://placeholder.supabase.co';
    supabaseAnonKey = supabaseAnonKey || 'placeholder';
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

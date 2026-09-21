
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
    console.log('Checking Presupuestos...')
    const { data: p } = await supabase.from('presupuestos').select('id, numero, estado, statuses').limit(5)
    console.log('Presupuestos:', JSON.stringify(p, null, 2))

    console.log('Checking Albaranes...')
    const { data: a } = await supabase.from('albaranes').select('id, numero, estado_vida, statuses').limit(5)
    console.log('Albaranes:', JSON.stringify(a, null, 2))

    console.log('Checking Facturas...')
    const { data: f } = await supabase.from('facturas').select('id, numero, estado_vida, statuses').limit(5)
    console.log('Facturas:', JSON.stringify(f, null, 2))
}

check()

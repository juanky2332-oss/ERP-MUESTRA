
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
    // Get one row to see keys
    const { data, error } = await supabase.from('gastos').select('*').limit(1);
    if (error) {
        console.error('Error fetching gasto:', error);
    } else {
        if (data.length > 0) {
            console.log('Gastos Keys:', Object.keys(data[0]));
        } else {
            console.log('No records in gastos table to inspect keys.');
        }
    }
}

inspect();

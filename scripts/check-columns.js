
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually load envs since dotenv might be flakey with paths
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = require('dotenv').parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    console.log('--- COLUMNS JSON START ---');
    const result = {};

    const { data: presupuestos } = await supabase.from('presupuestos').select('*').limit(1);
    if (presupuestos && presupuestos.length > 0) result.presupuestos = Object.keys(presupuestos[0]).sort();

    const { data: albaranes } = await supabase.from('albaranes').select('*').limit(1);
    if (albaranes && albaranes.length > 0) result.albaranes = Object.keys(albaranes[0]).sort();

    const { data: facturas } = await supabase.from('facturas').select('*').limit(1);
    if (facturas && facturas.length > 0) result.facturas = Object.keys(facturas[0]).sort();

    console.log(JSON.stringify(result, null, 2));
    console.log('--- COLUMNS JSON END ---');
}

checkColumns();


const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load Env
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = require('dotenv').parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    const sqlPath = path.resolve(__dirname, '../supabase/migrations/20260204_fix_document_states.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Supabase-js doesn't support raw SQL execution directly on the client instance usually, 
    // but we can try rpc if we had one, or splitting it. 
    // ACTUALLY, we can't run raw SQL this way without pg driver or a specific rpc.

    // Alternative: Use the "postgres" package if available, or just check if columns exist by trying to insert and seeing error.
    // But wait, the previous check-columns script was failing to print but succeeding to run. 
    // It meant it connected. 

    // Let's assume we can't run migration easily from node without pg.
    // Instead, let's verify if 'estado_vida' exists by selecting it.

    const { data, error } = await supabase.from('presupuestos').select('estado_vida').limit(1);
    if (error) {
        console.error('Migration likely NOT applied. Error selecting estado_vida:', error.message);
    } else {
        console.log('Migration likely applied. estado_vida exists.');
    }

    const { data: d2, error: e2 } = await supabase.from('albaranes').select('estado_vida').limit(1);
    if (e2) {
        console.error('Albaranes missing estado_vida:', e2.message);
    } else {
        console.log('Albaranes has estado_vida.');
    }
}

runMigration();

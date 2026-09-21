const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function check() {
    try {
        const envPath = path.resolve(__dirname, '../.env.local');
        if (!fs.existsSync(envPath)) {
            console.log('No .env.local found');
            return;
        }

        const content = fs.readFileSync(envPath, 'utf8');
        const env = {};
        content.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const k = parts[0].trim();
                const v = parts.slice(1).join('=').trim().replace(/"/g, '');
                env[k] = v;
            }
        });

        const url = env['NEXT_PUBLIC_SUPABASE_URL'];
        const key = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

        if (!url || !key) {
            console.log('Missing Setup Env');
            return;
        }

        console.log('Checking URL:', url);
        const supabase = createClient(url, key);

        console.log('Checking Albaranes...');
        const { count: countAlbaranes, error: errorAlbaranes } = await supabase.from('albaranes').select('*', { count: 'exact', head: true });
        if (errorAlbaranes) console.error('Error Albaranes:', errorAlbaranes.message);
        else console.log('Total Albaranes in DB:', countAlbaranes);

        const { data: albaranesSample } = await supabase.from('albaranes').select('id, fecha, estado_vida, es_enviado').limit(5);
        console.log('Albaranes Sample:', albaranesSample);

        console.log('\nChecking Gastos...');
        const { count: countGastos, error: errorGastos } = await supabase.from('gastos').select('*', { count: 'exact', head: true });
        if (errorGastos) console.error('Error Gastos:', errorGastos.message);
        else console.log('Total Gastos in DB:', countGastos);

        const { data: gastosSample } = await supabase.from('gastos').select('id, fecha, total').limit(5);
        console.log('Gastos Sample:', gastosSample);

    } catch (e) {
        console.error('Script Error:', e);
    }
}

check();

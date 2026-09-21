
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTable() {
    console.log('Checking client_emails table...');
    const { data, error } = await supabase.from('client_emails').select('*').limit(1);

    if (error) {
        console.error('Error accessing client_emails:', error);
    } else {
        console.log('client_emails accessible. Rows found:', data.length);
        if (data.length > 0) {
            console.log('Keys:', Object.keys(data[0]));
        }
    }
}

checkTable();

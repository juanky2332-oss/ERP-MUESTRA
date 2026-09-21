const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load env from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanConflictingStatuses(table) {
    console.log(`Checking conflicts in ${table}...`);

    // Determine the "completed" status for this table
    const completionStatus = table === 'facturas' ? 'pagada' : 'traspasado';

    // Find documents that have BOTH 'pendiente' AND the completion status
    // .contains with an array checks if the column array contains ALL elements of the query array
    const { data: conflicts, error } = await supabase
        .from(table)
        .select('id, statuses')
        .contains('statuses', ['pendiente', completionStatus]);

    if (error) {
        console.error(`Error fetching conflicts for ${table}:`, error);
        return;
    }

    console.log(`Found ${conflicts.length} conflicts in ${table}`);

    for (const doc of conflicts) {
        // Remove 'pendiente' from the array
        const newStatuses = doc.statuses.filter(s => s !== 'pendiente');
        console.log(`Fixing ${table} ${doc.id}: [${doc.statuses.join(', ')}] -> [${newStatuses.join(', ')}]`);

        const { error: updateError } = await supabase
            .from(table)
            .update({ statuses: newStatuses })
            .eq('id', doc.id);

        if (updateError) {
            console.error(`Failed to update ${doc.id}:`, updateError);
        }
    }
}

async function main() {
    console.log('Starting status cleanup...');
    await cleanConflictingStatuses('presupuestos');
    await cleanConflictingStatuses('albaranes');
    await cleanConflictingStatuses('facturas');
    console.log('Cleanup complete.');
}

main();

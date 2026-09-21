import { createClient } from '@/lib/supabase/server'
import { CobrosClient } from '@/components/cobros/cobros-client'

export const dynamic = 'force-dynamic'

export default async function CobrosPage() {
    const supabase = await createClient()

    const { data: facturas } = await supabase
        .from('facturas')
        .select('id, numero, fecha, fecha_vencimiento, cliente_id, cliente_razon_social, cliente_email, total, pagada, metodo_pago, fecha_pago, last_reminder_at, reminder_count')
        .order('fecha_vencimiento', { ascending: true, nullsFirst: false })

    return <CobrosClient initialFacturas={facturas || []} />
}

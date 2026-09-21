import { createClient } from '@/lib/supabase/server'
import { WorkOrdersList } from '@/components/work-orders/work-orders-list'

export const dynamic = 'force-dynamic'

export default async function PartesDeTrabajoPage() {
    const supabase = await createClient()
    const { data: workOrders } = await supabase
        .from('work_orders')
        .select('id, numero, service_date, cliente_razon_social, tecnico_nombre, status, total, missing_information, related_delivery_note_id')
        .order('created_at', { ascending: false })

    return <WorkOrdersList workOrders={workOrders || []} />
}

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { WorkOrderForm } from '@/components/work-orders/work-order-form'

export const dynamic = 'force-dynamic'

export default async function NewWorkOrderPage() {
    const supabase = await createClient()
    const { data: tecnicos } = await supabase.from('tecnicos').select('id, nombre').eq('activo', true).order('nombre')

    return (
        <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
            <PageHeader
                title="Nuevo parte de trabajo"
                breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Partes de trabajo', href: '/partes-de-trabajo' }, { label: 'Nuevo' }]}
            />
            <WorkOrderForm tecnicos={tecnicos || []} />
        </div>
    )
}

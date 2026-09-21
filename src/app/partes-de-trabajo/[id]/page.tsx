import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { WorkOrderForm } from '@/components/work-orders/work-order-form'
import { WorkOrderAttachments } from '@/components/work-orders/work-order-attachments'
import { ConvertToDeliveryNote } from '@/components/work-orders/convert-button'

export const dynamic = 'force-dynamic'

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()

    const [{ data: wo }, { data: lines }, { data: attachments }, { data: tecnicos }] = await Promise.all([
        supabase.from('work_orders').select('*').eq('id', id).single(),
        supabase.from('work_order_lines').select('*').eq('work_order_id', id).order('sort_order'),
        supabase.from('work_order_attachments').select('*').eq('work_order_id', id).order('created_at'),
        supabase.from('tecnicos').select('id, nombre').eq('activo', true).order('nombre'),
    ])

    if (!wo) notFound()

    const materialLines = (lines || [])
        .filter(l => l.line_type === 'material')
        .map(l => ({ descripcion: l.descripcion, cantidad: Number(l.cantidad), precio_unitario: Number(l.precio_unitario) }))

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
            <PageHeader
                title={wo.numero}
                breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Partes de trabajo', href: '/partes-de-trabajo' }, { label: wo.numero }]}
                actions={<StatusBadge status={wo.status} size="md" />}
            />

            <ConvertToDeliveryNote
                workOrderId={wo.id}
                status={wo.status}
                relatedDeliveryNoteId={wo.related_delivery_note_id}
                missingInformation={wo.missing_information}
            />

            <WorkOrderAttachments workOrderId={wo.id} attachments={attachments || []} />

            <WorkOrderForm
                tecnicos={tecnicos || []}
                existing={{
                    id: wo.id,
                    cliente_id: wo.cliente_id,
                    cliente_razon_social: wo.cliente_razon_social,
                    cliente_direccion: wo.cliente_direccion,
                    cliente_telefono: wo.cliente_telefono,
                    cliente_email: wo.cliente_email,
                    tecnico_id: wo.tecnico_id,
                    service_date: wo.service_date,
                    descripcion: wo.descripcion,
                    diagnostico: wo.diagnostico,
                    resolucion: wo.resolucion,
                    hours_worked_minutes: wo.hours_worked_minutes,
                    travel_km: wo.travel_km,
                    travel_amount: wo.travel_amount,
                    iva_porcentaje: wo.iva_porcentaje,
                    status: wo.status,
                    materialLines,
                }}
            />
        </div>
    )
}

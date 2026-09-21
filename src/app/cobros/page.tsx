import { CircleDollarSign } from "lucide-react"
import { ComingSoon } from "@/components/ui/coming-soon"

export default function CobrosPage() {
    return (
        <ComingSoon
            title="Cobros y vencimientos"
            description="Qué está cobrado, qué está pendiente y qué se ha vencido, de un vistazo."
            icon={CircleDollarSign}
            breadcrumbLabel="Cobros y vencimientos"
            features={[
                "Semáforo de riesgo por factura: al día, vence pronto o vencida",
                "Registro de cobros parciales, señales y anticipos por factura",
                "Recordatorios automáticos por email/WhatsApp con plantillas editables",
                "Enlaces de pago con Stripe, con conciliación automática al confirmarse",
                "Historial de recordatorios enviados y su resultado",
                "Vista de las 5 facturas con más saldo pendiente, priorizadas por impacto",
            ]}
        />
    )
}

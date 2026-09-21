import { Wrench } from "lucide-react"
import { ComingSoon } from "@/components/ui/coming-soon"

export default function PartesDeTrabajoPage() {
    return (
        <ComingSoon
            title="Partes de trabajo"
            description="Registra cada intervención en campo y conviértela en albarán sin volver a teclear nada."
            icon={Wrench}
            breadcrumbLabel="Partes de trabajo"
            features={[
                "Tarifa de mano de obra y desplazamiento aplicada automáticamente según el cliente",
                "Cálculo en vivo de horas, desplazamiento, materiales, IVA y total",
                "Fotos y documentos de la intervención adjuntos al parte y al PDF del albarán",
                "Checklist de información pendiente antes de poder facturar",
                "Firma del técnico y del cliente desde el móvil",
                "Conversión a albarán con un clic, sin duplicar documentos",
                "Creación de partes por Telegram: texto, foto, audio o dictado de voz",
            ]}
        />
    )
}

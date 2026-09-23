import { redirect } from 'next/navigation'

// La subida de documentos firmados se hace desde el listado (asistente con IA).
export default function NuevoFirmadoPage() {
    redirect('/albaranes-firmados')
}

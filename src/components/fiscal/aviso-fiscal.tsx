import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fechaES, type AvisoFiscal } from '@/lib/fiscal/calendario'
import { BotonEntregado } from '@/components/fiscal/controles'

const ESTILO = {
    info: 'bg-sky-50 border-sky-200 text-sky-950 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-100',
    pronto: 'bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-100',
    urgente: 'bg-rose-50 border-rose-300 text-rose-950 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-100',
}

export const textoDias = (d: number) => d === 0 ? 'hoy acaba el plazo' : d === 1 ? 'queda 1 día' : `quedan ${d} días`

/** Aviso «prepara las facturas para el asesor» (Inicio y sección Fiscal). */
export function AvisoFiscalBanner({ aviso, enlace = true }: { aviso: AvisoFiscal; enlace?: boolean }) {
    return (
        <div className={cn('flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border px-5 py-4', ESTILO[aviso.nivel])}>
            <CalendarClock className="h-5 w-5 shrink-0 hidden sm:block" />
            <div className="flex-1 min-w-0 text-sm">
                <p className="font-bold">Impuestos: {textoDias(aviso.diasRestantes)} para presentar {aviso.etiquetaPeriodo}</p>
                <p className="opacity-90">Modelos {aviso.modelos.join(', ')} · fin de plazo <b>{fechaES(aviso.fin)}</b> · entrega recomendada al asesor antes del <b>{fechaES(aviso.entregaAsesor)}</b></p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
                {enlace && <Link href={`/fiscal?periodo=${encodeURIComponent(aviso.periodo)}`} className="text-xs font-bold uppercase tracking-wide bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 px-3 py-2 rounded-lg whitespace-nowrap">Preparar facturas</Link>}
                <BotonEntregado clave={aviso.clave} periodo={aviso.periodo} />
            </div>
        </div>
    )
}

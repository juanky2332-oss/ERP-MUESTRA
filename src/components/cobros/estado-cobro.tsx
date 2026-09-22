'use client'

import { cn, formatCurrency } from '@/lib/utils'
import { infoCobro, type InfoCobro } from '@/lib/cobros/vencimientos'
import { CheckCircle2, AlertTriangle, Clock, CircleDot, CircleDashed } from 'lucide-react'

const ESTILOS: Record<InfoCobro['visual'], string> = {
    pagada: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
    parcial: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900',
    vencida: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900',
    vence_hoy: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900',
    pronto: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
    pendiente: 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700',
    sin_vencimiento: 'bg-slate-50 text-slate-500 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700',
}

const ICONOS: Record<InfoCobro['visual'], any> = {
    pagada: CheckCircle2, parcial: CircleDot, vencida: AlertTriangle, vence_hoy: AlertTriangle, pronto: Clock, pendiente: Clock, sin_vencimiento: CircleDashed,
}

/** Etiqueta de estado de cobro: verde pagada, ámbar pronto, rojo vencida... */
export function EstadoCobroBadge({ factura, info, className, compacto }: { factura?: any; info?: InfoCobro; className?: string; compacto?: boolean }) {
    const i = info || infoCobro(factura)
    const Icono = ICONOS[i.visual]
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset whitespace-nowrap', ESTILOS[i.visual], className)}>
            <Icono className="h-3 w-3" />
            {compacto && i.visual === 'pagada' ? 'Pagada' : i.etiqueta}
        </span>
    )
}

/** Barra de progreso cobrado/total. */
export function BarraCobro({ info }: { info: InfoCobro }) {
    const pct = info.total > 0 ? Math.min(100, Math.round((info.cobrado / info.total) * 100)) : 0
    return (
        <div className="w-full">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-300', info.estado === 'pagada' ? 'bg-emerald-500' : 'bg-sky-500')} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">{formatCurrency(info.cobrado)} de {formatCurrency(info.total)}</p>
        </div>
    )
}

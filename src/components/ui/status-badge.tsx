import { Check, Clock, Send, Eye, X, AlertTriangle, FileEdit, ArrowRightCircle, CircleDollarSign, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export type StatusKey =
    | "borrador"
    | "enviado"
    | "visto"
    | "aceptado"
    | "rechazado"
    | "caducado"
    | "pendiente"
    | "traspasado"
    | "facturado"
    | "pagada"
    | "parcial"
    | "vencida"
    | "anulada"
    | "confirmado"
    | "fallido"
    | "reembolsado"

const STATUS_CONFIG: Record<StatusKey, { label: string; icon: React.ElementType; className: string }> = {
    borrador: { label: "Borrador", icon: FileEdit, className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
    enviado: { label: "Enviado", icon: Send, className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900" },
    visto: { label: "Visto", icon: Eye, className: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-900" },
    aceptado: { label: "Aceptado", icon: Check, className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
    rechazado: { label: "Rechazado", icon: X, className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900" },
    caducado: { label: "Caducado", icon: AlertTriangle, className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
    pendiente: { label: "Pendiente", icon: Clock, className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
    traspasado: { label: "Traspasado", icon: ArrowRightCircle, className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900" },
    facturado: { label: "Facturado", icon: CircleDollarSign, className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
    pagada: { label: "Pagada", icon: Check, className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
    parcial: { label: "Cobro parcial", icon: Clock, className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
    vencida: { label: "Vencida", icon: AlertTriangle, className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900" },
    anulada: { label: "Anulada", icon: XCircle, className: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" },
    confirmado: { label: "Confirmado", icon: Check, className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
    fallido: { label: "Fallido", icon: X, className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900" },
    reembolsado: { label: "Reembolsado", icon: ArrowRightCircle, className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
}

interface StatusBadgeProps {
    status: string
    label?: string
    className?: string
    size?: "sm" | "md"
}

/** Badge de estado uniforme: icono + texto, nunca solo color (accesible para daltonismo). */
export function StatusBadge({ status, label, className, size = "sm" }: StatusBadgeProps) {
    const key = status?.toLowerCase() as StatusKey
    const config = STATUS_CONFIG[key] ?? {
        label: label || status || "—",
        icon: Clock,
        className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    }
    const Icon = config.icon

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-wide whitespace-nowrap",
                size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-xs",
                config.className,
                className
            )}
        >
            <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {label || config.label}
        </span>
    )
}

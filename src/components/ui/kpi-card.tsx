import Link from "next/link"
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const SCHEMES = {
    blue: { bg: "bg-primary/5", icon: "text-primary", border: "border-primary/10", dot: "bg-primary" },
    orange: { bg: "bg-orange-50 dark:bg-orange-950/40", icon: "text-orange-600 dark:text-orange-400", border: "border-orange-100 dark:border-orange-900", dot: "bg-orange-500" },
    green: { bg: "bg-emerald-50 dark:bg-emerald-950/40", icon: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-100 dark:border-emerald-900", dot: "bg-emerald-500" },
    red: { bg: "bg-rose-50 dark:bg-rose-950/40", icon: "text-rose-600 dark:text-rose-400", border: "border-rose-100 dark:border-rose-900", dot: "bg-rose-500" },
    purple: { bg: "bg-violet-50 dark:bg-violet-950/40", icon: "text-violet-600 dark:text-violet-400", border: "border-violet-100 dark:border-violet-900", dot: "bg-violet-500" },
    slate: { bg: "bg-slate-50 dark:bg-slate-800/60", icon: "text-slate-600 dark:text-slate-300", border: "border-slate-100 dark:border-slate-800", dot: "bg-slate-500" },
} as const

export type KpiScheme = keyof typeof SCHEMES

interface KpiCardProps {
    title: string
    value: string
    subtitle?: string
    icon: LucideIcon
    href?: string
    scheme?: KpiScheme
    /** Variación frente al periodo anterior, en %. Positivo = sube. */
    variation?: number
    /** Si true, una variación positiva se pinta como algo malo (p.ej. "vencido"). */
    invertVariationColor?: boolean
}

/** Tarjeta KPI del dashboard: icono, valor grande, variación opcional, clicable. */
export function KpiCard({ title, value, subtitle, icon: Icon, href, scheme = "blue", variation, invertVariationColor }: KpiCardProps) {
    const current = SCHEMES[scheme]

    const content = (
        <div
            className={cn(
                "metric-card card-hover relative flex flex-col justify-between h-full min-h-[150px] bg-card transition-all overflow-hidden",
                current.border,
                href && "cursor-pointer"
            )}
        >
            <div className="flex justify-between items-start">
                <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shadow-sm", current.bg)}>
                    <Icon className={cn("h-5 w-5", current.icon)} />
                </div>
                {typeof variation === "number" && (
                    <div
                        className={cn(
                            "flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full",
                            (variation >= 0) !== !!invertVariationColor
                                ? "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/50"
                                : "text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/50"
                        )}
                    >
                        {variation >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {Math.abs(variation).toFixed(0)}%
                    </div>
                )}
            </div>

            <div className="mt-6">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{title}</p>
                <h3 className="text-2xl font-extrabold text-foreground tracking-tight font-mono">{value}</h3>
                {subtitle && <p className="text-xs text-muted-foreground mt-1 font-medium">{subtitle}</p>}
            </div>

            <div className={cn("absolute bottom-0 left-0 h-[3px] w-0 group-hover:w-full transition-all duration-500", current.dot)} />
        </div>
    )

    if (!href) return <div className="group">{content}</div>

    return (
        <Link href={href} className="group">
            {content}
        </Link>
    )
}

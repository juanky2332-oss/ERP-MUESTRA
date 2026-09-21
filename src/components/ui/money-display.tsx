import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils"

interface MoneyDisplayProps {
    value: number
    className?: string
    /** "auto" colorea en verde/rojo según signo; "neutral" no colorea. */
    tone?: "auto" | "positive" | "negative" | "neutral"
    size?: "sm" | "md" | "lg"
}

/** Importe monetario con tipografía tabular y color semántico consistente en todo el ERP. */
export function MoneyDisplay({ value, className, tone = "neutral", size = "md" }: MoneyDisplayProps) {
    const resolvedTone = tone === "auto" ? (value < 0 ? "negative" : "positive") : tone

    return (
        <span
            className={cn(
                "font-mono font-bold tabular-nums",
                size === "sm" && "text-xs",
                size === "md" && "text-sm",
                size === "lg" && "text-2xl",
                resolvedTone === "positive" && "text-emerald-700 dark:text-emerald-400",
                resolvedTone === "negative" && "text-rose-700 dark:text-rose-400",
                resolvedTone === "neutral" && "text-foreground",
                className
            )}
        >
            {formatCurrency(value)}
        </span>
    )
}

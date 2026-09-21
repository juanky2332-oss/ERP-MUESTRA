import { type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
    icon: LucideIcon
    title: string
    description?: string
    actionLabel?: string
    onAction?: () => void
    actionHref?: string
    className?: string
}

/** Estado vacío con propósito: explica qué falta y da un CTA claro, nunca una tabla en blanco. */
export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, actionHref, className }: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center text-center py-16 px-6", className)}>
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-5">
                <Icon className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="text-base font-bold text-foreground">{title}</h3>
            {description && (
                <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{description}</p>
            )}
            {actionLabel && (onAction || actionHref) && (
                <Button
                    className="mt-6"
                    onClick={onAction}
                    {...(actionHref ? { asChild: true } : {})}
                >
                    {actionHref ? <a href={actionHref}>{actionLabel}</a> : actionLabel}
                </Button>
            )}
        </div>
    )
}

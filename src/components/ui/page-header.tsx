import Link from "next/link"
import { ChevronRight } from "lucide-react"

interface Crumb {
    label: string
    href?: string
}

interface PageHeaderProps {
    title: string
    description?: string
    breadcrumbs?: Crumb[]
    actions?: React.ReactNode
}

/** Cabecera estándar de sección: breadcrumbs discretos + título + acciones. */
export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
    return (
        <div className="flex flex-col gap-3 mb-6">
            {breadcrumbs && breadcrumbs.length > 0 && (
                <nav className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    {breadcrumbs.map((crumb, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                            {i > 0 && <ChevronRight className="h-3 w-3" />}
                            {crumb.href ? (
                                <Link href={crumb.href} className="hover:text-foreground transition-colors">
                                    {crumb.label}
                                </Link>
                            ) : (
                                <span className="text-foreground font-semibold">{crumb.label}</span>
                            )}
                        </span>
                    ))}
                </nav>
            )}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">{title}</h1>
                    {description && <p className="text-muted-foreground mt-1">{description}</p>}
                </div>
                {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
            </div>
        </div>
    )
}

import { type LucideIcon, Check } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"

interface ComingSoonProps {
    title: string
    description: string
    icon: LucideIcon
    breadcrumbLabel: string
    features: string[]
}

/**
 * Sección "próximamente" para módulos ya presentes en la navegación pero
 * cuyo backend todavía se está construyendo (partes de trabajo, cobros).
 * Muestra el alcance real en vez de una pantalla vacía sin contexto.
 */
export function ComingSoon({ title, description, icon: Icon, breadcrumbLabel, features }: ComingSoonProps) {
    return (
        <div className="space-y-8 max-w-5xl mx-auto animate-in fade-in duration-500">
            <PageHeader
                title={title}
                description={description}
                breadcrumbs={[{ label: "Inicio", href: "/" }, { label: breadcrumbLabel }]}
            />

            <div className="metric-card bg-card overflow-hidden relative border-primary/10">
                <div className="flex flex-col md:flex-row gap-8 md:items-center">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                        <span className="inline-block text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-full mb-2">
                            En construcción
                        </span>
                        <h2 className="text-lg font-extrabold text-foreground">Esta sección está en la hoja de ruta activa</h2>
                        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                            El diseño y la navegación ya están integrados en el ERP. La funcionalidad completa
                            se activa en la siguiente fase de desarrollo.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
                {features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3 p-4 rounded-2xl bg-card border border-border">
                        <div className="h-5 w-5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center shrink-0 mt-0.5">
                            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="text-sm font-medium text-foreground/90">{feature}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

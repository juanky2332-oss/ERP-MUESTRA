'use client'

import { useState } from "react"
import Link from "next/link"
import { Plus, FileText, Box, FileInput, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const ACTIONS = [
    { href: "/presupuestos/new", label: "Nuevo presupuesto", icon: FileText, scheme: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400" },
    { href: "/albaranes/new", label: "Nuevo albarán", icon: Box, scheme: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400" },
    { href: "/facturas/new", label: "Nueva factura", icon: FileInput, scheme: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400" },
    { href: "/gastos/new", label: "Registrar gasto", icon: Receipt, scheme: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400" },
]

interface QuickCreateMenuProps {
    trigger?: React.ReactNode
    className?: string
}

/** Menú "+ Crear" reutilizable: acción primaria del ERP, disponible en topbar y barra móvil. */
export function QuickCreateMenu({ trigger, className }: QuickCreateMenuProps) {
    const [open, setOpen] = useState(false)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                {trigger ?? (
                    <Button className={cn("gap-2 font-bold shadow-lg shadow-primary/20", className)}>
                        <Plus className="h-4 w-4" />
                        Crear
                    </Button>
                )}
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl border-t-0 pb-8">
                <SheetHeader>
                    <SheetTitle>¿Qué quieres crear?</SheetTitle>
                </SheetHeader>
                <div className="grid grid-cols-2 gap-3 px-4 pb-2">
                    {ACTIONS.map((action) => (
                        <Link
                            key={action.href}
                            href={action.href}
                            onClick={() => setOpen(false)}
                            className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all active:scale-95"
                        >
                            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", action.scheme)}>
                                <action.icon className="h-5 w-5" />
                            </div>
                            <span className="text-sm font-bold text-foreground leading-tight">{action.label}</span>
                        </Link>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    )
}

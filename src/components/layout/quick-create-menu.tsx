'use client'

import { useState } from "react"
import Link from "next/link"
import { Plus, FileText, Box, FileInput, Receipt, Users, Truck, Wallet, CalendarPlus, FileSignature } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const ACTIONS = [
    { href: "/contactos?nuevo=1", label: "Cliente", icon: Users, scheme: "text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-200" },
    { href: "/proveedores?nuevo=1", label: "Proveedor", icon: Truck, scheme: "text-teal-600 bg-teal-50 dark:bg-teal-950/40 dark:text-teal-400" },
    { href: "/presupuestos/new", label: "Presupuesto", icon: FileText, scheme: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400" },
    { href: "/albaranes/new", label: "Albarán", icon: Box, scheme: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400" },
    { href: "/facturas/new", label: "Factura", icon: FileInput, scheme: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400" },
    { href: "/gastos/new", label: "Gasto", icon: Receipt, scheme: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400" },
    { href: "/cobros", label: "Cobro", icon: Wallet, scheme: "text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-400" },
    { href: "/agenda?nuevo=1", label: "Evento", icon: CalendarPlus, scheme: "text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-400" },
    { href: "/albaranes-firmados", label: "Albarán o parte firmado", icon: FileSignature, scheme: "text-cyan-700 bg-cyan-50 dark:bg-cyan-950/40 dark:text-cyan-400" },
]

interface QuickCreateMenuProps {
    trigger?: React.ReactNode
    className?: string
}

/** Menú "+ Crear": acción primaria del ERP, disponible en la cabecera y en la barra móvil. */
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
                <div className="grid grid-cols-3 gap-3 px-4 pb-2 max-w-3xl mx-auto w-full">
                    {ACTIONS.map((action) => (
                        <Link
                            key={action.href}
                            href={action.href}
                            onClick={() => setOpen(false)}
                            className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all duration-150 active:scale-95"
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

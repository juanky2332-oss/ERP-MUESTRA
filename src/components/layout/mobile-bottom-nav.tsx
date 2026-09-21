'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Wrench, CircleDollarSign, Menu, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { QuickCreateMenu } from "@/components/layout/quick-create-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { SidebarContent } from "@/components/layout/sidebar"
import { useState } from "react"

/** Barra inferior fija para móvil: las 5 acciones que más usa un técnico en campo. */
export function MobileBottomNav() {
    const pathname = usePathname()
    const [moreOpen, setMoreOpen] = useState(false)

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

    return (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-lg border-t border-border pb-[env(safe-area-inset-bottom)]">
            <div className="grid grid-cols-5 items-center h-16">
                <Link
                    href="/"
                    className={cn(
                        "flex flex-col items-center justify-center gap-1 h-full text-[10px] font-bold",
                        isActive("/") && pathname === "/" ? "text-primary" : "text-muted-foreground"
                    )}
                >
                    <LayoutDashboard className="h-5 w-5" />
                    Inicio
                </Link>
                <Link
                    href="/partes-de-trabajo"
                    className={cn(
                        "flex flex-col items-center justify-center gap-1 h-full text-[10px] font-bold",
                        isActive("/partes-de-trabajo") ? "text-primary" : "text-muted-foreground"
                    )}
                >
                    <Wrench className="h-5 w-5" />
                    Partes
                </Link>

                <div className="flex items-center justify-center">
                    <QuickCreateMenu
                        trigger={
                            <button className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center -translate-y-3 active:scale-90 transition-transform">
                                <Plus className="h-6 w-6" />
                            </button>
                        }
                    />
                </div>

                <Link
                    href="/cobros"
                    className={cn(
                        "flex flex-col items-center justify-center gap-1 h-full text-[10px] font-bold",
                        isActive("/cobros") ? "text-primary" : "text-muted-foreground"
                    )}
                >
                    <CircleDollarSign className="h-5 w-5" />
                    Cobros
                </Link>

                <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                    <SheetTrigger asChild>
                        <button className="flex flex-col items-center justify-center gap-1 h-full text-[10px] font-bold text-muted-foreground">
                            <Menu className="h-5 w-5" />
                            Más
                        </button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-72 bg-sidebar border-none text-white">
                        <SidebarContent collapsed={false} pathname={pathname} onNavigate={() => setMoreOpen(false)} />
                    </SheetContent>
                </Sheet>
            </div>
        </nav>
    )
}

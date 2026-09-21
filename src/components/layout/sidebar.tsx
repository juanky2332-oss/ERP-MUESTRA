'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    LayoutDashboard,
    FileText,
    Box,
    FileInput,
    Receipt,
    Users,
    Calculator,
    Mail,
    ChevronLeft,
    ChevronRight,
    Wrench,
    CircleDollarSign,
    Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface NavItem {
    href: string
    label: string
    icon: React.ElementType
    badge?: string
}

const navItems: NavItem[] = [
    { href: '/', label: 'Resumen', icon: LayoutDashboard },
    { href: '/presupuestos', label: 'Presupuestos', icon: FileText },
    { href: '/albaranes', label: 'Albaranes', icon: Box },
    { href: '/facturas', label: 'Facturas', icon: FileInput },
    { href: '/cobros', label: 'Cobros y vencimientos', icon: CircleDollarSign, badge: 'Nuevo' },
    { href: '/partes-de-trabajo', label: 'Partes de trabajo', icon: Wrench, badge: 'Nuevo' },
    { href: '/gastos', label: 'Gastos', icon: Receipt },
    { href: '/albaranes-firmados', label: 'Alb. Firmados', icon: FileText },
]

const secondaryItems = [
    { href: '/contactos', label: 'Clientes', icon: Users },
    { href: '/calculadora', label: 'Calculadora', icon: Calculator },
    { href: '/emails', label: 'Emails', icon: Mail },
    { href: '/ajustes', label: 'Ajustes', icon: Settings },
]

// 1. EXTRAEMOS LA INTERFAZ AQUÍ ARRIBA
interface SidebarContentProps {
    collapsed: boolean
    pathname: string
    onNavigate?: () => void
}

// 2. EXTRAEMOS EL COMPONENTE SidebarContent PARA QUE ESTÉ FUERA DE Sidebar()
export function SidebarContent({ collapsed, pathname, onNavigate }: SidebarContentProps) {
    return (
        <div className="flex flex-col h-full">
            {/* Logo Area (Modernized) */}
            <div className="h-20 flex items-center px-6 shrink-0">
                <div className="flex items-center gap-3">
                    {!collapsed && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-left-2 duration-500">
                            <h1 className="text-[12px] font-black text-white leading-tight tracking-tight uppercase opacity-90">
                                Empresa<br />X
                            </h1>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation (Linear Style) */}
            <nav className="flex-1 px-4 py-8 space-y-10 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {/* Main Modules */}
                <div className="space-y-1.5">
                    {!collapsed && <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 opacity-70">Sistemas</p>}
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={collapsed ? item.label : undefined}
                                onClick={onNavigate}
                                className={cn(
                                    "flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 group relative overflow-hidden",
                                    isActive
                                        ? "bg-sidebar-primary/10 text-sidebar-primary-foreground shadow-[0_1px_15px_rgba(99,102,241,0.15)] ring-1 ring-sidebar-primary/20"
                                        : "text-sidebar-foreground hover:text-white hover:bg-white/5"
                                )}
                            >
                                <div className={cn(
                                    "absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                )} />
                                <item.icon className={cn(
                                    "h-4.5 w-4.5 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]",
                                    isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70 group-hover:text-white"
                                )} />
                                {!collapsed && <span className="tracking-tight z-10 transition-transform duration-300 group-hover:translate-x-1">{item.label}</span>}
                                {!collapsed && item.badge && !isActive && (
                                    <span className="ml-auto z-10 text-[9px] font-black uppercase tracking-wide bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">
                                        {item.badge}
                                    </span>
                                )}
                                {isActive && !collapsed && (
                                    <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-sidebar-primary animate-pulse z-10" />
                                )}
                            </Link>
                        )
                    })}
                </div>

                {/* Tools */}
                <div className="space-y-1.5">
                    {!collapsed && <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 opacity-70">Operaciones</p>}
                    {secondaryItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={collapsed ? item.label : undefined}
                                onClick={onNavigate}
                                className={cn(
                                    "flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 group relative",
                                    isActive
                                        ? "bg-white text-primary shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-slate-200/50"
                                        : "text-slate-500 hover:text-primary hover:bg-slate-100/40"
                                )}
                            >
                                <item.icon className={cn("h-4.5 w-4.5 shrink-0 transition-colors", isActive ? "text-primary" : "text-slate-400 group-hover:text-primary")} />
                                {!collapsed && <span className="tracking-tight">{item.label}</span>}
                            </Link>
                        )
                    })}
                </div>
            </nav>

            <div className="p-4 bg-transparent border-t border-sidebar-border hidden"></div>
        </div>
    )
}

// 3. DEJAMOS UNA ÚNICA FUNCIÓN Sidebar() FINAL Y LIMPIA
export function Sidebar() {
    const pathname = usePathname()
    const [collapsed, setCollapsed] = useState(false)

    return (
        <aside className={cn(
            "h-screen sticky top-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 z-40 shadow-[1px_0_10px_rgba(0,0,0,0.02)]",
            collapsed ? "w-20" : "w-64"
        )}>
            <SidebarContent collapsed={collapsed} pathname={pathname} />

            <button
                onClick={() => setCollapsed(!collapsed)}
                className="absolute -right-3 top-24 bg-white border border-slate-200 rounded-full p-1.5 shadow-xl hover:bg-slate-50 text-slate-400 hover:text-primary transition-all active:scale-90"
            >
                {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
            </button>
        </aside>
    )
}

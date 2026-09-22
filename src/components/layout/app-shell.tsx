'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    Search,
    User,
    Menu,
    Command,
    FileText,
    LogOut,
    Send,
    Bell,
    Moon,
    Sun,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { AvisoCobros } from '@/components/cobros/aviso-cobros'
import { useEmpresa, useColorEmpresa } from '@/hooks/use-empresa'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { searchGlobal, SearchResult } from '@/actions/search'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Sidebar, SidebarContent } from '@/components/layout/sidebar'
import { Button } from '@/components/ui/button'
import { useGlobalFilter } from '@/components/providers/global-filter-provider'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { QuickCreateMenu } from '@/components/layout/quick-create-menu'

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const { theme, setTheme, resolvedTheme } = useTheme()
    const { data: empresa } = useEmpresa()
    useColorEmpresa(empresa?.color_principal, resolvedTheme === 'dark')

    // Global Search State
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<SearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [showResults, setShowResults] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)

    // Debounced Search Effect
    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)

        if (searchQuery.length >= 2) {
            setIsSearching(true)
            setShowResults(true)
            searchDebounceRef.current = setTimeout(async () => {
                try {
                    const results = await searchGlobal(searchQuery)
                    setSearchResults(results)
                } catch (error) {
                    console.error("Search error:", error)
                    setSearchResults([])
                } finally {
                    setIsSearching(false)
                }
            }, 300)
        } else {
            setSearchResults([])
            setShowResults(false)
        }
    }, [searchQuery])

    // Close results when clicking outside (simple implementation: close on path change)
    useEffect(() => {
        setShowResults(false)
    }, [pathname])

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar (Desktop) */}
            <div className="hidden md:flex">
                <Sidebar />
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Modern Header with Glassmorphism */}
                <header className="h-16 md:h-20 glass sticky top-0 z-30 flex items-center justify-between px-4 md:px-8 border-b border-border shadow-sm">
                    {/* Mobile Menu Toggle (Visible only on mobile) */}
                    <div className="md:hidden flex items-center gap-3">
                        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="rounded-xl">
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="p-0 w-72 bg-sidebar border-none text-white">
                                <SidebarContent
                                    collapsed={false}
                                    pathname={pathname}
                                    onNavigate={() => setMobileMenuOpen(false)}
                                />
                            </SheetContent>
                        </Sheet>
                        {empresa?.logo_app_url && <img src={empresa.logo_app_url} alt="" className="h-7 w-7 rounded-lg object-contain" />}
                        <span className="font-extrabold text-sm tracking-tighter uppercase truncate max-w-[150px]">{empresa?.nombre_comercial || empresa?.nombre || 'Empresa X'}</span>
                    </div>

                    {/* Sophisticated Search Bar (Command Palette Style) */}
                    <div className="flex-1 max-w-2xl mx-auto hidden md:block relative">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors duration-300" />
                            <input
                                type="text"
                                placeholder="Busca cualquier documento o cliente..."
                                className="w-full pl-12 pr-14 py-3 bg-muted/60 border border-border rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/40 focus:bg-background transition-all duration-200 placeholder:text-muted-foreground shadow-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => {
                                    if (searchResults.length > 0) setShowResults(true)
                                }}
                            />
                            {/* kbd badge removed */}
                        </div>

                        {/* Redesigned Search Results Dropdown */}
                        {showResults && (searchResults.length > 0 || searchQuery.length >= 2) && (
                            <div className="absolute top-full mt-3 left-0 w-full bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_70px_-10px_rgba(0,0,0,0.1)] border border-slate-200/60 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                                {searchResults.length > 0 ? (
                                    <div className="p-2 divide-y divide-slate-50 max-h-[450px] overflow-y-auto custom-scrollbar">
                                        {searchResults.map((result) => (
                                            <div
                                                key={`${result.type}-${result.id}`}
                                                className="p-4 hover:bg-slate-50/80 cursor-pointer rounded-xl transition-all duration-200 group flex items-center justify-between"
                                                onClick={() => {
                                                    router.push(result.url)
                                                    setShowResults(false)
                                                    setSearchQuery('')
                                                }}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={cn(
                                                        "h-10 w-10 rounded-xl flex items-center justify-center shadow-sm ring-1 ring-inset",
                                                        result.type === 'factura' ? "bg-emerald-50 text-emerald-600 ring-emerald-100" :
                                                            result.type === 'presupuesto' ? "bg-blue-50 text-blue-600 ring-blue-100" :
                                                                result.type === 'albaran' ? "bg-amber-50 text-amber-600 ring-amber-100" :
                                                                    "bg-slate-50 text-slate-600 ring-slate-100"
                                                    )}>
                                                        <FileText className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-slate-900">{result.numero}</span>
                                                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{result.type}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 font-medium mt-0.5">{result.client}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-extrabold text-slate-900 block font-mono">
                                                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(result.total)}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase mt-1 block">
                                                        {format(new Date(result.date), "dd MMM yyyy", { locale: es })}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : searchQuery.length >= 2 && !isSearching && (
                                    <div className="p-12 text-center">
                                        <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                            <Command className="h-6 w-6 text-slate-300" />
                                        </div>
                                        <p className="text-sm font-bold text-slate-900">No hay coincidencias</p>
                                        <p className="text-xs text-slate-400 font-medium mt-1">Prueba con otro número o nombre de cliente</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 md:gap-2">
                        <div className="hidden md:block">
                            <QuickCreateMenu />
                        </div>

                        <Link
                            href="/ajustes#telegram"
                            title="Conectar Telegram"
                            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40 transition-colors"
                        >
                            <Send className="h-3.5 w-3.5" />
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500" />
                            </span>
                        </Link>

                        <Button variant="ghost" size="icon" className="rounded-xl text-muted-foreground" title="Cambiar tema claro/oscuro"
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                            <Sun className="h-4 w-4 hidden dark:block" />
                            <Moon className="h-4 w-4 dark:hidden" />
                        </Button>

                        <Link href="/cobros" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted" title="Cobros y vencimientos">
                            <Bell className="h-4 w-4" />
                        </Link>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-muted-foreground hover:text-foreground rounded-xl"
                            onClick={async () => {
                                const supabase = createClient()
                                await supabase.auth.signOut()
                                router.push('/login')
                                router.refresh()
                            }}
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="hidden sm:inline text-sm font-medium">Cerrar sesión</span>
                        </Button>
                    </div>
                </header>

                <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8 lg:p-10 pb-24 md:pb-12">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>

            <MobileBottomNav />
            <AvisoCobros />
        </div>
    )
}


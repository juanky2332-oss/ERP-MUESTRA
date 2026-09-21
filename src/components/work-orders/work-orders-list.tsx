'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search, Plus, Wrench, ArrowRight, AlertTriangle } from 'lucide-react'

import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { MoneyDisplay } from '@/components/ui/money-display'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface WorkOrderRow {
    id: string
    numero: string
    service_date: string | null
    cliente_razon_social: string
    tecnico_nombre: string | null
    status: string
    total: number
    missing_information: string | null
    related_delivery_note_id: string | null
}

const TABS = [
    { value: 'todos', label: 'Todos' },
    { value: 'abiertos', label: 'Abiertos' },
    { value: 'pendiente_informacion', label: 'Falta información' },
    { value: 'convertido', label: 'Convertidos' },
]

export function WorkOrdersList({ workOrders }: { workOrders: WorkOrderRow[] }) {
    const [search, setSearch] = useState('')
    const [tab, setTab] = useState('todos')

    const filtered = workOrders.filter(w => {
        if (tab === 'abiertos' && ['convertido', 'cancelado'].includes(w.status)) return false
        if (tab === 'pendiente_informacion' && w.status !== 'pendiente_informacion') return false
        if (tab === 'convertido' && w.status !== 'convertido') return false
        if (search && !`${w.numero} ${w.cliente_razon_social} ${w.tecnico_nombre || ''}`.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })

    return (
        <div className="space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-500">
            <PageHeader
                title="Partes de trabajo"
                description="Intervenciones de campo, listas para convertir en albarán."
                breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Partes de trabajo' }]}
                actions={
                    <Link href="/partes-de-trabajo/new">
                        <Button className="gap-2 font-bold">
                            <Plus className="h-4 w-4" /> Nuevo parte
                        </Button>
                    </Link>
                }
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Tabs value={tab} onValueChange={setTab}>
                    <TabsList className="bg-muted/50 p-1 rounded-xl h-auto flex-wrap">
                        {TABS.map(t => (
                            <TabsTrigger key={t.value} value={t.value} className="rounded-lg text-xs font-bold uppercase px-4 py-2">
                                {t.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por referencia, cliente o técnico..." className="pl-9 w-full sm:w-[280px]" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="bg-card border border-border rounded-3xl">
                    <EmptyState
                        icon={Wrench}
                        title="No hay partes de trabajo todavía"
                        description="Crea el primero para empezar a registrar intervenciones de campo."
                        actionLabel="Nuevo parte de trabajo"
                        actionHref="/partes-de-trabajo/new"
                    />
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(w => (
                        <Link
                            key={w.id}
                            href={`/partes-de-trabajo/${w.id}`}
                            className={cn(
                                'metric-card bg-card card-hover flex flex-col gap-3',
                                w.status === 'pendiente_informacion' && 'border-amber-300 dark:border-amber-800'
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-sm font-extrabold text-foreground">{w.numero}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{w.cliente_razon_social}</p>
                                </div>
                                <StatusBadge status={w.status} />
                            </div>

                            {w.status === 'pendiente_informacion' && w.missing_information && (
                                <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-1.5">
                                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                    <span className="line-clamp-2">{w.missing_information}</span>
                                </div>
                            )}

                            <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-2 border-t border-border">
                                <span>{w.service_date ? format(new Date(w.service_date), "d MMM yyyy", { locale: es }) : 'Sin fecha'}{w.tecnico_nombre ? ` · ${w.tecnico_nombre}` : ''}</span>
                                <div className="flex items-center gap-1 font-bold text-foreground">
                                    <MoneyDisplay value={Number(w.total)} size="sm" />
                                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

'use client'

import { useState, useEffect } from 'react'
import { useBudgets } from '@/hooks/use-budgets'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { FileText, Trash2, Plus, Loader2, Search, Edit, Check, Mail, XCircle, ArrowRight, CheckCircle2, PieChart, Euro, FileEdit, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal'
import { cn, formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { SortableHeader } from '@/components/ui/sortable-header'
import { useGlobalFilter } from '@/components/providers/global-filter-provider'
import { GlobalDateSelector } from '@/components/ui/global-date-selector'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export default function PresupuestosPage() {
    const { month, year } = useGlobalFilter()

    // Local state for Tabs (Status Filter)
    const [activeTab, setActiveTab] = useState('all') // 'all', 'PENDIENTE', 'TRASPASADO', 'ENVIADO'
    const [search, setSearch] = useState('')
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
    const [page, setPage] = useState(1)
    const pageSize = 10
    const queryClient = useQueryClient()
    const [editingBudget, setEditingBudget] = useState<any>(null)
    const [editOpen, setEditOpen] = useState(false)

    // Hook now accepts month/year separately
    const { budgets, totalCount, stats, counters, isLoading, createBudget, updateBudget } = useBudgets({
        page,
        pageSize,
        search,
        filter: activeTab, // Map Tab to Filter
        month,
        year,
        sortConfig
    })

    const totalPages = Math.ceil(totalCount / pageSize)

    const handleSort = (key: string) => {
        setSortConfig(current => ({
            key,
            direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }))
    }

    const handleStatusUpdate = (budget: any, newStatus: string, value?: boolean) => {
        const currentStatuses = new Set(budget.statuses || [])

        if (newStatus === 'ENVIADO') {
            if (value) currentStatuses.add('enviado')
            else currentStatuses.delete('enviado')
        } else if (newStatus === 'PENDIENTE') {
            // PENDIENTE and TRASPASADO are mutually exclusive
            currentStatuses.delete('traspasado')
            currentStatuses.add('pendiente')
        } else if (newStatus === 'TRASPASADO') {
            // TRASPASADO and PENDIENTE are mutually exclusive
            currentStatuses.delete('pendiente')
            currentStatuses.add('traspasado')
        }

        updateBudget.mutate({
            id: budget.id,
            statuses: Array.from(currentStatuses)
        })
    }

    return (
        <>
            <div className="space-y-6 max-w-[1600px] w-full mx-auto px-6 py-8 animate-in fade-in duration-500">
                {/* Header: KPIs + Global Date Selector */}
                <div className="flex flex-col gap-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Presupuestos</h1>
                            <p className="text-slate-500 mt-1">Gestión y seguimiento de ofertas comerciales</p>
                        </div>

                        <div className="flex items-center gap-4">
                            <GlobalDateSelector />
                            <Link href="/presupuestos/new">
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 transition-all hover:scale-105 active:scale-95 font-bold">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Nuevo Presupuesto
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <h3 className="tracking-tight text-sm font-medium text-slate-500">Total Ofertado</h3>
                                <Euro className="h-4 w-4 text-slate-400" />
                            </div>
                            <div className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalOfertado)}</div>
                            <p className="text-xs text-slate-500 mt-1">En el periodo seleccionado</p>
                        </Card>
                        <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <h3 className="tracking-tight text-sm font-medium text-slate-500">Total Aceptado</h3>
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.totalAceptado)}</div>
                            <p className="text-xs text-emerald-600/80 mt-1">Presupuestos traspasados</p>
                        </Card>
                        <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <h3 className="tracking-tight text-sm font-medium text-slate-500">Tasa de Conversión</h3>
                                <PieChart className="h-4 w-4 text-blue-500" />
                            </div>
                            <div className="text-2xl font-bold text-blue-600">
                                {stats.totalOfertado > 0 ? ((stats.totalAceptado / stats.totalOfertado) * 100).toFixed(1) : 0}%
                            </div>
                            <p className="text-xs text-blue-600/80 mt-1">Éxito comercial</p>
                        </Card>
                    </div>
                </div>

                {/* Filter Tabs */}
                <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setPage(1); }} className="w-full">
                    <div className="flex items-center justify-between mb-4">
                        <TabsList className="bg-slate-100/50 p-1 rounded-xl h-auto flex-wrap">
                            <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                Todos <span className="ml-2 bg-slate-200 text-slate-600 py-0.5 px-2 rounded-full text-[10px]">{counters?.all || 0}</span>
                            </TabsTrigger>
                            <TabsTrigger value="PENDIENTE" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                Pendientes <span className="ml-2 bg-amber-100 text-amber-700 py-0.5 px-2 rounded-full text-[10px]">{counters?.pendiente || 0}</span>
                            </TabsTrigger>
                            <TabsTrigger value="TRASPASADO" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                Traspasados <span className="ml-2 bg-emerald-100 text-emerald-700 py-0.5 px-2 rounded-full text-[10px]">{counters?.traspasado || 0}</span>
                            </TabsTrigger>
                            <TabsTrigger value="ENVIADO" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                Enviados <span className="ml-2 bg-blue-100 text-blue-700 py-0.5 px-2 rounded-full text-[10px]">{counters?.enviado || 0}</span>
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar presupuesto..."
                                    className="pl-9 w-[250px] bg-white border-slate-200 focus:border-blue-500 transition-all font-medium"
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                />
                            </div>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                                        <TableHead className="w-[120px]"><SortableHeader label="Número" columnKey="numero" currentSort={sortConfig} onSort={(k, d) => handleSort(k)} /></TableHead>
                                        <TableHead className="w-[120px]"><SortableHeader label="Fecha" columnKey="fecha" currentSort={sortConfig} onSort={(k, d) => handleSort(k)} /></TableHead>
                                        <TableHead className="w-[300px]"><SortableHeader label="Cliente" columnKey="cliente_razon_social" currentSort={sortConfig} onSort={(k, d) => handleSort(k)} /></TableHead>
                                        <TableHead className="hidden md:table-cell">Concepto</TableHead>
                                        <TableHead className="text-right w-[120px]">Imp. Base</TableHead>
                                        <TableHead className="text-right w-[120px]">IVA</TableHead>
                                        <TableHead className="text-right w-[120px]"><SortableHeader label="Total" columnKey="total" currentSort={sortConfig} onSort={(k, d) => handleSort(k)} /></TableHead>
                                        <TableHead className="w-[150px]">Estado</TableHead>
                                        <TableHead className="w-[180px] text-center">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {budgets.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center h-32 text-slate-500">
                                                No se encontraron presupuestos
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        budgets.map((budget) => (
                                            <TableRow key={budget.id} className="hover:bg-slate-50/80 transition-colors group">
                                                <TableCell className="font-bold text-slate-700">{budget.numero}</TableCell>
                                                <TableCell className="text-slate-600">{format(new Date(budget.fecha), 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-slate-900">{budget.cliente_razon_social}</span>
                                                        {budget.pedido_referencia && <span className="text-xs text-slate-400">Ref: {budget.pedido_referencia}</span>}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell text-sm text-slate-500 max-w-[200px] truncate" title={budget.lineas?.[0]?.descripcion || budget.descripcion || ''}>
                                                    {budget.lineas?.[0]?.descripcion || budget.descripcion || '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-slate-600">{formatCurrency(budget.base_imponible)}</TableCell>
                                                <TableCell className="text-right font-mono text-slate-500 text-xs">{formatCurrency(budget.iva_importe)}</TableCell>
                                                <TableCell className="text-right font-bold font-mono text-slate-900">{formatCurrency(budget.total)}</TableCell>
                                                <TableCell>
                                                    {/* STATUS FLAGS VISUALIZATION */}
                                                    <div className="flex flex-col gap-1 items-start">
                                                        {budget.statuses?.includes('traspasado') && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 shadow-none font-bold">Traspasado</Badge>}
                                                        {budget.statuses?.includes('pendiente') && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 shadow-none font-bold">Pendiente</Badge>}
                                                        {budget.statuses?.includes('enviado') && <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 shadow-none font-bold">Enviado</Badge>}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center justify-center gap-2">
                                                        <DocumentPreviewModal
                                                            document={budget}
                                                            type="presupuesto"
                                                            onGenerate={async () => {
                                                                const { generatePDF } = await import('@/lib/pdf-generator')
                                                                const blobUrl = await generatePDF(budget, 'presupuesto', 'preview')
                                                                return blobUrl as string
                                                            }}
                                                        />

                                                        {/* Edit Dialog – Estado + Datos */}
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600" onClick={() => { setEditingBudget({ ...budget, lineas: budget.lineas ? JSON.parse(JSON.stringify(budget.lineas)) : [] }); setEditOpen(true) }}>
                                                            <FileEdit className="h-4 w-4" />
                                                        </Button>

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                            onClick={async () => {
                                                                if (confirm('¿Eliminar presupuesto irreversiblemente?')) {
                                                                    const { deleteDocument } = await import('@/actions/documents')
                                                                    const res = await deleteDocument(budget.id, 'presupuesto')
                                                                    if (res.success) {
                                                                        toast.success('Presupuesto eliminado')
                                                                        queryClient.invalidateQueries({ queryKey: ['budgets'] })
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {totalPages > 1 && (
                        <div className="mt-6 flex justify-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="flex items-center px-4 font-medium text-sm text-slate-600">
                                Página {page} de {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </Tabs>
            </div >

            {/* Full Edit Dialog - Estado + Datos del documento */}
            < Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingBudget(null) }
            }>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Editar Presupuesto {editingBudget?.numero}</DialogTitle>
                        <DialogDescription>Modifica el estado y los datos del presupuesto.</DialogDescription>
                    </DialogHeader>
                    {editingBudget && (
                        <div className="grid gap-6 py-2">
                            {/* ESTADO */}
                            <div className="border rounded-xl p-4 bg-slate-50 space-y-3">
                                <p className="font-bold text-sm text-slate-700 uppercase tracking-wide">Estado</p>
                                <div className="flex items-center justify-between p-3 border rounded-lg bg-white">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-900">Enviado</span>
                                        <span className="text-xs text-slate-500">Marcado como enviado al cliente</span>
                                    </div>
                                    <Switch
                                        checked={editingBudget.statuses?.includes('enviado')}
                                        onCheckedChange={(checked) => { handleStatusUpdate(editingBudget, 'ENVIADO', checked); setEditingBudget({ ...editingBudget, statuses: checked ? [...(editingBudget.statuses || []), 'enviado'] : (editingBudget.statuses || []).filter((s: string) => s !== 'enviado') }) }}
                                    />
                                </div>
                                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-amber-50 cursor-pointer" onClick={() => { handleStatusUpdate(editingBudget, 'PENDIENTE'); setEditingBudget({ ...editingBudget, statuses: ['pendiente'] }) }}>
                                    <Label className="font-bold cursor-pointer">Pendiente</Label>
                                    <div className={`w-4 h-4 border-2 rounded-full ${editingBudget.statuses?.includes('pendiente') ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`} />
                                </div>
                                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-emerald-50 cursor-pointer" onClick={() => { handleStatusUpdate(editingBudget, 'TRASPASADO'); setEditingBudget({ ...editingBudget, statuses: ['traspasado'] }) }}>
                                    <Label className="font-bold text-emerald-900 cursor-pointer">Traspasado</Label>
                                    <div className={`w-4 h-4 border-2 rounded-full ${editingBudget.statuses?.includes('traspasado') ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`} />
                                </div>
                            </div>

                            {/* DATOS */}
                            <div className="border rounded-xl p-4 space-y-4">
                                <p className="font-bold text-sm text-slate-700 uppercase tracking-wide">Datos del Documento</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-xs text-slate-500 font-bold uppercase">Fecha</Label>
                                        <Input type="date" value={editingBudget.fecha ? editingBudget.fecha.split('T')[0] : ''} onChange={e => setEditingBudget({ ...editingBudget, fecha: e.target.value })} className="mt-1" />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-slate-500 font-bold uppercase">Su Referencia / Pedido</Label>
                                        <Input value={editingBudget.pedido_referencia || ''} onChange={e => setEditingBudget({ ...editingBudget, pedido_referencia: e.target.value })} placeholder="Referencia del cliente..." className="mt-1" />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500 font-bold uppercase">Observaciones</Label>
                                    <textarea value={editingBudget.observaciones || ''} onChange={e => setEditingBudget({ ...editingBudget, observaciones: e.target.value })} placeholder="Notas adicionales..." className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                                </div>
                                {/* Líneas */}
                                <div>
                                    <Label className="text-xs text-slate-500 font-bold uppercase mb-2 block">Líneas</Label>
                                    {(editingBudget.lineas || []).map((linea: any, idx: number) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-center">
                                            <Input className="col-span-6" placeholder="Descripción" value={linea.descripcion || ''} onChange={e => { const l = [...editingBudget.lineas]; l[idx] = { ...l[idx], descripcion: e.target.value }; setEditingBudget({ ...editingBudget, lineas: l }) }} />
                                            <Input className="col-span-2 text-center" type="number" step="0.01" placeholder="Cant." value={linea.cantidad || ''} onChange={e => { const l = [...editingBudget.lineas]; l[idx] = { ...l[idx], cantidad: e.target.value }; setEditingBudget({ ...editingBudget, lineas: l }) }} />
                                            <Input className="col-span-3 text-right" type="number" step="0.01" placeholder="Precio" value={linea.precio_unitario || ''} onChange={e => { const l = [...editingBudget.lineas]; l[idx] = { ...l[idx], precio_unitario: e.target.value }; setEditingBudget({ ...editingBudget, lineas: l }) }} />
                                            <Button type="button" variant="ghost" size="icon" className="col-span-1 text-rose-500" onClick={() => { const l = editingBudget.lineas.filter((_: any, i: number) => i !== idx); setEditingBudget({ ...editingBudget, lineas: l }) }}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingBudget({ ...editingBudget, lineas: [...(editingBudget.lineas || []), { descripcion: '', cantidad: 1, precio_unitario: 0 }] })}>
                                        <Plus className="h-4 w-4 mr-1" /> Añadir línea
                                    </Button>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2 border-t">
                                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
                                    const lineas = editingBudget.lineas || []
                                    const base = lineas.reduce((acc: number, l: any) => acc + (Number(l.cantidad) * Number(l.precio_unitario)), 0)
                                    const ivaPct = Number(editingBudget.iva_porcentaje) || 21
                                    const ivaImporte = base * (ivaPct / 100)
                                    const total = base + ivaImporte
                                    updateBudget.mutate({ id: editingBudget.id, fecha: editingBudget.fecha, pedido_referencia: editingBudget.pedido_referencia, observaciones: editingBudget.observaciones, lineas, base_imponible: base, iva_importe: ivaImporte, total }, { onSuccess: () => setEditOpen(false) })
                                }}>Guardar Cambios</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog >
        </>
    )
}

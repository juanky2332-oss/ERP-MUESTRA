'use client'

import { useState, useEffect } from 'react'
import { FileEdit, ChevronsUpDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { FileText, Trash2, Plus, Loader2, Search, AlertCircle, Check, Mail, Edit, PiggyBank } from 'lucide-react'
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import { SortableHeader } from '@/components/ui/sortable-header'
import { useGlobalFilter } from '@/components/providers/global-filter-provider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GlobalDateSelector } from '@/components/ui/global-date-selector'
import { toast } from 'sonner'
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useInvoices } from '@/hooks/use-invoices'

export default function FacturasPage() {
    const { month, year } = useGlobalFilter()
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [activeTab, setActiveTab] = useState<string>('all')
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
    const pageSize = 10
    const queryClient = useQueryClient()
    const [editingDoc, setEditingDoc] = useState<any>(null)
    const [editOpen, setEditOpen] = useState(false)

    // ===== NUEVO: Estados para selector de empresas =====
    const [clients, setClients] = useState<any[]>([])
    const [clientSearchOpen, setClientSearchOpen] = useState(false)
    const [clientFilter, setClientFilter] = useState('')

    // Cargar lista de empresas cuando se abre el diálogo de edición
    useEffect(() => {
        if (!editOpen) return
        const fetchClients = async () => {
            const fields = 'cliente_id, cliente_razon_social, cliente_cif, cliente_direccion, cliente_email, cliente_telefono'
            const [r1, r2, r3] = await Promise.all([
                supabase.from('albaranes').select(fields),
                supabase.from('facturas').select(fields),
                supabase.from('presupuestos').select(fields),
            ])
            const all = [...(r1.data || []), ...(r2.data || []), ...(r3.data || [])]
            const map = new Map<string, any>()
            all.forEach(row => {
                const key = row.cliente_id || row.cliente_razon_social
                if (key && row.cliente_razon_social) {
                    if (!map.has(key) || (row.cliente_cif && !map.get(key).cliente_cif)) {
                        map.set(key, row)
                    }
                }
            })
            setClients(
                Array.from(map.values()).sort((a, b) =>
                    (a.cliente_razon_social || '').localeCompare(b.cliente_razon_social || '')
                )
            )
        }
        fetchClients()
    }, [editOpen])
    // ===== FIN NUEVO =====

    const { facturas, totalCount, stats, counters, isLoading, updateInvoice } = useInvoices({
        page,
        pageSize,
        search,
        filter: activeTab,
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

    const handleStatusUpdate = (doc: any, newStatus: string, value?: boolean) => {
        const currentStatuses = new Set(doc.statuses || [])

        if (newStatus === 'ENVIADA') {
            if (value) currentStatuses.add('enviado')
            else currentStatuses.delete('enviado')
        } else if (newStatus === 'PAGADA') {
            currentStatuses.add('pagada')
            currentStatuses.delete('pendiente')
        } else if (newStatus === 'PENDIENTE') {
            currentStatuses.add('pendiente')
            currentStatuses.delete('pagada')
        }

        updateInvoice.mutate({
            id: doc.id,
            statuses: Array.from(currentStatuses)
        })
    }

    // Calculated derived stat
    const totalPendiente = stats.totalFacturado - stats.totalCobrado

    // ===== NUEVO: Empresas filtradas para el buscador =====
    const filteredClients = clients.filter(c =>
        c.cliente_razon_social?.toLowerCase().includes(clientFilter.toLowerCase()) ||
        c.cliente_cif?.toLowerCase().includes(clientFilter.toLowerCase())
    )
    // ===== FIN NUEVO =====

    return (
        <>
            <div className="space-y-6 max-w-[1600px] w-full mx-auto px-6 py-8 animate-in fade-in duration-500">
                {/* Header Section */}
                <div className="flex flex-col gap-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Facturas</h1>
                            <p className="text-slate-500 mt-1">Emisión y control de facturación</p>
                        </div>

                        <div className="flex items-center gap-4">
                            <GlobalDateSelector />
                            <Link href="/facturas/new">
                                <Button className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 transition-all hover:scale-105 active:scale-95 font-bold">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Nueva Factura
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {/* Metrics Section */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <h3 className="tracking-tight text-sm font-medium text-slate-500">Total Facturado</h3>
                                <FileText className="h-4 w-4 text-green-400" />
                            </div>
                            <div className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalFacturado)}</div>
                            <p className="text-xs text-slate-500 mt-1">Ingresos brutos</p>
                        </Card>

                        <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <h3 className="tracking-tight text-sm font-medium text-slate-500">Total Cobrado</h3>
                                <PiggyBank className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.totalCobrado)}</div>
                            <p className="text-xs text-emerald-600/80 mt-1">Pagos recibidos</p>
                        </Card>

                        <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <h3 className="tracking-tight text-sm font-medium text-slate-500">Pendiente de Cobro</h3>
                                <AlertCircle className="h-4 w-4 text-orange-500" />
                            </div>
                            <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalPendiente)}</div>
                            <p className="text-xs text-orange-600/80 mt-1">Facturas sin cobrar</p>
                        </Card>
                    </div>
                </div>

                {/* Tabs & Search */}
                <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setPage(1); }} className="w-full">
                    <div className="flex items-center justify-between mb-4">
                        <TabsList className="bg-slate-100/50 p-1 rounded-xl h-auto flex-wrap">
                            <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                Todas <span className="ml-2 bg-slate-200 text-slate-600 py-0.5 px-2 rounded-full text-[10px]">{counters?.all || 0}</span>
                            </TabsTrigger>
                            <TabsTrigger value="PENDIENTE" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                Pendientes <span className="ml-2 bg-orange-100 text-orange-700 py-0.5 px-2 rounded-full text-[10px]">{counters?.pendiente || 0}</span>
                            </TabsTrigger>
                            <TabsTrigger value="ENVIADA" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                Enviadas <span className="ml-2 bg-blue-100 text-blue-700 py-0.5 px-2 rounded-full text-[10px]">{counters?.enviado || 0}</span>
                            </TabsTrigger>
                            <TabsTrigger value="PAGADA" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                Pagadas <span className="ml-2 bg-emerald-100 text-emerald-700 py-0.5 px-2 rounded-full text-[10px]">{counters?.pagada || 0}</span>
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar factura..."
                                    className="pl-9 w-[250px] bg-white border-slate-200 focus:border-green-500 transition-all font-medium"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value)
                                        setPage(1)
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white border boundary-slate-200 rounded-3xl shadow-xl shadow-slate-200/20 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-50/80 backdrop-blur">
                                <TableRow className="hover:bg-transparent border-b border-slate-100">
                                    <TableHead className="w-[120px]">
                                        <SortableHeader label="Fecha" columnKey="fecha" currentSort={sortConfig} onSort={(k, d) => handleSort(k)} />
                                    </TableHead>
                                    <TableHead>
                                        <SortableHeader label="Número" columnKey="numero" currentSort={sortConfig} onSort={(k, d) => handleSort(k)} />
                                    </TableHead>
                                    <TableHead>
                                        <SortableHeader label="Cliente" columnKey="cliente_razon_social" currentSort={sortConfig} onSort={(k, d) => handleSort(k)} />
                                    </TableHead>
                                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-400 hidden md:table-cell">Concepto</TableHead>
                                    <TableHead className="text-right font-bold text-xs uppercase tracking-wider text-slate-400">Total</TableHead>
                                    <TableHead className="text-center font-bold text-xs uppercase tracking-wider text-slate-400">Estado</TableHead>
                                    <TableHead className="text-center font-bold text-xs uppercase tracking-wider text-slate-400">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center">
                                            <div className="flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-green-600" /></div>
                                        </TableCell>
                                    </TableRow>
                                ) : facturas?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-slate-400 font-medium">No se encontraron facturas</TableCell>
                                    </TableRow>
                                ) : (
                                    facturas?.map((doc) => (
                                        <TableRow key={doc.id} className="group hover:bg-slate-50/50 transition-colors border-slate-50">
                                            <TableCell className="pl-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-mono text-xs font-bold text-slate-600 capitalize">{format(new Date(doc.fecha), 'MMM yyyy', { locale: es })}</span>
                                                    <span className="font-mono text-xs font-medium text-slate-400">{format(new Date(doc.fecha), 'dd', { locale: es })}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 font-bold text-sm text-slate-900">{doc.numero}</TableCell>
                                            <TableCell className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-xs text-slate-700">{doc.cliente_razon_social}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono mt-0.5">{doc.pedido_referencia || '-'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell max-w-[200px] truncate py-4 text-xs font-medium text-slate-500">
                                                {doc.lineas?.[0]?.descripcion || doc.descripcion || '-'}
                                            </TableCell>
                                            <TableCell className="text-right py-4 pr-6">
                                                <span className="font-mono text-sm font-bold text-green-700">
                                                    {formatCurrency(doc.total)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-4 text-center">
                                                <div className="flex flex-col gap-1 items-center">
                                                    {doc.statuses?.includes('pagada') && (
                                                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-bold text-[10px]"><Check className="w-3 h-3 mr-1" /> PAGADA</Badge>
                                                    )}
                                                    {doc.statuses?.includes('pendiente') && (
                                                        <Badge className="bg-orange-50 text-orange-700 border-orange-200 font-bold text-[10px]">PENDIENTE</Badge>
                                                    )}
                                                    {doc.statuses?.includes('enviado') && (
                                                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-bold text-[10px]"><Mail className="w-3 h-3 mr-1" /> ENVIADA</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 text-center grid place-items-center">
                                                <div className="flex items-center gap-1">
                                                    <DocumentPreviewModal
                                                        document={doc}
                                                        type="factura"
                                                        onGenerate={async () => {
                                                            const { generatePDF } = await import('@/lib/pdf-generator')
                                                            const blobUrl = await generatePDF(doc, 'factura', 'preview')
                                                            return blobUrl as string
                                                        }}
                                                    />
                                                    <div className="flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
                                                        {/* Edit Button */}
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600" onClick={() => { setEditingDoc({ ...doc, lineas: doc.lineas ? JSON.parse(JSON.stringify(doc.lineas)) : [] }); setEditOpen(true) }}>
                                                            <FileEdit className="h-4 w-4" />
                                                        </Button>

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                            onClick={async () => {
                                                                if (confirm('¿Eliminar factura irreversiblemente?')) {
                                                                    const { deleteDocument } = await import('@/actions/documents')
                                                                    const res = await deleteDocument(doc.id, 'factura')
                                                                    if (res.success) {
                                                                        toast.success('Factura eliminada')
                                                                        queryClient.invalidateQueries({ queryKey: ['facturas'] })
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Tabs>

                {/* Pagination Controls */}
                {!isLoading && totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-8">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
                        <span className="text-xs font-bold text-slate-400 px-2">{page} de {totalPages}</span>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Siguiente</Button>
                    </div>
                )}
            </div>

            {/* Full Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditingDoc(null); setClientFilter(''); setClientSearchOpen(false) } }}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Editar Factura {editingDoc?.numero}</DialogTitle>
                        <DialogDescription>Modifica el estado y los datos de la factura.</DialogDescription>
                    </DialogHeader>
                    {editingDoc && (
                        <div className="grid gap-6 py-2">
                            <div className="border rounded-xl p-4 bg-slate-50 space-y-3">
                                <p className="font-bold text-sm text-slate-700 uppercase tracking-wide">Estado</p>
                                <div className="flex items-center justify-between p-3 border rounded-lg bg-white">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-900">Enviada</span>
                                        <span className="text-xs text-slate-500">Marcada como enviada al cliente</span>
                                    </div>
                                    <Switch checked={editingDoc.statuses?.includes('enviado')} onCheckedChange={(checked) => { handleStatusUpdate(editingDoc, 'ENVIADA', checked); setEditingDoc({ ...editingDoc, statuses: checked ? [...(editingDoc.statuses || []), 'enviado'] : (editingDoc.statuses || []).filter((s: string) => s !== 'enviado') }) }} />
                                </div>
                                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-emerald-50 cursor-pointer" onClick={() => { handleStatusUpdate(editingDoc, 'PAGADA'); setEditingDoc({ ...editingDoc, statuses: ['pagada'] }) }}>
                                    <Label className="font-bold text-emerald-900 cursor-pointer">Pagada</Label>
                                    <div className={`w-4 h-4 border-2 rounded-full ${editingDoc.statuses?.includes('pagada') ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`} />
                                </div>
                                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-orange-50 cursor-pointer" onClick={() => { handleStatusUpdate(editingDoc, 'PENDIENTE'); setEditingDoc({ ...editingDoc, statuses: ['pendiente'] }) }}>
                                    <Label className="font-bold cursor-pointer">Pendiente</Label>
                                    <div className={`w-4 h-4 border-2 rounded-full ${editingDoc.statuses?.includes('pendiente') ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`} />
                                </div>
                            </div>
                            <div className="border rounded-xl p-4 space-y-4">
                                <p className="font-bold text-sm text-slate-700 uppercase tracking-wide">Datos del Documento</p>

                                {/* ===== NUEVO: Selector de Empresa ===== */}
                                <div>
                                    <Label className="text-xs text-slate-500 font-bold uppercase">Cambiar Empresa</Label>
                                    <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between mt-1 font-normal h-10">
                                                <span className="truncate">{editingDoc.cliente_razon_social || 'Seleccionar empresa...'}</span>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                            <div className="p-2 border-b">
                                                <Input
                                                    placeholder="Buscar por nombre o CIF..."
                                                    value={clientFilter}
                                                    onChange={(e) => setClientFilter(e.target.value)}
                                                    autoFocus
                                                />
                                            </div>
                                            <div className="max-h-[220px] overflow-y-auto">
                                                {filteredClients.length === 0 ? (
                                                    <div className="px-3 py-6 text-center text-sm text-slate-400">No se encontraron empresas</div>
                                                ) : (
                                                    filteredClients.map((client, idx) => (
                                                        <div
                                                            key={client.cliente_id || idx}
                                                            className={cn(
                                                                "px-3 py-2.5 cursor-pointer transition-colors hover:bg-green-50 border-b border-slate-50 last:border-0",
                                                                editingDoc.cliente_razon_social === client.cliente_razon_social && "bg-green-50"
                                                            )}
                                                            onClick={() => {
                                                                setEditingDoc({
                                                                    ...editingDoc,
                                                                    cliente_id: client.cliente_id,
                                                                    cliente_razon_social: client.cliente_razon_social,
                                                                    cliente_cif: client.cliente_cif,
                                                                    cliente_direccion: client.cliente_direccion,
                                                                    cliente_email: client.cliente_email,
                                                                    cliente_telefono: client.cliente_telefono,
                                                                })
                                                                setClientSearchOpen(false)
                                                                setClientFilter('')
                                                            }}
                                                        >
                                                            <div className="font-bold text-sm text-slate-800">{client.cliente_razon_social}</div>
                                                            <div className="text-xs text-slate-500 mt-0.5">
                                                                {client.cliente_cif || 'Sin CIF'} · {client.cliente_direccion || 'Sin dirección'}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                {/* Vista previa de datos del cliente seleccionado */}
                                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Datos de la empresa seleccionada</p>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                        <div>
                                            <span className="text-[10px] text-slate-400">Razón Social:</span>
                                            <p className="text-xs font-bold text-slate-700">{editingDoc.cliente_razon_social || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400">CIF:</span>
                                            <p className="text-xs font-bold text-slate-700">{editingDoc.cliente_cif || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400">Dirección:</span>
                                            <p className="text-xs font-bold text-slate-700">{editingDoc.cliente_direccion || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400">Email:</span>
                                            <p className="text-xs font-bold text-slate-700">{editingDoc.cliente_email || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400">Teléfono:</span>
                                            <p className="text-xs font-bold text-slate-700">{editingDoc.cliente_telefono || '-'}</p>
                                        </div>
                                    </div>
                                </div>
                                {/* ===== FIN NUEVO ===== */}

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-xs text-slate-500 font-bold uppercase">Fecha</Label>
                                        <Input type="date" value={editingDoc.fecha ? editingDoc.fecha.split('T')[0] : ''} onChange={e => setEditingDoc({ ...editingDoc, fecha: e.target.value })} className="mt-1" />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-slate-500 font-bold uppercase">Su Referencia / Pedido</Label>
                                        <Input value={editingDoc.pedido_referencia || ''} onChange={e => setEditingDoc({ ...editingDoc, pedido_referencia: e.target.value })} placeholder="Referencia del cliente..." className="mt-1" />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500 font-bold uppercase">Observaciones</Label>
                                    <textarea value={editingDoc.observaciones || ''} onChange={e => setEditingDoc({ ...editingDoc, observaciones: e.target.value })} placeholder="Notas adicionales..." className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500 font-bold uppercase mb-2 block">Líneas</Label>
                                    {(editingDoc.lineas || []).map((linea: any, idx: number) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-center">
                                            <Input className="col-span-6" placeholder="Descripción" value={linea.descripcion || ''} onChange={e => { const l = [...editingDoc.lineas]; l[idx] = { ...l[idx], descripcion: e.target.value }; setEditingDoc({ ...editingDoc, lineas: l }) }} />
                                            <Input className="col-span-2 text-center" type="number" step="0.01" placeholder="Cant." value={linea.cantidad || ''} onChange={e => { const l = [...editingDoc.lineas]; l[idx] = { ...l[idx], cantidad: e.target.value }; setEditingDoc({ ...editingDoc, lineas: l }) }} />
                                            <Input className="col-span-3 text-right" type="number" step="0.01" placeholder="Precio" value={linea.precio_unitario || ''} onChange={e => { const l = [...editingDoc.lineas]; l[idx] = { ...l[idx], precio_unitario: e.target.value }; setEditingDoc({ ...editingDoc, lineas: l }) }} />
                                            <Button type="button" variant="ghost" size="icon" className="col-span-1 text-rose-500" onClick={() => { const l = editingDoc.lineas.filter((_: any, i: number) => i !== idx); setEditingDoc({ ...editingDoc, lineas: l }) }}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingDoc({ ...editingDoc, lineas: [...(editingDoc.lineas || []), { descripcion: '', cantidad: 1, precio_unitario: 0 }] })}>
                                        <Plus className="h-4 w-4 mr-1" /> Añadir línea
                                    </Button>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2 border-t">
                                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
                                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                                    const lineas = editingDoc.lineas || []
                                    const base = lineas.reduce((acc: number, l: any) => acc + (Number(l.cantidad) * Number(l.precio_unitario)), 0)
                                    const ivaPct = Number(editingDoc.iva_porcentaje) || 21
                                    const ivaImporte = base * (ivaPct / 100)
                                    const total = base + ivaImporte
                                    updateInvoice.mutate({
                                        id: editingDoc.id,
                                        cliente_id: editingDoc.cliente_id,
                                        cliente_razon_social: editingDoc.cliente_razon_social,
                                        cliente_cif: editingDoc.cliente_cif,
                                        cliente_direccion: editingDoc.cliente_direccion,
                                        cliente_email: editingDoc.cliente_email,
                                        cliente_telefono: editingDoc.cliente_telefono,
                                        fecha: editingDoc.fecha,
                                        pedido_referencia: editingDoc.pedido_referencia,
                                        observaciones: editingDoc.observaciones,
                                        lineas,
                                        base_imponible: base,
                                        iva_importe: ivaImporte,
                                        total
                                    }, { onSuccess: () => setEditOpen(false) })
                                }}>Guardar Cambios</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}

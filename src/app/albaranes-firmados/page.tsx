'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trash2, ToggleLeft, Upload, Loader2, Search, FileInput, Check, Mail, Eye } from "lucide-react"
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { deleteDocument, updateDocument } from '@/actions/documents'
import { SortableHeader } from '@/components/ui/sortable-header'
import { useGlobalFilter } from '@/components/providers/global-filter-provider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GlobalDateSelector } from '@/components/ui/global-date-selector'
import { useSignedDeliveryNotes } from '@/hooks/use-signed-delivery-notes'
import { formatCurrency } from '@/lib/utils'

export default function AlbaranesFirmadosPage() {
    const { month, year } = useGlobalFilter()
    const [uploading, setUploading] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const queryClient = useQueryClient()

    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [activeTab, setActiveTab] = useState<string>('all')
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
    const pageSize = 10
    const [editingDoc, setEditingDoc] = useState<any>(null)
    const [editOpen, setEditOpen] = useState(false)

    const { albaranes, totalCount, stats, counters, isLoading, updateSignedDeliveryNote } = useSignedDeliveryNotes({
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

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        try {
            setUploading(true)
            setAnalyzing(true)
            toast.info('Subiendo y analizando documento...')

            const formData = new FormData()
            formData.append('file', file)

            const { uploadSignedAlbaranAction } = await import('@/actions/secure-upload')
            const result = await uploadSignedAlbaranAction(formData)

            if (!result.success) throw new Error(result.error)

            toast.success('Albarán firmado registrado correctamente')
            queryClient.invalidateQueries({ queryKey: ['albaranes_firmados'] })

        } catch (e: any) {
            toast.error('Error: ' + e.message)
        } finally {
            setUploading(false)
            setAnalyzing(false)
        }
    }

    return (
        <>
            <div className="space-y-6 max-w-[1600px] w-full mx-auto px-6 py-8 animate-in fade-in duration-500">
                {/* Header */}
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Albaranes Firmados</h1>
                            <p className="text-slate-500 mt-1">Repositorio de albaranes digitalizados y firmados</p>
                        </div>

                        <div className="flex items-center gap-4">
                            <GlobalDateSelector />
                            <div className="relative">
                                <input
                                    type="file"
                                    id="file-upload"
                                    className="hidden"
                                    accept="image/*,application/pdf"
                                    onChange={handleFileUpload}
                                    disabled={uploading || analyzing}
                                />
                                <label htmlFor="file-upload">
                                    <Button asChild disabled={uploading || analyzing} className="cursor-pointer bg-[#1E88E5] hover:bg-[#1565C0] rounded-xl shadow-lg shadow-blue-600/20 font-bold transition-all hover:scale-105 active:scale-95">
                                        <span>
                                            {uploading || analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                            {analyzing ? 'Analizando...' : uploading ? 'Subiendo...' : 'Subir Albarán Firmado'}
                                        </span>
                                    </Button>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                        <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                            <div className="flex justify-between items-center pb-2">
                                <h3 className="tracking-tight text-sm font-medium text-slate-500">Total Firmado</h3>
                                <Check className="h-4 w-4 text-blue-500" />
                            </div>
                            <div className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalSigned)}</div>
                            <p className="text-xs text-slate-500 mt-1">Documentos registrados</p>
                        </Card>
                    </div>
                </div>

                <Card className="border-none shadow-none bg-transparent">
                    {/* Tabs & Search */}
                    <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setPage(1); }} className="w-full">
                        <div className="flex flex-col md:flex-row gap-4 mb-6 items-center justify-between">
                            <TabsList className="bg-slate-100/50 p-1 rounded-xl h-auto flex-wrap">
                                <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                    Todos <span className="ml-2 bg-slate-200 text-slate-600 py-0.5 px-2 rounded-full text-[10px]">{counters?.all || 0}</span>
                                </TabsTrigger>
                                <TabsTrigger value="FIRMADO" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                    Firmados <span className="ml-2 bg-orange-100 text-orange-700 py-0.5 px-2 rounded-full text-[10px]">{counters?.firmado || 0}</span>
                                </TabsTrigger>
                                <TabsTrigger value="ENVIADO" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wide px-4 py-2">
                                    Enviados <span className="ml-2 bg-green-100 text-green-700 py-0.5 px-2 rounded-full text-[10px]">{counters?.enviado || 0}</span>
                                </TabsTrigger>
                            </TabsList>

                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Buscar..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value)
                                        setPage(1)
                                    }}
                                    className="pl-9 h-10 rounded-xl bg-white border-slate-200 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <div className="bg-white border boundary-slate-200 rounded-3xl shadow-xl shadow-slate-200/20 overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50/80 backdrop-blur">
                                    <TableRow className="hover:bg-transparent border-b border-slate-100">
                                        <TableHead className="w-[120px]">
                                            <SortableHeader
                                                label="Fecha"
                                                columnKey="fecha"
                                                currentSort={sortConfig}
                                                onSort={(k, d) => handleSort(k)}
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                label="Documento"
                                                columnKey="numero"
                                                currentSort={sortConfig}
                                                onSort={(k, d) => handleSort(k)}
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                label="Cliente"
                                                columnKey="cliente_razon_social"
                                                currentSort={sortConfig}
                                                onSort={(k, d) => handleSort(k)}
                                            />
                                        </TableHead>
                                        <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-400 hidden md:table-cell" onClick={() => handleSort('descripcion')}>Concepto</TableHead>
                                        <TableHead className="text-right pr-6">
                                            <SortableHeader
                                                className="justify-end"
                                                label="Total"
                                                columnKey="total"
                                                currentSort={sortConfig}
                                                onSort={(k, d) => handleSort(k)}
                                            />
                                        </TableHead>
                                        <TableHead className="text-center font-bold text-xs uppercase tracking-wider text-slate-400">Estado</TableHead>
                                        <TableHead className="text-right font-bold text-xs uppercase tracking-wider text-slate-400 pr-6">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center">
                                                <div className="flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-[#1E88E5]" /></div>
                                            </TableCell>
                                        </TableRow>
                                    ) : albaranes.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center text-slate-400 font-medium">
                                                {search ? `No se encontraron resultados para "${search}"` : "No hay albaranes firmados registrados."}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        albaranes.map((doc: any) => (
                                            <TableRow key={doc.id} className="group hover:bg-slate-50/50 transition-colors border-slate-50">
                                                <TableCell className="pl-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-mono text-xs font-bold text-slate-600 capitalize">{format(new Date(doc.fecha), 'MMM yyyy', { locale: es })}</span>
                                                        <span className="font-mono text-xs font-medium text-slate-400">{format(new Date(doc.fecha), 'dd', { locale: es })}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    <span className="font-bold text-sm text-slate-900">{doc.numero}</span>
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-xs text-slate-700">{doc.cliente_razon_social}</span>
                                                        <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                            {doc.pedido_referencia || doc.numero_pedido_ref ? `Ped: ${doc.pedido_referencia || doc.numero_pedido_ref}` : ''}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell max-w-[200px] truncate py-4 text-xs font-medium text-slate-500">
                                                    {doc.descripcion || '-'}
                                                </TableCell>
                                                <TableCell className="text-right py-4 pr-6">
                                                    <span className="font-mono text-sm font-bold text-slate-900">
                                                        {formatCurrency(doc.total)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-4 text-center">
                                                    <div className="flex flex-col gap-1 items-center">
                                                        {doc.estado_vida === 'Traspasado' && (
                                                            <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]"><Check className="w-3 h-3 mr-1" /> TRASPASADO</Badge>
                                                        )}
                                                        {doc.es_enviado && (
                                                            <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-600 border-blue-200"><Mail className="w-3 h-3 mr-1" /> ENVIADO</Badge>
                                                        )}
                                                        <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-600 border-sky-200"><Eye className="w-3 h-3 mr-1" /> FIRMADO</Badge>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right py-4 pr-4">
                                                    <div className="flex justify-end gap-1">
                                                        {doc.documento_firmado_url && (
                                                            <DocumentPreviewModal
                                                                title={`Albarán Firmado ${doc.numero}`}
                                                                url={doc.documento_firmado_url}
                                                            />
                                                        )}

                                                        <Button variant="ghost" size="icon" title="Convertir a Factura" className="h-8 w-8 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg hidden" onClick={() => window.location.href = `/facturas/new?import_id=${doc.id}&import_type=albaran`}>
                                                            <FileInput className="h-4 w-4" />
                                                        </Button>

                                                        {/* Estado Button (replaces Edit) */}
                                                        <Button variant="ghost" size="icon" title="Cambiar Estado" className="h-8 w-8 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" onClick={() => { setEditingDoc({ ...doc }); setEditOpen(true) }}>
                                                            <ToggleLeft className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                            onClick={async () => {
                                                                if (confirm('¿Estás seguro de que deseas eliminar este albarán?')) {
                                                                    const res = await deleteDocument(doc.id, 'albaran')
                                                                    if (res.success) {
                                                                        toast.success('Albarán eliminado')
                                                                        queryClient.invalidateQueries({ queryKey: ['albaranes_firmados'] })
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

                            {/* Pagination Controls */}
                            {!isLoading && totalPages > 1 && (
                                <div className="flex items-center justify-center gap-2 py-4 border-t border-slate-100">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-xl border-slate-200 text-slate-500"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                    >
                                        Anterior
                                    </Button>
                                    <span className="text-xs font-bold text-slate-400 px-2">{page} de {totalPages}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-xl border-slate-200 text-slate-500"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                    >
                                        Siguiente
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Tabs>
                </Card>
            </div>

            <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingDoc(null) }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Estado del Albarán {editingDoc?.numero}</DialogTitle>
                    </DialogHeader>
                    {editingDoc && (
                        <div className="grid gap-4 py-2">
                            <div className="border rounded-xl p-4 bg-slate-50 space-y-3">
                                <p className="font-bold text-sm text-slate-700 uppercase tracking-wide">Estado</p>
                                <div className="flex items-center justify-between p-3 border rounded-lg bg-white">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-900">Enviado</span>
                                        <span className="text-xs text-slate-500">Marcado como enviado al cliente</span>
                                    </div>
                                    <Switch checked={editingDoc.es_enviado} onCheckedChange={(checked) => { updateSignedDeliveryNote.mutate({ id: editingDoc.id, es_enviado: checked }); setEditingDoc({ ...editingDoc, es_enviado: checked }) }} />
                                </div>
                                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-orange-50 cursor-pointer" onClick={() => { updateSignedDeliveryNote.mutate({ id: editingDoc.id, estado_vida: 'Pendiente' }); setEditingDoc({ ...editingDoc, estado_vida: 'Pendiente' }) }}>
                                    <Label className="font-bold cursor-pointer">Pendiente</Label>
                                    <div className={`w-4 h-4 border-2 rounded-full ${editingDoc.estado_vida === 'Pendiente' ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`} />
                                </div>
                                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-purple-50 cursor-pointer" onClick={() => { updateSignedDeliveryNote.mutate({ id: editingDoc.id, estado_vida: 'Traspasado' }); setEditingDoc({ ...editingDoc, estado_vida: 'Traspasado' }) }}>
                                    <Label className="font-bold text-purple-900 cursor-pointer">Traspasado</Label>
                                    <div className={`w-4 h-4 border-2 rounded-full ${editingDoc.estado_vida === 'Traspasado' ? 'bg-purple-500 border-purple-500' : 'border-slate-300'}`} />
                                </div>
                            </div>
                            <div className="flex justify-end pt-2 border-t">
                                <Button variant="outline" onClick={() => setEditOpen(false)}>Cerrar</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}

'use client'

import { useState } from 'react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Search, Upload, Trash2, Loader2, FileText, PenLine, Users, Receipt, X, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { CATEGORIAS_GASTO } from '@/lib/gastos/categorias'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { processExpense } from '@/actions/secure-upload'
import { SortableHeader } from '@/components/ui/sortable-header'
import { useGlobalFilter } from '@/components/providers/global-filter-provider'
import { GlobalDateSelector } from '@/components/ui/global-date-selector'
import { useExpenses } from '@/hooks/use-expenses'
import { Card } from '@/components/ui/card'
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal'
import { ExpenseEditDialog } from '@/components/gastos/expense-edit-dialog'
import { isOwnCompany, OWN_COMPANY } from '@/lib/company'
import { PROVEEDOR_PENDIENTE } from '@/lib/expense-supplier'
import { cn, formatCurrency } from '@/lib/utils'

const TODOS = 'all'

export default function GastosPage() {
    const { month, year } = useGlobalFilter()
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
    const pageSize = 10

    // Filtros propios del módulo de gastos
    const [proveedorFiltro, setProveedorFiltro] = useState<string>(TODOS)
    const [categoriaFiltro, setCategoriaFiltro] = useState<string>('all')
    const [fechaDesde, setFechaDesde] = useState('')
    const [fechaHasta, setFechaHasta] = useState('')

    // Modals state
    const [isUploadOpen, setIsUploadOpen] = useState(false)
    const [isManualOpen, setIsManualOpen] = useState(false)

    // File Upload state
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)

    // Manual Entry Form
    const [manualForm, setManualForm] = useState({
        fecha: new Date().toISOString().split('T')[0],
        numero: '',
        referencia_pedido: '',
        proveedor: '',
        descripcion: '',
        base_imponible: '',
        iva_importe: '',
        total: ''
    })

    const {
        gastos,
        totalCount,
        stats,
        porProveedor,
        proveedores,
        totalProveedorSeleccionado,
        isLoading,
        isLoadingStats,
        createExpense,
        updateExpense,
        deleteExpense
    } = useExpenses({
        page,
        pageSize,
        search,
        month,
        year,
        fechaDesde,
        fechaHasta,
        proveedor: proveedorFiltro,
        categoria: categoriaFiltro,
        sortConfig
    })

    const totalPages = Math.ceil(totalCount / pageSize)
    const hayRangoManual = Boolean(fechaDesde || fechaHasta)
    const hayFiltros = hayRangoManual || proveedorFiltro !== TODOS || Boolean(search)

    const cambiarFiltro = (accion: () => void) => {
        accion()
        setPage(1)
    }

    const limpiarFiltros = () => {
        setProveedorFiltro(TODOS)
        setFechaDesde('')
        setFechaHasta('')
        setSearch('')
        setPage(1)
    }

    const handleCreateManual = () => {
        if (!manualForm.proveedor.trim()) {
            toast.error('Indica el proveedor del gasto')
            return
        }
        if (isOwnCompany(manualForm.proveedor)) {
            toast.error(`${OWN_COMPANY.nombre} es la propia empresa: el proveedor es quien te factura`)
            return
        }
        createExpense.mutate(manualForm, {
            onSuccess: () => {
                setIsManualOpen(false)
                setManualForm({ fecha: new Date().toISOString().split('T')[0], numero: '', referencia_pedido: '', proveedor: '', descripcion: '', base_imponible: '', iva_importe: '', total: '' })
            }
        })
    }

    const handleUpload = async () => {
        if (!file) return

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

        if (!allowedTypes.includes(file.type)) {
            if (file.type === 'image/heic' || file.type === 'image/heif') {
                toast.error('La cámara del móvil ha generado una imagen HEIC/HEIF. Convierte la foto a JPG o PNG.')
            } else {
                toast.error(`Tipo de archivo no permitido: ${file.type || 'desconocido'}`)
            }
            return
        }

        if (file.size > 10 * 1024 * 1024) {
            toast.error('El archivo supera los 10MB permitidos.')
            return
        }

        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            const result = await processExpense(formData)

            if (result.success) {
                if (result.revisarProveedor) {
                    toast.warning(`Gasto guardado, pero revisa el proveedor (${result.proveedor}) con el botón de editar.`, { duration: 8000 })
                } else {
                    toast.success(`Gasto procesado correctamente. Proveedor: ${result.proveedor}`)
                }
                window.location.reload()
            } else {
                toast.error('Error en OCR: ' + result.error)
            }
        } catch (error) {
            toast.error('Error al subir archivo: ' + (error instanceof Error ? error.message : String(error)))
        } finally {
            setUploading(false)
            setIsUploadOpen(false)
            setFile(null)
        }
    }

    return (
        <div className="space-y-6 max-w-[1600px] w-full mx-auto px-6 py-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col gap-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Gastos</h1>
                        <p className="text-slate-500 mt-1">Control de gastos y proveedores</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <GlobalDateSelector />

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" className="border-slate-200 text-slate-600 font-bold hover:bg-slate-50 rounded-xl shadow-sm">
                                        <PenLine className="mr-2 h-4 w-4" /> Manual
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                                    <DialogHeader>
                                        <DialogTitle>Registrar Gasto Manualmente</DialogTitle>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label htmlFor="date">Fecha</Label>
                                                <Input id="date" type="date" value={manualForm.fecha} onChange={e => setManualForm({ ...manualForm, fecha: e.target.value })} />
                                            </div>
                                            <div>
                                                <Label htmlFor="number">Documento Nº</Label>
                                                <Input id="number" placeholder="Ej: F-2026-001" value={manualForm.numero} onChange={e => setManualForm({ ...manualForm, numero: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="provider">Proveedor</Label>
                                            <Input
                                                id="provider"
                                                list="proveedores-conocidos"
                                                value={manualForm.proveedor}
                                                onChange={e => setManualForm({ ...manualForm, proveedor: e.target.value })}
                                            />
                                            <datalist id="proveedores-conocidos">
                                                {proveedores.map(p => <option key={p} value={p} />)}
                                            </datalist>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="ref">Referencia Pedido</Label>
                                            <Input id="ref" placeholder="Ej: 4500114195" value={manualForm.referencia_pedido} onChange={e => setManualForm({ ...manualForm, referencia_pedido: e.target.value })} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="desc">Descripción</Label>
                                            <Input id="desc" value={manualForm.descripcion} onChange={e => setManualForm({ ...manualForm, descripcion: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <Label htmlFor="base">Base</Label>
                                                <Input id="base" type="number" step="0.01" value={manualForm.base_imponible} onChange={e => setManualForm({ ...manualForm, base_imponible: e.target.value })} />
                                            </div>
                                            <div>
                                                <Label htmlFor="vat">IVA</Label>
                                                <Input id="vat" type="number" step="0.01" value={manualForm.iva_importe} onChange={e => setManualForm({ ...manualForm, iva_importe: e.target.value })} />
                                            </div>
                                            <div>
                                                <Label htmlFor="total">Total</Label>
                                                <Input id="total" type="number" step="0.01" value={manualForm.total} onChange={e => setManualForm({ ...manualForm, total: e.target.value })} />
                                            </div>
                                        </div>
                                        <Button onClick={handleCreateManual} disabled={createExpense.isPending} className="w-full mt-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl">
                                            {createExpense.isPending ? <Loader2 className="animate-spin" /> : 'Guardar Gasto'}
                                        </Button>
                                    </div>
                                </DialogContent>
                            </Dialog>

                            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-lg shadow-rose-500/20 font-bold transition-all hover:scale-105 active:scale-95">
                                        <Upload className="mr-2 h-4 w-4" /> Subir Factura (OCR)
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                                    <DialogHeader>
                                        <DialogTitle>Subir Factura / Ticket</DialogTitle>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                            />
                                            <div className="flex flex-col items-center gap-2 text-slate-500">
                                                <Upload className="h-8 w-8 text-slate-300" />
                                                <span className="font-medium text-sm">{file ? file.name : 'Arrastra o selecciona un archivo'}</span>
                                            </div>
                                        </div>
                                        <Button disabled={!file || uploading} onClick={handleUpload} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl">
                                            {uploading ? <Loader2 className="animate-spin mr-2" /> : null}
                                            {uploading ? 'Procesando con IA...' : 'Procesar Gasto'}
                                        </Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>

                {/* Metrics Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <h3 className="tracking-tight text-sm font-medium text-slate-500">
                                {proveedorFiltro === TODOS ? 'Total Gastos' : 'Total del proveedor'}
                            </h3>
                            <FileText className="h-4 w-4 text-rose-400" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalProveedorSeleccionado)}</div>
                        <p className="text-xs text-slate-500 mt-1 truncate">
                            {proveedorFiltro === TODOS ? 'En el periodo seleccionado' : proveedorFiltro}
                        </p>
                    </Card>

                    <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <h3 className="tracking-tight text-sm font-medium text-slate-500">Base imponible</h3>
                            <Receipt className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalBase)}</div>
                        <p className="text-xs text-slate-500 mt-1">IVA: {formatCurrency(stats.totalIva)}</p>
                    </Card>

                    <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <h3 className="tracking-tight text-sm font-medium text-slate-500">Nº de gastos</h3>
                            <FileText className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900">{stats.numGastos}</div>
                        <p className="text-xs text-slate-500 mt-1">En el periodo seleccionado</p>
                    </Card>

                    <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <h3 className="tracking-tight text-sm font-medium text-slate-500">Proveedores</h3>
                            <Users className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900">{porProveedor.length}</div>
                        <p className="text-xs text-slate-500 mt-1 truncate">
                            {porProveedor[0] ? `Mayor: ${porProveedor[0].proveedor}` : 'Sin datos'}
                        </p>
                    </Card>
                </div>
            </div>

            {/* Filtros */}
            <Card className="p-4 border-slate-200/60 shadow-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="grid gap-1.5">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Categoría</Label>
                        <Select value={categoriaFiltro} onValueChange={(v) => cambiarFiltro(() => setCategoriaFiltro(v))}>
                            <SelectTrigger className="w-[200px] h-9 text-xs font-bold rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las categorías</SelectItem>
                                <SelectItem value="__sin__">⚠️ Sin clasificar</SelectItem>
                                {CATEGORIAS_GASTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Proveedor</Label>
                        <Select value={proveedorFiltro} onValueChange={(v) => cambiarFiltro(() => setProveedorFiltro(v))}>
                            <SelectTrigger className="w-[260px] h-9 text-xs font-bold bg-white border-slate-200 text-slate-700 rounded-lg">
                                <SelectValue placeholder="Todos los proveedores" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[320px]">
                                <SelectItem value={TODOS} className="font-bold text-slate-500">
                                    Todos los proveedores
                                </SelectItem>
                                {porProveedor.map(p => (
                                    <SelectItem key={p.proveedor} value={p.proveedor} className="font-medium">
                                        {p.proveedor} — {formatCurrency(p.total)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="desde" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Desde</Label>
                        <Input
                            id="desde"
                            type="date"
                            value={fechaDesde}
                            onChange={e => cambiarFiltro(() => setFechaDesde(e.target.value))}
                            className="w-[160px] h-9 text-xs font-medium bg-white border-slate-200 rounded-lg"
                        />
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="hasta" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hasta</Label>
                        <Input
                            id="hasta"
                            type="date"
                            value={fechaHasta}
                            onChange={e => cambiarFiltro(() => setFechaHasta(e.target.value))}
                            className="w-[160px] h-9 text-xs font-medium bg-white border-slate-200 rounded-lg"
                        />
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar gasto..."
                            className="pl-9 w-[280px] h-9 bg-white border-slate-200 focus:border-rose-500 transition-all font-medium"
                            value={search}
                            onChange={(e) => cambiarFiltro(() => setSearch(e.target.value))}
                        />
                    </div>

                    {hayFiltros && (
                        <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="h-9 text-slate-500 font-bold">
                            <X className="mr-1 h-3.5 w-3.5" /> Limpiar filtros
                        </Button>
                    )}

                    {hayRangoManual && (
                        <span className="text-[11px] font-medium text-amber-600 ml-auto self-center">
                            El rango de fechas tiene prioridad sobre el selector de mes/año
                        </span>
                    )}
                </div>
            </Card>

            {/* Gasto por proveedor */}
            {porProveedor.length > 0 && (
                <Card className="p-4 border-slate-200/60 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Users className="h-4 w-4 text-rose-500" /> Gasto por proveedor
                        </h3>
                        {isLoadingStats && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {porProveedor.slice(0, 12).map(p => {
                            const activo = proveedorFiltro === p.proveedor
                            const porcentaje = stats.totalGastos > 0 ? (p.total / stats.totalGastos) * 100 : 0
                            return (
                                <button
                                    key={p.proveedor}
                                    onClick={() => cambiarFiltro(() => setProveedorFiltro(activo ? TODOS : p.proveedor))}
                                    className={cn(
                                        'text-left px-3 py-2 rounded-xl border transition-all',
                                        activo
                                            ? 'border-rose-300 bg-rose-50 shadow-sm'
                                            : 'border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/40'
                                    )}
                                >
                                    <div className="text-xs font-bold text-slate-800 max-w-[220px] truncate">{p.proveedor}</div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-mono text-sm font-bold text-rose-700">{formatCurrency(p.total)}</span>
                                        <span className="text-[10px] text-slate-400 font-medium">
                                            {p.numGastos} doc. · {porcentaje.toFixed(0)}%
                                        </span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </Card>
            )}

            {/* Table */}
            <div className="bg-white border boundary-slate-200 rounded-3xl shadow-xl shadow-slate-200/20 overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/80 backdrop-blur">
                        <TableRow className="hover:bg-transparent border-b border-slate-100">
                            <TableHead className="w-[120px]">
                                <SortableHeader
                                    label="Fecha"
                                    columnKey="fecha"
                                    currentSort={sortConfig}
                                    onSort={(k, d) => setSortConfig({ key: k, direction: d })}
                                />
                            </TableHead>
                            <TableHead className="w-[150px]">
                                <SortableHeader
                                    label="Documento"
                                    columnKey="numero"
                                    currentSort={sortConfig}
                                    onSort={(k, d) => setSortConfig({ key: k, direction: d })}
                                />
                            </TableHead>
                            <TableHead>
                                <SortableHeader
                                    label="Proveedor"
                                    columnKey="proveedor"
                                    currentSort={sortConfig}
                                    onSort={(k, d) => setSortConfig({ key: k, direction: d })}
                                />
                            </TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-400 hidden md:table-cell">Descripción</TableHead>
                            <TableHead className="text-right w-[100px]">Base</TableHead>
                            <TableHead className="text-right w-[100px]">IVA</TableHead>
                            <TableHead className="text-right w-[120px]">
                                <SortableHeader
                                    label="Total"
                                    columnKey="total"
                                    currentSort={sortConfig}
                                    onSort={(k, d) => setSortConfig({ key: k, direction: d })}
                                />
                            </TableHead>
                            <TableHead className="w-[160px] text-center">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-32 text-center">
                                    <div className="flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-rose-600" /></div>
                                </TableCell>
                            </TableRow>
                        ) : gastos.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-32 text-center text-slate-400 font-medium">
                                    No se encontraron gastos
                                </TableCell>
                            </TableRow>
                        ) : (
                            gastos.map((gasto) => {
                                const proveedorDudoso = gasto.proveedor === PROVEEDOR_PENDIENTE || isOwnCompany(gasto.proveedor, gasto.proveedor_cif)
                                return (
                                    <TableRow key={gasto.id} className="group hover:bg-slate-50/50 transition-colors border-slate-50">
                                        <TableCell className="pl-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-mono text-xs font-bold text-slate-600 capitalize">{format(new Date(gasto.fecha), 'MMM yyyy', { locale: es })}</span>
                                                <span className="font-mono text-xs font-medium text-slate-400">{format(new Date(gasto.fecha), 'dd', { locale: es })}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <span className="font-bold text-sm text-slate-900">{gasto.numero || '-'}</span>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex flex-col">
                                                <span className={cn(
                                                    'font-bold text-sm flex items-center gap-1.5',
                                                    proveedorDudoso ? 'text-amber-600' : 'text-slate-900'
                                                )}>
                                                    {proveedorDudoso && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                                                    {gasto.proveedor}
                                                </span>
                                                {gasto.referencia_pedido && (
                                                    <span className="text-[10px] text-slate-400 font-mono mt-0.5">Ref: {gasto.referencia_pedido}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell max-w-[200px] truncate py-4 text-xs font-medium text-slate-500">{gasto.descripcion}</TableCell>
                                        <TableCell className="text-right py-4 text-xs font-medium text-slate-600">{formatCurrency(gasto.base_imponible)}</TableCell>
                                        <TableCell className="text-right py-4 text-xs font-medium text-slate-600">{formatCurrency(gasto.iva_importe)}</TableCell>
                                        <TableCell className="text-right py-4 pr-6 font-mono text-sm font-bold text-rose-700">{formatCurrency(gasto.total)}</TableCell>
                                        <TableCell className="py-4 text-center">
                                            <div className="flex justify-center gap-1">
                                                <DocumentPreviewModal
                                                    document={gasto}
                                                    type="gasto"
                                                    url={gasto.factura_url}
                                                    title={`Gasto ${gasto.numero || ''}`}
                                                />
                                                <ExpenseEditDialog
                                                    gasto={gasto}
                                                    proveedores={proveedores}
                                                    isSaving={updateExpense.isPending}
                                                    onSave={(data) => updateExpense.mutateAsync(data)}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                    onClick={() => {
                                                        if (confirm('¿Eliminar gasto?')) {
                                                            deleteExpense.mutate(gasto.id)
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Controls */}
            {!isLoading && totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
                    <span className="text-xs font-bold text-slate-400 px-2">{page} de {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Siguiente</Button>
                </div>
            )}

        </div>
    )
}

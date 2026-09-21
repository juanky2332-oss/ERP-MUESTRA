'use client'

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ChevronDown, ExternalLink, FileText, Loader2, Pencil, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { Gasto } from '@/hooks/use-expenses'
import { useContacts } from '@/hooks/use-contacts'
import { isOwnCompany, OWN_COMPANY } from '@/lib/company'

/** Un proveedor que se puede elegir: viene de la agenda o de gastos anteriores. */
interface SugerenciaProveedor {
    nombre: string
    cif: string
    origen: 'contacto' | 'gasto'
}

/** Campos que se envían al guardar la edición de un gasto. */
export interface ExpenseUpdatePayload {
    id: string
    fecha: string
    numero: string
    referencia_pedido: string
    proveedor: string
    proveedor_cif: string
    descripcion: string
    base_imponible: number
    iva_porcentaje: number
    iva_importe: number
    total: number
}

interface ExpenseEditDialogProps {
    gasto: Gasto
    /** Lista de proveedores ya existentes, para autocompletar y evitar duplicados por errata. */
    proveedores?: string[]
    onSave: (data: ExpenseUpdatePayload) => Promise<unknown>
    isSaving?: boolean
}

interface FormState {
    fecha: string
    numero: string
    referencia_pedido: string
    proveedor: string
    proveedor_cif: string
    descripcion: string
    base_imponible: string
    iva_porcentaje: string
    iva_importe: string
    total: string
}

const num = (v: string | number | null | undefined) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
}

const redondear = (n: number) => Math.round(n * 100) / 100

function estadoInicial(gasto: Gasto): FormState {
    return {
        fecha: (gasto.fecha || '').slice(0, 10),
        numero: gasto.numero || '',
        referencia_pedido: gasto.referencia_pedido || '',
        proveedor: gasto.proveedor || '',
        proveedor_cif: gasto.proveedor_cif || '',
        descripcion: gasto.descripcion || '',
        base_imponible: String(gasto.base_imponible ?? 0),
        iva_porcentaje: String(gasto.iva_porcentaje ?? 21),
        iva_importe: String(gasto.iva_importe ?? 0),
        total: String(gasto.total ?? 0),
    }
}

/**
 * Edición manual de un gasto ya registrado.
 *
 * Existe porque la extracción automática puede equivocarse: aquí se corrige
 * cualquier campo (sobre todo el proveedor) teniendo el documento original a
 * la vista para comparar.
 */
export function ExpenseEditDialog({ gasto, proveedores = [], onSave, isSaving }: ExpenseEditDialogProps) {
    const [open, setOpen] = useState(false)
    const [form, setForm] = useState<FormState>(() => estadoInicial(gasto))
    const [listaAbierta, setListaAbierta] = useState(false)

    // Los contactos guardados en la agenda del ERP son la fuente principal:
    // así el gasto queda con el mismo nombre y CIF que ya usa el resto de la app.
    const { contacts } = useContacts()

    const sugerencias = useMemo<SugerenciaProveedor[]>(() => {
        const mapa = new Map<string, SugerenciaProveedor>()

        for (const contacto of (contacts || []) as Array<{ razon_social?: string, cif?: string }>) {
            const nombre = (contacto.razon_social || '').trim()
            if (!nombre) continue
            mapa.set(nombre.toLowerCase(), { nombre, cif: (contacto.cif || '').trim(), origen: 'contacto' })
        }

        // Proveedores que ya aparecen en otros gastos y no están en la agenda.
        for (const proveedor of proveedores) {
            const nombre = (proveedor || '').trim()
            if (!nombre || mapa.has(nombre.toLowerCase())) continue
            mapa.set(nombre.toLowerCase(), { nombre, cif: '', origen: 'gasto' })
        }

        return Array.from(mapa.values())
            .filter(s => !isOwnCompany(s.nombre, s.cif))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    }, [contacts, proveedores])

    const sugerenciasVisibles = useMemo(() => {
        const busqueda = form.proveedor.trim().toLowerCase()
        const lista = busqueda
            ? sugerencias.filter(s => s.nombre.toLowerCase().includes(busqueda))
            : sugerencias
        return lista.slice(0, 8)
    }, [sugerencias, form.proveedor])

    /** Al elegir un contacto se rellena también su CIF, si lo tiene guardado. */
    const elegirProveedor = (sugerencia: SugerenciaProveedor) => {
        setForm(prev => ({
            ...prev,
            proveedor: sugerencia.nombre,
            proveedor_cif: sugerencia.cif || prev.proveedor_cif,
        }))
        setListaAbierta(false)
    }

    // Al abrir el modal se parte siempre de los datos guardados. Se hace aquí y
    // no en un efecto para no provocar renders en cascada ni pisar lo que el
    // usuario esté escribiendo si la lista se refresca de fondo.
    const cambiarApertura = (abierto: boolean) => {
        if (abierto) setForm(estadoInicial(gasto))
        setListaAbierta(false)
        setOpen(abierto)
    }

    const set = (campo: keyof FormState, valor: string) => {
        setForm(prev => ({ ...prev, [campo]: valor }))
    }

    /** Recalcula IVA y total a partir de la base y el % de IVA. */
    const recalcular = () => {
        const base = num(form.base_imponible)
        const pct = num(form.iva_porcentaje)
        const iva = redondear(base * pct / 100)
        setForm(prev => ({
            ...prev,
            iva_importe: String(iva),
            total: String(redondear(base + iva)),
        }))
    }

    const proveedorEsPropia = isOwnCompany(form.proveedor, form.proveedor_cif)
    const descuadre = Math.abs(num(form.base_imponible) + num(form.iva_importe) - num(form.total)) > 0.02

    const guardar = async () => {
        if (!form.proveedor.trim()) {
            toast.error('El proveedor no puede quedar vacío')
            return
        }
        if (proveedorEsPropia) {
            toast.error(`${OWN_COMPANY.nombre} es la propia empresa: no puede ser el proveedor de un gasto`)
            return
        }
        if (!form.fecha) {
            toast.error('La fecha es obligatoria')
            return
        }

        await onSave({
            id: gasto.id,
            fecha: form.fecha,
            numero: form.numero.trim(),
            referencia_pedido: form.referencia_pedido.trim(),
            proveedor: form.proveedor.trim(),
            proveedor_cif: form.proveedor_cif.trim().toUpperCase(),
            descripcion: form.descripcion.trim(),
            base_imponible: num(form.base_imponible),
            iva_porcentaje: num(form.iva_porcentaje),
            iva_importe: num(form.iva_importe),
            total: num(form.total),
        })

        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={cambiarApertura}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                    title="Editar gasto"
                >
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Pencil className="h-4 w-4 text-rose-600" />
                        Editar gasto {gasto.numero}
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                    {/* Formulario */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-fecha">Fecha</Label>
                                <Input id="edit-fecha" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-numero">Documento Nº</Label>
                                <Input id="edit-numero" value={form.numero} onChange={e => set('numero', e.target.value)} />
                            </div>
                        </div>

                        <div className="grid gap-1.5">
                            <Label htmlFor="edit-proveedor">Proveedor</Label>
                            <div className="relative">
                                <Input
                                    id="edit-proveedor"
                                    autoComplete="off"
                                    placeholder="Escribe o elige un contacto guardado"
                                    value={form.proveedor}
                                    onChange={e => {
                                        set('proveedor', e.target.value)
                                        setListaAbierta(true)
                                    }}
                                    onFocus={() => setListaAbierta(true)}
                                    onBlur={() => setListaAbierta(false)}
                                    className={proveedorEsPropia ? 'border-rose-500 focus-visible:ring-rose-500 pr-9' : 'pr-9'}
                                />
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    aria-label="Ver contactos guardados"
                                    // onMouseDown en vez de onClick: evita que el input pierda el
                                    // foco y cierre la lista justo antes de recibir la pulsación.
                                    onMouseDown={e => {
                                        e.preventDefault()
                                        setListaAbierta(prev => !prev)
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                                >
                                    <ChevronDown className="h-4 w-4" />
                                </button>

                                {listaAbierta && sugerenciasVisibles.length > 0 && (
                                    <ul
                                        onMouseDown={e => e.preventDefault()}
                                        className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1"
                                    >
                                        {sugerenciasVisibles.map(sugerencia => (
                                            <li key={`${sugerencia.origen}-${sugerencia.nombre}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => elegirProveedor(sugerencia)}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-rose-50 flex items-center justify-between gap-2"
                                                >
                                                    <span className="truncate">
                                                        {sugerencia.nombre}
                                                        {sugerencia.cif && (
                                                            <span className="text-xs text-slate-400"> · {sugerencia.cif}</span>
                                                        )}
                                                    </span>
                                                    <span className={sugerencia.origen === 'contacto'
                                                        ? 'shrink-0 text-[10px] font-bold uppercase text-rose-500'
                                                        : 'shrink-0 text-[10px] uppercase text-slate-400'}>
                                                        {sugerencia.origen === 'contacto' ? 'contacto' : 'gastos'}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            {proveedorEsPropia && (
                                <p className="text-xs font-medium text-rose-600">
                                    {OWN_COMPANY.nombre} es tu propia empresa: en un gasto el proveedor es quien te factura.
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-cif">CIF proveedor</Label>
                                <Input id="edit-cif" value={form.proveedor_cif} onChange={e => set('proveedor_cif', e.target.value)} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-ref">Referencia pedido</Label>
                                <Input id="edit-ref" value={form.referencia_pedido} onChange={e => set('referencia_pedido', e.target.value)} />
                            </div>
                        </div>

                        <div className="grid gap-1.5">
                            <Label htmlFor="edit-desc">Descripción</Label>
                            <Textarea id="edit-desc" className="h-20" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
                        </div>

                        <div className="grid grid-cols-4 gap-2 items-end">
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-base">Base</Label>
                                <Input id="edit-base" type="number" step="0.01" value={form.base_imponible} onChange={e => set('base_imponible', e.target.value)} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-pct">% IVA</Label>
                                <Input id="edit-pct" type="number" step="1" value={form.iva_porcentaje} onChange={e => set('iva_porcentaje', e.target.value)} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-iva">Imp. IVA</Label>
                                <Input id="edit-iva" type="number" step="0.01" value={form.iva_importe} onChange={e => set('iva_importe', e.target.value)} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-total">Total</Label>
                                <Input id="edit-total" type="number" step="0.01" className="font-bold" value={form.total} onChange={e => set('total', e.target.value)} />
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={recalcular} className="rounded-lg">
                                Recalcular IVA y total
                            </Button>
                            {descuadre && (
                                <span className="text-xs font-medium text-amber-600">
                                    Base + IVA no cuadra con el total
                                </span>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                            <Button onClick={guardar} disabled={isSaving} className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl">
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar cambios
                            </Button>
                        </div>
                    </div>

                    {/* Documento original */}
                    <div className="flex flex-col rounded-xl border border-slate-200 overflow-hidden bg-slate-50 min-h-[420px]">
                        <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
                            <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-rose-500" /> Documento original
                            </span>
                            {gasto.factura_url && (
                                <a
                                    href={gasto.factura_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-medium text-rose-600 hover:underline flex items-center gap-1"
                                >
                                    Abrir <ExternalLink className="h-3 w-3" />
                                </a>
                            )}
                        </div>
                        {gasto.factura_url ? (
                            <iframe src={gasto.factura_url} className="flex-1 w-full border-0 bg-white" title="Documento del gasto" />
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-6 text-center">
                                Este gasto no tiene documento adjunto.
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

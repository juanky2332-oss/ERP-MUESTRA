'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search, Package, Loader2, Wrench, Layers, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { supabase } from '@/lib/supabase'
import { cn, formatCurrency } from '@/lib/utils'
import { guardarItemCatalogo } from '@/actions/maestros'
import { toast } from 'sonner'

const TIPOS = [
    { value: 'producto', label: 'Producto', icon: Package },
    { value: 'material', label: 'Material', icon: Layers },
    { value: 'servicio', label: 'Servicio', icon: Wrench },
    { value: 'concepto', label: 'Concepto de factura', icon: Tag },
]
const VACIO = { tipo: 'producto', nombre: '', referencia: '', descripcion: '', categoria: '', unidad: 'ud', precio_coste: '', precio_venta: '', iva_porcentaje: 21, proveedor_id: '', activo: true, notas: '' }

export default function CatalogoPage() {
    const [items, setItems] = useState<any[] | null>(null)
    const [proveedores, setProveedores] = useState<any[]>([])
    const [q, setQ] = useState('')
    const [tipo, setTipo] = useState('todos')
    const [categoria, setCategoria] = useState('todas')
    const [inactivos, setInactivos] = useState(false)
    const [form, setForm] = useState<any>(null)
    const [guardando, setGuardando] = useState(false)

    const cargar = useCallback(async () => {
        const [{ data }, { data: provs }] = await Promise.all([
            supabase.from('catalogo').select('*, proveedores(razon_social)').order('nombre'),
            supabase.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social'),
        ])
        setItems(data || []); setProveedores(provs || [])
    }, [])
    useEffect(() => { cargar() }, [cargar])

    const categorias = useMemo(() => Array.from(new Set((items || []).map(i => i.categoria).filter(Boolean))).sort(), [items])
    const filtrados = useMemo(() => (items || []).filter(i => {
        if (!!i.activo === inactivos) return false
        if (tipo !== 'todos' && i.tipo !== tipo) return false
        if (categoria !== 'todas' && i.categoria !== categoria) return false
        const t = q.toLowerCase().trim()
        return !t || [i.nombre, i.referencia, i.descripcion, i.categoria].some(v => v && String(v).toLowerCase().includes(t))
    }), [items, q, tipo, categoria, inactivos])

    const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
    const guardar = async () => {
        setGuardando(true)
        const r = await guardarItemCatalogo({ ...form, proveedor_id: form.proveedor_id || null })
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        toast.success(form.id ? 'Actualizado' : 'Añadido al catálogo')
        setForm(null); cargar()
    }
    const margen = form && Number(form.precio_venta) > 0 ? Math.round(((Number(form.precio_venta) - Number(form.precio_coste || 0)) / Number(form.precio_venta)) * 100) : null

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">Catálogo</h1>
                    <p className="text-muted-foreground mt-1">Productos, materiales, servicios y conceptos para presupuestos, albaranes y facturas.</p>
                </div>
                <Button onClick={() => setForm({ ...VACIO })} className="font-bold"><Plus className="h-4 w-4 mr-1" /> Nuevo elemento</Button>
            </div>

            <div className="flex flex-col lg:flex-row gap-2">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, referencia, descripción…" className="pl-9" />
                </div>
                <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="todos">Todos los tipos</SelectItem>{TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                {categorias.length > 0 && (
                    <Select value={categoria} onValueChange={setCategoria}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="todas">Todas las categorías</SelectItem>{categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                )}
                <Button variant={inactivos ? 'secondary' : 'ghost'} size="sm" onClick={() => setInactivos(v => !v)}>{inactivos ? 'Viendo inactivos' : 'Ver inactivos'}</Button>
            </div>

            {items === null ? (
                <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}</div>
            ) : filtrados.length === 0 ? (
                <EmptyState icon={Package} title={q ? 'Sin resultados' : 'Catálogo vacío'} description="Añade productos y servicios para crear presupuestos y facturas en segundos." actionLabel="Nuevo elemento" onAction={() => setForm({ ...VACIO })} />
            ) : (
                <div className="rounded-2xl border bg-card overflow-x-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur">
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                                <TableHead className="hidden lg:table-cell">Categoría</TableHead>
                                <TableHead className="hidden lg:table-cell">Proveedor</TableHead>
                                <TableHead className="text-right hidden sm:table-cell">Coste</TableHead>
                                <TableHead className="text-right">Venta</TableHead>
                                <TableHead className="text-right hidden sm:table-cell">IVA</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtrados.map(i => (
                                <TableRow key={i.id} className="cursor-pointer" onClick={() => setForm({ ...VACIO, ...i, proveedor_id: i.proveedor_id || '' })}>
                                    <TableCell>
                                        <p className="font-bold">{i.nombre}</p>
                                        <p className="text-xs text-muted-foreground font-mono">{i.referencia}{i.unidad ? ` · ${i.unidad}` : ''}</p>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell capitalize text-sm">{TIPOS.find(t => t.value === i.tipo)?.label}</TableCell>
                                    <TableCell className="hidden lg:table-cell text-sm">{i.categoria || '—'}</TableCell>
                                    <TableCell className="hidden lg:table-cell text-sm">{i.proveedores?.razon_social || '—'}</TableCell>
                                    <TableCell className="text-right hidden sm:table-cell tabular-nums text-muted-foreground">{formatCurrency(Number(i.precio_coste))}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold">{formatCurrency(Number(i.precio_venta))}</TableCell>
                                    <TableCell className="text-right hidden sm:table-cell tabular-nums">{Number(i.iva_porcentaje)}%</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            <Dialog open={!!form} onOpenChange={v => !v && setForm(null)}>
                <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>{form?.id ? 'Editar elemento' : 'Nuevo elemento del catálogo'}</DialogTitle></DialogHeader>
                    {form && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 flex gap-2 flex-wrap">
                                {TIPOS.map(t => (
                                    <button key={t.value} type="button" onClick={() => set('tipo', t.value)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold', form.tipo === t.value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}>
                                        <t.icon className="h-4 w-4" /> {t.label}
                                    </button>
                                ))}
                            </div>
                            <div className="col-span-2"><Label className="text-xs">Nombre *</Label><Input autoFocus value={form.nombre} onChange={e => set('nombre', e.target.value)} className="mt-1" /></div>
                            <div><Label className="text-xs">Referencia</Label><Input value={form.referencia || ''} onChange={e => set('referencia', e.target.value)} className="mt-1" /></div>
                            <div><Label className="text-xs">Categoría</Label><Input list="categorias-catalogo" value={form.categoria || ''} onChange={e => set('categoria', e.target.value)} className="mt-1" /><datalist id="categorias-catalogo">{categorias.map(c => <option key={c} value={c} />)}</datalist></div>
                            <div className="col-span-2"><Label className="text-xs">Descripción</Label><Textarea rows={2} value={form.descripcion || ''} onChange={e => set('descripcion', e.target.value)} className="mt-1" /></div>
                            <div><Label className="text-xs">Precio de coste (sin IVA)</Label><Input inputMode="decimal" value={form.precio_coste ?? ''} onChange={e => set('precio_coste', e.target.value)} className="mt-1" /></div>
                            <div><Label className="text-xs">Precio de venta (sin IVA)</Label><Input inputMode="decimal" value={form.precio_venta ?? ''} onChange={e => set('precio_venta', e.target.value)} className="mt-1" />{margen !== null && <p className={cn('text-[11px] mt-1', margen < 0 ? 'text-rose-600' : 'text-muted-foreground')}>Margen: {margen}%</p>}</div>
                            <div>
                                <Label className="text-xs">IVA</Label>
                                <Select value={String(form.iva_porcentaje)} onValueChange={v => set('iva_porcentaje', Number(v))}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>{[21, 10, 4, 0].map(n => <SelectItem key={n} value={String(n)}>{n}%</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div><Label className="text-xs">Unidad</Label><Input value={form.unidad || ''} onChange={e => set('unidad', e.target.value)} placeholder="ud, h, m, kg…" className="mt-1" /></div>
                            <div className="col-span-2">
                                <Label className="text-xs">Proveedor habitual</Label>
                                <Select value={form.proveedor_id || 'ninguno'} onValueChange={v => set('proveedor_id', v === 'ninguno' ? '' : v)}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="ninguno">Ninguno</SelectItem>{proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.razon_social}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-2"><Label className="text-xs">Notas</Label><Textarea rows={2} value={form.notas || ''} onChange={e => set('notas', e.target.value)} className="mt-1" /></div>
                            <div className="col-span-2 flex items-center gap-2"><Switch checked={form.activo !== false} onCheckedChange={v => set('activo', v)} /><span className="text-sm">Activo (aparece al crear documentos)</span></div>
                            <div className="col-span-2 flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
                                <Button onClick={guardar} disabled={guardando || !form.nombre?.trim()}>{guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Guardar</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Search, Truck, Phone, Mail, Loader2, Paperclip, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { supabase } from '@/lib/supabase'
import { cn, formatCurrency } from '@/lib/utils'
import { METODOS_PAGO, etiquetaMetodo } from '@/lib/cobros/vencimientos'
import { guardarProveedor, fichaProveedor } from '@/actions/maestros'
import { toast } from 'sonner'

const VACIO = { razon_social: '', cif: '', email: '', telefono: '', direccion: '', codigo_postal: '', ciudad: '', provincia: '', persona_contacto: '', metodo_pago: '', dias_pago: '', condiciones_pago: '', categoria_habitual: '', notas: '', activo: true }

export default function ProveedoresPage() {
    const params = useSearchParams()
    const [lista, setLista] = useState<any[] | null>(null)
    const [totales, setTotales] = useState<Record<string, number>>({})
    const [q, setQ] = useState('')
    const [inactivos, setInactivos] = useState(false)
    const [form, setForm] = useState<any>(null)
    const [guardando, setGuardando] = useState(false)
    const [ficha, setFicha] = useState<any>(null)

    const cargar = useCallback(async () => {
        const [{ data }, { data: gastos }] = await Promise.all([
            supabase.from('proveedores').select('*').order('razon_social'),
            supabase.from('gastos').select('proveedor_id, total').not('proveedor_id', 'is', null),
        ])
        const t: Record<string, number> = {}
        for (const g of gastos || []) t[g.proveedor_id] = (t[g.proveedor_id] || 0) + Number(g.total || 0)
        setTotales(t); setLista(data || [])
    }, [])
    useEffect(() => { cargar() }, [cargar])
    useEffect(() => { if (params.get('nuevo') === '1') setForm({ ...VACIO }) }, [params])

    const filtrados = useMemo(() => (lista || []).filter(p => {
        if (!!p.activo === inactivos) return false
        const t = q.toLowerCase().trim()
        return !t || [p.razon_social, p.cif, p.email, p.telefono, p.ciudad, p.persona_contacto].some(v => v && String(v).toLowerCase().includes(t))
    }), [lista, q, inactivos])

    const guardar = async () => {
        setGuardando(true)
        const r = await guardarProveedor(form)
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        toast.success(form.id ? 'Proveedor actualizado' : 'Proveedor creado')
        setForm(null); cargar()
    }

    const abrirFicha = async (id: string) => {
        setFicha({ cargando: true })
        const r = await fichaProveedor(id)
        if (!r.success) { toast.error(r.error); setFicha(null); return }
        setFicha(r)
    }

    const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">Proveedores</h1>
                    <p className="text-muted-foreground mt-1">Datos fiscales, condiciones de pago e histórico de compras.</p>
                </div>
                <Button onClick={() => setForm({ ...VACIO })} className="font-bold"><Plus className="h-4 w-4 mr-1" /> Nuevo proveedor</Button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, CIF, teléfono, ciudad…" className="pl-9" />
                </div>
                <Button variant={inactivos ? 'secondary' : 'ghost'} size="sm" onClick={() => setInactivos(v => !v)}>{inactivos ? 'Viendo inactivos' : 'Ver inactivos'}</Button>
            </div>

            {lista === null ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}</div>
            ) : filtrados.length === 0 ? (
                <EmptyState icon={Truck} title={q ? 'Sin resultados' : 'Sin proveedores'} description="Los proveedores se crean solos al registrar gastos, o puedes darlos de alta aquí." actionLabel="Nuevo proveedor" onAction={() => setForm({ ...VACIO })} />
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {filtrados.map(p => (
                        <button key={p.id} onClick={() => abrirFicha(p.id)} className="text-left rounded-2xl border bg-card p-4 hover:shadow-md hover:border-primary/30 transition-all duration-200">
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 flex items-center justify-center shrink-0"><Truck className="h-5 w-5" /></div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-extrabold truncate">{p.razon_social}</p>
                                    <p className="text-xs text-muted-foreground font-mono">{p.cif || 'Sin CIF'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Compras</p>
                                    <p className="text-sm font-bold tabular-nums">{formatCurrency(totales[p.id] || 0)}</p>
                                </div>
                            </div>
                            <div className="mt-3 text-xs text-muted-foreground space-y-1">
                                {p.telefono && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{p.telefono}</p>}
                                {p.email && <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3" />{p.email}</p>}
                                {p.metodo_pago && <p>Pago: {etiquetaMetodo(p.metodo_pago)}{p.dias_pago ? ` a ${p.dias_pago} días` : ''}</p>}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <Dialog open={!!form} onOpenChange={v => !v && setForm(null)}>
                <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>{form?.id ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle></DialogHeader>
                    {form && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2"><Label className="text-xs">Razón social *</Label><Input value={form.razon_social} onChange={e => set('razon_social', e.target.value)} className="mt-1" /></div>
                            <div><Label className="text-xs">CIF/NIF</Label><Input value={form.cif || ''} onChange={e => set('cif', e.target.value)} className="mt-1" /></div>
                            <div><Label className="text-xs">Persona de contacto</Label><Input value={form.persona_contacto || ''} onChange={e => set('persona_contacto', e.target.value)} className="mt-1" /></div>
                            <div><Label className="text-xs">Teléfono</Label><Input value={form.telefono || ''} onChange={e => set('telefono', e.target.value)} className="mt-1" /></div>
                            <div><Label className="text-xs">Email</Label><Input value={form.email || ''} onChange={e => set('email', e.target.value)} className="mt-1" /></div>
                            <div className="col-span-2"><Label className="text-xs">Dirección</Label><Input value={form.direccion || ''} onChange={e => set('direccion', e.target.value)} className="mt-1" /></div>
                            <div><Label className="text-xs">C.P.</Label><Input value={form.codigo_postal || ''} onChange={e => set('codigo_postal', e.target.value)} className="mt-1" /></div>
                            <div><Label className="text-xs">Ciudad</Label><Input value={form.ciudad || ''} onChange={e => set('ciudad', e.target.value)} className="mt-1" /></div>
                            <div>
                                <Label className="text-xs">Método de pago habitual</Label>
                                <Select value={form.metodo_pago || ''} onValueChange={v => set('metodo_pago', v)}>
                                    <SelectTrigger className="mt-1"><SelectValue placeholder="Sin indicar" /></SelectTrigger>
                                    <SelectContent>{METODOS_PAGO.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div><Label className="text-xs">Días de pago</Label><Input type="number" value={form.dias_pago ?? ''} onChange={e => set('dias_pago', e.target.value)} className="mt-1" /></div>
                            <div className="col-span-2"><Label className="text-xs">Condiciones de pago</Label><Input value={form.condiciones_pago || ''} onChange={e => set('condiciones_pago', e.target.value)} placeholder="Recibo domiciliado a 30 días…" className="mt-1" /></div>
                            <div className="col-span-2"><Label className="text-xs">Categoría habitual de gasto</Label><Input value={form.categoria_habitual || ''} onChange={e => set('categoria_habitual', e.target.value)} placeholder="Material, combustible…" className="mt-1" /></div>
                            <div className="col-span-2"><Label className="text-xs">Observaciones</Label><Textarea rows={3} value={form.notas || ''} onChange={e => set('notas', e.target.value)} className="mt-1" /></div>
                            <div className="col-span-2 flex items-center gap-2"><Switch checked={form.activo !== false} onCheckedChange={v => set('activo', v)} /><span className="text-sm">Activo</span></div>
                            <div className="col-span-2 flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
                                <Button onClick={guardar} disabled={guardando || !form.razon_social?.trim()}>{guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Guardar</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Sheet open={!!ficha} onOpenChange={v => !v && setFicha(null)}>
                <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
                    {!ficha || ficha.cargando ? (
                        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <>
                            <SheetHeader>
                                <SheetTitle className="text-xl font-black pr-8">{ficha.proveedor.razon_social}</SheetTitle>
                                <p className="text-sm text-muted-foreground font-mono">{ficha.proveedor.cif || 'Sin CIF'}</p>
                            </SheetHeader>
                            <div className="px-4 pb-10 space-y-5">
                                <Button size="sm" variant="outline" onClick={() => { setForm({ ...VACIO, ...ficha.proveedor }); setFicha(null) }}>Editar datos</Button>
                                <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/30 p-4 text-sm">
                                    <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Total compras</p><p className="font-black text-lg tabular-nums">{formatCurrency(ficha.totalCompras)}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Gastos registrados</p><p className="font-black text-lg">{ficha.gastos.length}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Pago</p><p className="font-semibold">{etiquetaMetodo(ficha.proveedor.metodo_pago)}{ficha.proveedor.dias_pago ? ` · ${ficha.proveedor.dias_pago} días` : ''}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Contacto</p><p className="font-semibold truncate">{ficha.proveedor.persona_contacto || ficha.proveedor.telefono || '—'}</p></div>
                                </div>
                                {ficha.proveedor.notas && <p className="text-sm rounded-lg bg-muted p-3 whitespace-pre-wrap">{ficha.proveedor.notas}</p>}
                                <div className="rounded-xl border p-3">
                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Histórico de compras y facturas de proveedor</p>
                                    {ficha.gastos.length === 0 ? <p className="text-sm text-muted-foreground">Sin gastos asociados.</p> : ficha.gastos.map((g: any) => (
                                        <div key={g.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0 text-sm">
                                            <div className="min-w-0">
                                                <p className="font-semibold truncate">{g.concepto || g.descripcion || g.numero}</p>
                                                <p className="text-xs text-muted-foreground">{g.fecha} · {g.categoria || 'Sin clasificar'}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {(g.archivo_url || g.factura_url) && <a href={g.archivo_url || g.factura_url} target="_blank" rel="noopener noreferrer" aria-label="Ver documento"><Paperclip className="h-4 w-4 text-primary" /></a>}
                                                <span className="font-bold tabular-nums">{formatCurrency(Number(g.total))}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="rounded-xl border p-3">
                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1"><Package className="h-3.5 w-3.5" /> Productos y materiales de este proveedor</p>
                                    {ficha.productos.length === 0 ? <p className="text-sm text-muted-foreground">Ninguno. Asígnalos desde el Catálogo.</p> : ficha.productos.map((p: any) => (
                                        <div key={p.id} className={cn('flex justify-between py-1.5 text-sm', !p.activo && 'opacity-50')}>
                                            <span>{p.nombre}{p.referencia ? ` (${p.referencia})` : ''}</span>
                                            <span className="tabular-nums">{formatCurrency(Number(p.precio_coste))}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    )
}

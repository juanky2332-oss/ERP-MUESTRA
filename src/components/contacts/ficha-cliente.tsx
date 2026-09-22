'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Pencil, Archive, ArchiveRestore, Plus, Trash2, Phone, Mail, MapPin, FileText, FileInput, Box, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { METODOS_PAGO, TIPOS_CONDICION, calcularVencimiento, describirCondicion, etiquetaMetodo, hoyISO } from '@/lib/cobros/vencimientos'
import { fichaCliente, guardarCondicionesCliente, archivarCliente, guardarPersonaContacto, guardarDireccion, eliminarSubregistro } from '@/actions/maestros'
import { EstadoCobroBadge } from '@/components/cobros/estado-cobro'
import { MarcarPagadaDialog } from '@/components/cobros/marcar-pagada-dialog'

function fecha(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function FichaClienteSheet({ clienteId, open, onOpenChange, onEditar }: { clienteId: string | null; open: boolean; onOpenChange: (v: boolean) => void; onEditar: (c: any) => void }) {
    const queryClient = useQueryClient()
    const [d, setD] = useState<any>(null)
    const [cond, setCond] = useState<any>({})
    const [guardando, setGuardando] = useState(false)
    const [pagar, setPagar] = useState<string | null>(null)

    const cargar = async () => {
        if (!clienteId) return
        const r = await fichaCliente(clienteId)
        if (!r.success) { toast.error(r.error); return }
        setD(r)
        const c = r.cliente
        setCond({
            metodo_pago: c.metodo_pago || '', metodo_pago_alternativo: c.metodo_pago_alternativo || '',
            condicion_pago_tipo: c.condicion_pago_tipo || 'dias', condicion_pago_dias: c.condicion_pago_dias ?? 30,
            condicion_pago_dia_mes: c.condicion_pago_dia_mes ?? 5, condicion_pago_meses: c.condicion_pago_meses ?? 1,
            condicion_pago_texto: c.condicion_pago_texto || '', condicion_pago_activa: c.condicion_pago_activa !== false,
            notas_internas: c.notas_internas || '', referencia: c.referencia || '', email_facturacion: c.email_facturacion || '', persona_contacto: c.persona_contacto || '',
        })
    }
    useEffect(() => { if (open) { setD(null); cargar() } }, [open, clienteId])

    const set = (k: string, v: any) => setCond((x: any) => ({ ...x, [k]: v }))
    const ejemplo = calcularVencimiento(hoyISO(), { tipo: cond.condicion_pago_tipo, dias: Number(cond.condicion_pago_dias), diaMes: Number(cond.condicion_pago_dia_mes), meses: Number(cond.condicion_pago_meses) })

    const guardar = async () => {
        setGuardando(true)
        const r = await guardarCondicionesCliente(clienteId!, cond)
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        toast.success('Condiciones guardadas'); cargar(); queryClient.invalidateQueries({ queryKey: ['contacts'] })
    }

    const archivar = async () => {
        const r = await archivarCliente(clienteId!, !d.cliente.archivado)
        if (!r.success) return toast.error(r.error)
        toast.success(d.cliente.archivado ? 'Cliente reactivado' : 'Cliente archivado')
        queryClient.invalidateQueries({ queryKey: ['contacts'] })
        onOpenChange(false)
    }

    const r = d?.resumen
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
                {!d ? (
                    <div className="flex justify-center py-24"><SheetTitle className="sr-only">Cargando ficha</SheetTitle><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                    <>
                        <SheetHeader>
                            <SheetTitle className="text-xl font-black pr-8">{d.cliente.razon_social}</SheetTitle>
                            <p className="text-sm text-muted-foreground font-mono">{d.cliente.cif}{d.cliente.referencia ? ` · Ref. ${d.cliente.referencia}` : ''}</p>
                        </SheetHeader>
                        <div className="px-4 pb-10 space-y-5">
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => onEditar(d.cliente)}><Pencil className="h-4 w-4 mr-1" /> Editar datos</Button>
                                <Button size="sm" variant="outline" asChild><Link href={`/presupuestos/new`}><FileText className="h-4 w-4 mr-1" /> Presupuesto</Link></Button>
                                <Button size="sm" variant="outline" asChild><Link href={`/facturas/new`}><FileInput className="h-4 w-4 mr-1" /> Factura</Link></Button>
                                <Button size="sm" variant="ghost" onClick={archivar}>{d.cliente.archivado ? <><ArchiveRestore className="h-4 w-4 mr-1" /> Reactivar</> : <><Archive className="h-4 w-4 mr-1" /> Archivar</>}</Button>
                            </div>

                            {/* Tarjeta rápida */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 rounded-2xl border bg-muted/30 p-4">
                                <Dato t="Facturado total" v={formatCurrency(r.facturado)} />
                                <Dato t="Cobrado total" v={formatCurrency(r.cobrado)} c="text-emerald-600" />
                                <Dato t="Pendiente de cobro" v={formatCurrency(r.pendiente)} c="text-amber-600" />
                                <Dato t="Facturas vencidas" v={`${r.vencidas}${r.vencidas ? ` · ${formatCurrency(r.vencidoImporte)}` : ''}`} c={r.vencidas ? 'text-rose-600' : ''} />
                                <Dato t="Método habitual" v={r.metodo} />
                                <Dato t="Plazo habitual" v={r.plazo} />
                                <Dato t="Última factura" v={r.ultimaFactura ? `${r.ultimaFactura.numero} · ${fecha(r.ultimaFactura.fecha)}` : '—'} />
                                <Dato t="Último cobro" v={r.ultimoCobro ? `${formatCurrency(Number(r.ultimoCobro.importe))} · ${fecha(r.ultimoCobro.fecha)}` : '—'} />
                                <Dato t="Último contacto" v={fecha(r.ultimoContacto)} />
                            </div>

                            <div className="text-sm space-y-1">
                                {d.cliente.telefono && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><a href={`tel:${d.cliente.telefono}`} className="font-medium">{d.cliente.telefono}</a></p>}
                                {d.cliente.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><a href={`mailto:${d.cliente.email}`} className="font-medium">{d.cliente.email}</a></p>}
                                {d.cliente.direccion && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{[d.cliente.direccion, d.cliente.codigo_postal, d.cliente.ciudad, d.cliente.provincia].filter(Boolean).join(', ')}</p>}
                            </div>

                            <Tabs defaultValue="cobro">
                                <TabsList className="w-full grid grid-cols-4">
                                    <TabsTrigger value="cobro">Pago</TabsTrigger>
                                    <TabsTrigger value="historial">Historial</TabsTrigger>
                                    <TabsTrigger value="contactos">Contactos</TabsTrigger>
                                    <TabsTrigger value="notas">Notas</TabsTrigger>
                                </TabsList>

                                <TabsContent value="cobro" className="space-y-3 pt-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs">Método habitual</Label>
                                            <Select value={cond.metodo_pago} onValueChange={v => set('metodo_pago', v)}>
                                                <SelectTrigger className="mt-1"><SelectValue placeholder="Sin indicar" /></SelectTrigger>
                                                <SelectContent>{METODOS_PAGO.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Método alternativo</Label>
                                            <Select value={cond.metodo_pago_alternativo} onValueChange={v => set('metodo_pago_alternativo', v)}>
                                                <SelectTrigger className="mt-1"><SelectValue placeholder="Ninguno" /></SelectTrigger>
                                                <SelectContent>{METODOS_PAGO.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs">Condición de pago</Label>
                                            <Select value={cond.condicion_pago_tipo} onValueChange={v => set('condicion_pago_tipo', v)}>
                                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                                <SelectContent>{TIPOS_CONDICION.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        {(cond.condicion_pago_tipo === 'dias' || cond.condicion_pago_tipo === 'fin_mes') && (
                                            <div>
                                                <Label className="text-xs">Días {cond.condicion_pago_tipo === 'fin_mes' ? '(antes de fin de mes)' : 'desde la factura'}</Label>
                                                <div className="flex gap-1 mt-1">
                                                    <Input type="number" min={0} value={cond.condicion_pago_dias} onChange={e => set('condicion_pago_dias', e.target.value)} />
                                                    {[30, 60, 90].map(n => <Button key={n} type="button" size="sm" variant="outline" onClick={() => set('condicion_pago_dias', n)}>{n}</Button>)}
                                                </div>
                                            </div>
                                        )}
                                        {cond.condicion_pago_tipo === 'dia_fijo' && (
                                            <>
                                                <div>
                                                    <Label className="text-xs">Día del mes</Label>
                                                    <Input type="number" min={1} max={31} value={cond.condicion_pago_dia_mes} onChange={e => set('condicion_pago_dia_mes', e.target.value)} className="mt-1" />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Meses después</Label>
                                                    <Input type="number" min={0} max={12} value={cond.condicion_pago_meses} onChange={e => set('condicion_pago_meses', e.target.value)} className="mt-1" />
                                                </div>
                                            </>
                                        )}
                                        <div className="col-span-2">
                                            <Label className="text-xs">Texto de la condición (aparece en la factura)</Label>
                                            <Input value={cond.condicion_pago_texto} onChange={e => set('condicion_pago_texto', e.target.value)} placeholder={describirCondicion({ tipo: cond.condicion_pago_tipo, dias: Number(cond.condicion_pago_dias), diaMes: Number(cond.condicion_pago_dia_mes), meses: Number(cond.condicion_pago_meses) }, cond.metodo_pago)} className="mt-1" />
                                        </div>
                                        <div className="col-span-2 flex items-center gap-2"><Switch checked={cond.condicion_pago_activa} onCheckedChange={v => set('condicion_pago_activa', v)} /><span className="text-sm">Condición activa (si se desactiva, se usan 30 días)</span></div>
                                    </div>
                                    <p className="text-xs rounded-lg bg-muted p-2">Ejemplo: una factura emitida hoy vencería <b>{ejemplo ? fecha(ejemplo) : 'sin fecha automática'}</b>.</p>
                                    <Button onClick={guardar} disabled={guardando} className="w-full">{guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Guardar condiciones</Button>
                                </TabsContent>

                                <TabsContent value="historial" className="space-y-4 pt-3">
                                    <Bloque titulo="Facturas" icono={FileInput} vacio="Sin facturas">
                                        {d.facturas.slice(0, 20).map((f: any) => (
                                            <div key={f.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0 text-sm">
                                                <div><p className="font-bold">{f.numero}</p><p className="text-xs text-muted-foreground">{fecha(f.fecha)}</p></div>
                                                <div className="flex items-center gap-2">
                                                    <EstadoCobroBadge info={f.info} compacto />
                                                    <span className="font-bold tabular-nums">{formatCurrency(f.info.total)}</span>
                                                    {f.info.estado !== 'pagada' && <Button size="sm" variant="outline" className="h-7" onClick={() => setPagar(f.id)}>Pagada</Button>}
                                                </div>
                                            </div>
                                        ))}
                                    </Bloque>
                                    <Bloque titulo="Cobros" icono={Wallet} vacio="Sin cobros">
                                        {d.cobros.map((c: any) => (
                                            <div key={c.id} className="flex justify-between py-2 border-b last:border-0 text-sm">
                                                <span>{fecha(c.fecha)} · {etiquetaMetodo(c.metodo)}{c.estado === 'propuesto' ? ' · propuesto' : ''}</span>
                                                <span className="font-bold tabular-nums text-emerald-600">{formatCurrency(Number(c.importe))}</span>
                                            </div>
                                        ))}
                                    </Bloque>
                                    <Bloque titulo="Presupuestos" icono={FileText} vacio="Sin presupuestos">
                                        {d.presupuestos.map((p: any) => (
                                            <div key={p.id} className="flex justify-between py-2 border-b last:border-0 text-sm">
                                                <span><b>{p.numero}</b> · {fecha(p.fecha)} · {p.aceptado ? 'Aceptado' : p.rechazado ? 'Rechazado' : (p.statuses || []).includes('traspasado') ? 'Convertido' : 'Pendiente'}</span>
                                                <span className="font-bold tabular-nums">{formatCurrency(Number(p.total))}</span>
                                            </div>
                                        ))}
                                    </Bloque>
                                    <Bloque titulo="Albaranes" icono={Box} vacio="Sin albaranes">
                                        {d.albaranes.map((a: any) => (
                                            <div key={a.id} className="flex justify-between py-2 border-b last:border-0 text-sm">
                                                <span><b>{a.numero}</b> · {fecha(a.fecha)}{(a.statuses || []).includes('traspasado') ? ' · facturado' : ''}</span>
                                                <span className="font-bold tabular-nums">{formatCurrency(Number(a.total))}</span>
                                            </div>
                                        ))}
                                    </Bloque>
                                    <Bloque titulo="Correos enviados" icono={Mail} vacio="Sin correos">
                                        {d.correos.map((m: any) => (
                                            <div key={m.id} className="py-2 border-b last:border-0 text-sm">
                                                <p className="font-semibold">{m.asunto}</p>
                                                <p className="text-xs text-muted-foreground">{fecha(m.created_at)} · {m.tipo_documento} · {m.destinatario}</p>
                                            </div>
                                        ))}
                                    </Bloque>
                                </TabsContent>

                                <TabsContent value="contactos" className="space-y-4 pt-3">
                                    <Personas clienteId={clienteId!} personas={d.personas} onChange={cargar} />
                                    <Direcciones clienteId={clienteId!} direcciones={d.direcciones} onChange={cargar} />
                                </TabsContent>

                                <TabsContent value="notas" className="space-y-3 pt-3">
                                    <div>
                                        <Label className="text-xs">Email de facturación</Label>
                                        <Input value={cond.email_facturacion} onChange={e => set('email_facturacion', e.target.value)} className="mt-1" />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Referencia interna</Label>
                                        <Input value={cond.referencia} onChange={e => set('referencia', e.target.value)} className="mt-1" />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Notas internas (no salen en documentos)</Label>
                                        <Textarea rows={6} value={cond.notas_internas} onChange={e => set('notas_internas', e.target.value)} className="mt-1" />
                                    </div>
                                    <Button onClick={guardar} disabled={guardando} className="w-full">Guardar</Button>
                                </TabsContent>
                            </Tabs>
                        </div>
                        <MarcarPagadaDialog facturaId={pagar} open={!!pagar} onOpenChange={v => !v && setPagar(null)} onDone={cargar} />
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}

function Dato({ t, v, c }: { t: string; v: string; c?: string }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">{t}</p>
            <p className={`text-sm font-bold truncate ${c || ''}`} title={v}>{v}</p>
        </div>
    )
}

function Bloque({ titulo, icono: Icono, vacio, children }: { titulo: string; icono: any; vacio: string; children: any }) {
    const hijos = Array.isArray(children) ? children : [children]
    return (
        <div className="rounded-xl border p-3">
            <p className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5 mb-1"><Icono className="h-3.5 w-3.5" /> {titulo}</p>
            {hijos.length === 0 ? <p className="text-sm text-muted-foreground py-1">{vacio}</p> : children}
        </div>
    )
}

function Personas({ clienteId, personas, onChange }: { clienteId: string; personas: any[]; onChange: () => void }) {
    const [n, setN] = useState({ nombre: '', cargo: '', email: '', telefono: '' })
    const add = async () => {
        const r = await guardarPersonaContacto({ ...n, cliente_id: clienteId, principal: personas.length === 0 })
        if (!r.success) return toast.error(r.error)
        setN({ nombre: '', cargo: '', email: '', telefono: '' }); onChange()
    }
    return (
        <div className="rounded-xl border p-3 space-y-2">
            <p className="text-xs font-bold uppercase text-muted-foreground">Personas de contacto</p>
            {personas.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5">
                    <div><p className="font-semibold">{p.nombre}{p.cargo ? ` · ${p.cargo}` : ''}</p><p className="text-xs text-muted-foreground">{[p.telefono, p.email].filter(Boolean).join(' · ')}</p></div>
                    <button onClick={async () => { await eliminarSubregistro('contacto_personas', p.id); onChange() }} aria-label="Eliminar"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-rose-600" /></button>
                </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Nombre" value={n.nombre} onChange={e => setN({ ...n, nombre: e.target.value })} />
                <Input placeholder="Cargo" value={n.cargo} onChange={e => setN({ ...n, cargo: e.target.value })} />
                <Input placeholder="Teléfono" value={n.telefono} onChange={e => setN({ ...n, telefono: e.target.value })} />
                <Input placeholder="Email" value={n.email} onChange={e => setN({ ...n, email: e.target.value })} />
            </div>
            <Button size="sm" variant="outline" onClick={add} disabled={!n.nombre.trim()}><Plus className="h-4 w-4 mr-1" /> Añadir persona</Button>
        </div>
    )
}

function Direcciones({ clienteId, direcciones, onChange }: { clienteId: string; direcciones: any[]; onChange: () => void }) {
    const [n, setN] = useState({ tipo: 'envio', direccion: '', codigo_postal: '', ciudad: '', provincia: '' })
    const add = async () => {
        const r = await guardarDireccion({ ...n, cliente_id: clienteId })
        if (!r.success) return toast.error(r.error)
        setN({ tipo: 'envio', direccion: '', codigo_postal: '', ciudad: '', provincia: '' }); onChange()
    }
    const etiqueta: Record<string, string> = { facturacion: 'Facturación', envio: 'Envío', servicio: 'Servicio', otra: 'Otra' }
    return (
        <div className="rounded-xl border p-3 space-y-2">
            <p className="text-xs font-bold uppercase text-muted-foreground">Direcciones</p>
            {direcciones.map(d => (
                <div key={d.id} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5">
                    <div><p className="font-semibold">{etiqueta[d.tipo] || d.tipo}</p><p className="text-xs text-muted-foreground">{[d.direccion, d.codigo_postal, d.ciudad, d.provincia].filter(Boolean).join(', ')}</p></div>
                    <button onClick={async () => { await eliminarSubregistro('contacto_direcciones', d.id); onChange() }} aria-label="Eliminar"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-rose-600" /></button>
                </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
                <Select value={n.tipo} onValueChange={v => setN({ ...n, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(etiqueta).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="Dirección" value={n.direccion} onChange={e => setN({ ...n, direccion: e.target.value })} />
                <Input placeholder="C.P." value={n.codigo_postal} onChange={e => setN({ ...n, codigo_postal: e.target.value })} />
                <Input placeholder="Ciudad" value={n.ciudad} onChange={e => setN({ ...n, ciudad: e.target.value })} />
            </div>
            <Button size="sm" variant="outline" onClick={add} disabled={!n.direccion.trim()}><Plus className="h-4 w-4 mr-1" /> Añadir dirección</Button>
        </div>
    )
}

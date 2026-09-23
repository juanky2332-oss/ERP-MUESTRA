'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Camera, CheckCircle2, Eye, FileSignature, FileStack, Link2, Loader2, Pencil, Search, Trash2, Upload, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatCurrency } from '@/lib/utils'
import { listarFirmados, unirFirmado, corregirFirmado, borrarFirmado, sugerenciasDe } from '@/actions/firmados'
import { SubirFirmadoDialog, ElegirDestino, TIPOS, type Destino } from '@/components/firmados/subir-firmado-dialog'

const ESTADOS = [
    { v: 'todos', l: 'Todos' },
    { v: 'pendientes', l: 'Pendientes de unir' },
    { v: 'unidos', l: 'Unidos' },
    { v: 'incidencias', l: 'Con incidencias' },
    { v: 'sin_firma', l: 'Sin firma detectada' },
]
const tipoCorto = (t: string) => ({ albaran: 'Albarán', parte_trabajo: 'Parte de trabajo', recepcion_material: 'Recepción', otro: 'Otro' } as any)[t] || 'Documento'
const fechaES = (f?: string | null) => (f ? new Date(f).toLocaleDateString('es-ES') : '—')

export default function DocumentosFirmadosPage() {
    const [estado, setEstado] = useState('todos')
    const [tipo, setTipo] = useState('todos')
    const [texto, setTexto] = useState('')
    const [desde, setDesde] = useState('')
    const [hasta, setHasta] = useState('')
    const [datos, setDatos] = useState<{ documentos: any[]; estado: any } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [subida, setSubida] = useState<{ archivos: File[]; destino?: Destino | null } | null>(null)
    const [pendienteDestino, setPendienteDestino] = useState<Destino | null>(null)
    const [unir, setUnir] = useState<any>(null)
    const [editar, setEditar] = useState<any>(null)
    const [ver, setVer] = useState<any>(null)
    const [panel, setPanel] = useState<'albaranes' | 'facturas' | null>(null)
    const inputArchivos = useRef<HTMLInputElement>(null)
    const inputCamara = useRef<HTMLInputElement>(null)

    useEffect(() => { const q = new URLSearchParams(window.location.search).get('q'); if (q) setTexto(q) }, [])

    const cargar = useCallback(async () => {
        const r = await listarFirmados({ estado, tipo, texto, desde, hasta })
        if (!r.success) { setError(r.error || 'Error'); return }
        setError(null); setDatos({ documentos: r.documentos, estado: r.estado })
    }, [estado, tipo, texto, desde, hasta])
    useEffect(() => { const t = setTimeout(cargar, texto ? 300 : 0); return () => clearTimeout(t) }, [cargar, texto])

    const elegirArchivos = (files: FileList | null, destino?: Destino | null) => {
        const lista = Array.from(files || [])
        if (lista.length) setSubida({ archivos: lista, destino })
    }
    const subirPara = (d: Destino) => { setPendienteDestino(d); inputArchivos.current?.click() }

    const e = datos?.estado
    const tarjetas = [
        { k: 'pendientes', t: 'Pendientes de unir', v: e?.pendientesDeUnir ?? 0, d: 'Subidos sin albarán ni factura', c: 'text-amber-600', accion: () => setEstado('pendientes') },
        { k: 'albaranes', t: 'Albaranes sin firma', v: e?.albaranesSinFirma?.length ?? 0, d: 'Entregados en los últimos 120 días', c: 'text-rose-600', accion: () => setPanel('albaranes') },
        { k: 'facturas', t: 'Facturas sin soporte firmado', v: e?.facturasSinSoporte?.length ?? 0, d: 'Sin albarán o parte firmado', c: 'text-rose-600', accion: () => setPanel('facturas') },
        { k: 'incidencias', t: 'Con incidencias', v: e?.conIncidencias ?? 0, d: 'El cliente anotó faltas o reservas', c: 'text-orange-600', accion: () => setEstado('incidencias') },
    ]

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">Albaranes y partes firmados</h1>
                    <p className="text-muted-foreground mt-1 max-w-2xl">Sube la foto o el PDF de lo que te firma el cliente (entrega, parte de trabajo, recepción de material). La IA lo lee y lo une a su albarán y factura para tenerlo todo cuadrado.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <input ref={inputArchivos} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={ev => { elegirArchivos(ev.target.files, pendienteDestino); setPendienteDestino(null); ev.target.value = '' }} />
                    <input ref={inputCamara} type="file" accept="image/*" capture="environment" className="hidden" onChange={ev => { elegirArchivos(ev.target.files); ev.target.value = '' }} />
                    <Button variant="outline" className="md:hidden" onClick={() => inputCamara.current?.click()}><Camera className="h-4 w-4 mr-1" /> Hacer foto</Button>
                    <Button onClick={() => inputArchivos.current?.click()} className="font-bold"><Upload className="h-4 w-4 mr-1" /> Subir documento firmado</Button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {tarjetas.map(t => (
                    <button key={t.k} onClick={t.accion} className="rounded-2xl border bg-card p-4 text-left hover:shadow-md transition-shadow">
                        <p className="text-xs font-bold text-muted-foreground">{t.t}</p>
                        <p className={cn('text-2xl font-black tabular-nums mt-1', t.v ? t.c : 'text-emerald-600')}>{datos ? t.v : '…'}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t.d}</p>
                    </button>
                ))}
            </div>

            <div className="rounded-2xl border bg-card p-3 flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="flex gap-1 flex-wrap">
                    {ESTADOS.map(s => <button key={s.v} onClick={() => setEstado(s.v)} className={cn('rounded-full px-3 py-1.5 text-xs font-bold', estado === s.v ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>{s.l}</button>)}
                </div>
                <div className="flex gap-2 flex-wrap lg:ml-auto">
                    <select value={tipo} onChange={ev => setTipo(ev.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                        <option value="todos">Todos los tipos</option>
                        {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <Input type="date" value={desde} onChange={ev => setDesde(ev.target.value)} className="w-auto" title="Subidos desde" />
                    <Input type="date" value={hasta} onChange={ev => setHasta(ev.target.value)} className="w-auto" title="Subidos hasta" />
                    <div className="relative"><Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" /><Input value={texto} onChange={ev => setTexto(ev.target.value)} placeholder="Nº, cliente, firmante…" className="pl-9 w-52" /></div>
                </div>
            </div>

            {error ? <EmptyState icon={FileSignature} title="No disponible" description={error} /> : !datos ? (
                <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
            ) : datos.documentos.length === 0 ? (
                <EmptyState icon={FileSignature} title={estado === 'todos' && !texto ? 'Aún no hay documentos firmados' : 'Nada con estos filtros'}
                    description="Cuando entregues material o hagas un trabajo, sube aquí la copia firmada por el cliente: quedará unida a su albarán y factura."
                    actionLabel="Subir documento firmado" onAction={() => inputArchivos.current?.click()} />
            ) : (
                <div className="grid gap-3">
                    {datos.documentos.map((d: any) => (
                        <div key={d.id} className="rounded-2xl border bg-card p-4 flex flex-col md:flex-row md:items-center gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', d.firmado === false ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600')}><FileSignature className="h-5 w-5" /></div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-extrabold">{tipoCorto(d.tipo)} {d.numero_documento || ''}</span>
                                        {d.firmado === false && <span className="text-[10px] font-bold rounded-full bg-rose-500/10 text-rose-600 px-2 py-0.5">sin firma detectada</span>}
                                        {d.con_incidencias && <span className="text-[10px] font-bold rounded-full bg-orange-500/10 text-orange-600 px-2 py-0.5 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> incidencias</span>}
                                        {d.origen === 'telegram' && <span className="text-[10px] font-bold rounded-full bg-sky-500/10 text-sky-600 px-2 py-0.5">Telegram</span>}
                                    </div>
                                    <p className="text-sm text-muted-foreground truncate">{d.cliente_razon_social || 'Cliente sin identificar'} · {fechaES(d.fecha_documento || d.created_at)}{d.firmante_nombre ? ` · firmó ${d.firmante_nombre}` : ''}{d.horas ? ` · ${d.horas} h` : ''}</p>
                                    {d.con_incidencias && <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5 line-clamp-2">«{d.incidencias}»</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {d.albaranes || d.facturas ? (
                                    <>
                                        {d.albaranes && <Link href={`/albaranes?q=${encodeURIComponent(d.albaranes.numero)}`} className="text-xs font-bold rounded-full bg-primary/10 text-primary px-2.5 py-1">Albarán {d.albaranes.numero}</Link>}
                                        {d.facturas && <Link href={`/facturas?q=${encodeURIComponent(d.facturas.numero)}`} className="text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-1">Factura {d.facturas.numero}</Link>}
                                    </>
                                ) : <span className="text-xs font-bold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2.5 py-1">Pendiente de unir</span>}
                            </div>
                            <div className="flex gap-1 md:ml-2">
                                <Button size="icon" variant="ghost" title="Ver documento" onClick={() => setVer(d)}><Eye className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" title={d.albaran_id || d.factura_id ? 'Cambiar a qué documento está unido' : 'Unir a albarán o factura'} onClick={() => setUnir(d)}><Link2 className="h-4 w-4" /></Button>
                                {d.factura_id && <Button size="icon" variant="ghost" title="Expediente PDF (factura + albarán + firma)" asChild><a href={`/api/expediente/${d.factura_id}`} target="_blank" rel="noreferrer"><FileStack className="h-4 w-4" /></a></Button>}
                                <Button size="icon" variant="ghost" title="Corregir datos" onClick={() => setEditar({ ...d })}><Pencil className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" title="Eliminar" onClick={async () => {
                                    if (!confirm('¿Eliminar este documento firmado? Se quitará también de su albarán y factura.')) return
                                    const r = await borrarFirmado(d.id); if (!r.success) return toast.error(r.error)
                                    toast.success('Eliminado'); cargar()
                                }}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {subida && <SubirFirmadoDialog archivos={subida.archivos} destinoInicial={subida.destino} onCerrar={() => setSubida(null)} onGuardado={cargar} />}
            {unir && <UnirDialog doc={unir} onCerrar={() => setUnir(null)} onHecho={cargar} />}
            {editar && <EditarDialog doc={editar} onCerrar={() => setEditar(null)} onHecho={cargar} />}

            <Dialog open={!!ver} onOpenChange={v => !v && setVer(null)}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader><DialogTitle>{ver && `${tipoCorto(ver.tipo)} ${ver.numero_documento || ''}`}</DialogTitle><DialogDescription>{ver?.cliente_razon_social}</DialogDescription></DialogHeader>
                    {ver && (ver.archivo_tipo === 'application/pdf' || /\.pdf$/i.test(ver.archivo_url)
                        ? <iframe src={ver.archivo_url} className="w-full h-[72vh] rounded-xl border" title="Documento firmado" />
                        : <img src={ver.archivo_url} alt="Documento firmado" className="max-h-[72vh] w-full object-contain rounded-xl border" />)}
                    {ver && <a href={ver.archivo_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary">Abrir en otra pestaña</a>}
                </DialogContent>
            </Dialog>

            <Dialog open={!!panel} onOpenChange={v => !v && setPanel(null)}>
                <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{panel === 'albaranes' ? 'Albaranes entregados sin firma' : 'Facturas sin soporte firmado'}</DialogTitle>
                        <DialogDescription>{panel === 'albaranes' ? 'Consigue la firma del cliente y súbela: si luego hay una reclamación, tendrás la prueba de entrega.' : 'Facturas que no tienen ningún albarán o parte firmado unido.'}</DialogDescription>
                    </DialogHeader>
                    <div className="divide-y">
                        {((panel === 'albaranes' ? e?.albaranesSinFirma : e?.facturasSinSoporte) || []).length === 0 && <p className="py-6 text-center text-sm text-emerald-600 font-bold flex items-center justify-center gap-2"><CheckCircle2 className="h-4 w-4" /> Todo cuadrado</p>}
                        {((panel === 'albaranes' ? e?.albaranesSinFirma : e?.facturasSinSoporte) || []).map((x: any) => (
                            <div key={x.id} className="py-2.5 flex items-center justify-between gap-3">
                                <div className="min-w-0"><p className="font-bold text-sm">{x.numero}</p><p className="text-xs text-muted-foreground truncate">{x.cliente_razon_social} · {fechaES(x.fecha)} · {formatCurrency(Number(x.total || 0))}</p></div>
                                <Button size="sm" variant="outline" onClick={() => { const tipoDest = panel === 'albaranes' ? 'albaran' : 'factura'; setPanel(null); subirPara({ tipo: tipoDest, id: x.id, numero: x.numero, cliente: x.cliente_razon_social, fecha: x.fecha, total: Number(x.total || 0), motivo: 'elegido por ti' }) }}><Upload className="h-3.5 w-3.5 mr-1" /> Subir firmado</Button>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function UnirDialog({ doc, onCerrar, onHecho }: { doc: any; onCerrar: () => void; onHecho: () => void }) {
    const [candidatos, setCandidatos] = useState<Destino[] | null>(null)
    const [elegido, setElegido] = useState<Destino | 'ninguno' | null>(null)
    const [guardando, setGuardando] = useState(false)
    useEffect(() => { sugerenciasDe(doc.id).then(r => setCandidatos(r.candidatos as Destino[])) }, [doc.id])
    const guardar = async () => {
        if (!elegido) return
        setGuardando(true)
        const r = await unirFirmado(doc.id, elegido === 'ninguno' ? { albaran_id: null, factura_id: null } : elegido.tipo === 'albaran' ? { albaran_id: elegido.id } : { albaran_id: null, factura_id: elegido.id })
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        toast.success(elegido === 'ninguno' ? 'Documento soltado: queda pendiente de unir' : `Unido a ${elegido.tipo === 'albaran' ? 'albarán' : 'factura'} ${elegido.numero}`)
        onHecho(); onCerrar()
    }
    return (
        <Dialog open onOpenChange={v => !v && onCerrar()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>¿A qué documento lo unes?</DialogTitle>
                    <DialogDescription>{tipoCorto(doc.tipo)} {doc.numero_documento || ''} · {doc.cliente_razon_social || 'cliente sin identificar'}{doc.albaranes || doc.facturas ? ` — ahora unido a ${[doc.albaranes?.numero, doc.facturas?.numero].filter(Boolean).join(' y ')}` : ''}</DialogDescription>
                </DialogHeader>
                {!candidatos ? <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : <ElegirDestino candidatos={candidatos} elegido={elegido} onElegir={setElegido} />}
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
                    <Button onClick={guardar} disabled={!elegido || guardando}>{guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : elegido === 'ninguno' ? <Unlink className="h-4 w-4 mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}{elegido === 'ninguno' ? 'Soltar' : 'Unir'}</Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function EditarDialog({ doc, onCerrar, onHecho }: { doc: any; onCerrar: () => void; onHecho: () => void }) {
    const [d, setD] = useState<any>(doc)
    const [guardando, setGuardando] = useState(false)
    const set = (k: string, v: any) => setD((x: any) => ({ ...x, [k]: v }))
    const guardar = async () => {
        setGuardando(true)
        const r = await corregirFirmado(doc.id, { tipo: d.tipo, numero_documento: d.numero_documento, fecha_documento: d.fecha_documento || null, firmado: d.firmado !== false, firmante_nombre: d.firmante_nombre, firmante_dni: d.firmante_dni, incidencias: d.incidencias, descripcion: d.descripcion, horas: d.horas ? Number(d.horas) : null })
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        toast.success('Datos corregidos'); onHecho(); onCerrar()
    }
    return (
        <Dialog open onOpenChange={v => !v && onCerrar()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Corregir datos</DialogTitle><DialogDescription>Lo que cambies aquí se refleja en el albarán, la factura y el expediente.</DialogDescription></DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Label className="text-xs">Qué es</Label>
                        <select value={d.tipo} onChange={e => set('tipo', e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                    <div><Label className="text-xs">Nº en el papel</Label><Input value={d.numero_documento || ''} onChange={e => set('numero_documento', e.target.value)} className="mt-1" /></div>
                    <div><Label className="text-xs">Fecha</Label><Input type="date" value={d.fecha_documento || ''} onChange={e => set('fecha_documento', e.target.value)} className="mt-1" /></div>
                    <div><Label className="text-xs">Firmado por</Label><Input value={d.firmante_nombre || ''} onChange={e => set('firmante_nombre', e.target.value)} className="mt-1" /></div>
                    <div><Label className="text-xs">DNI</Label><Input value={d.firmante_dni || ''} onChange={e => set('firmante_dni', e.target.value)} className="mt-1" /></div>
                    {d.tipo === 'parte_trabajo' && <div><Label className="text-xs">Horas</Label><Input type="number" step="0.25" value={d.horas ?? ''} onChange={e => set('horas', e.target.value)} className="mt-1" /></div>}
                    <label className="flex items-center gap-2 text-sm col-span-2"><Switch checked={d.firmado !== false} onCheckedChange={v => set('firmado', v)} /> Está firmado por el cliente</label>
                    <div className="col-span-2"><Label className="text-xs">Trabajo o material</Label><Textarea rows={2} value={d.descripcion || ''} onChange={e => set('descripcion', e.target.value)} className="mt-1" /></div>
                    <div className="col-span-2"><Label className="text-xs">Incidencias</Label><Textarea rows={2} value={d.incidencias || ''} onChange={e => set('incidencias', e.target.value)} className="mt-1" /></div>
                </div>
                <div className="flex justify-end gap-2"><Button variant="outline" onClick={onCerrar}>Cancelar</Button><Button onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Guardar</Button></div>
            </DialogContent>
        </Dialog>
    )
}

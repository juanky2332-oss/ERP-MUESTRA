'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSignature, Link2, Loader2, Search, Sparkles, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn, formatCurrency } from '@/lib/utils'
import { subirArchivoPrivado } from '@/lib/archivos-cliente'
import { prepararImagen } from '@/lib/imagen-cliente'
import { analizarFirmado, buscarParaUnir, guardarFirmado } from '@/actions/firmados'

export const TIPOS = [
    { value: 'albaran', label: 'Albarán de entrega' },
    { value: 'parte_trabajo', label: 'Parte de trabajo / servicio' },
    { value: 'recepcion_material', label: 'Recepción de material' },
    { value: 'otro', label: 'Otro documento firmado' },
]

export type Destino = { tipo: 'albaran' | 'factura'; id: string; numero: string; cliente?: string; fecha?: string; total?: number; factura_numero?: string | null; ya_firmado?: boolean; motivo?: string; puntos?: number }

const fechaES = (f?: string | null) => (f ? new Date(f).toLocaleDateString('es-ES') : '')

/** Lista de destinos (sugeridos + buscador) para elegir a qué documento se une. */
export function ElegirDestino({ candidatos, elegido, onElegir, permitirNinguno = true }: {
    candidatos: Destino[]; elegido: Destino | null | 'ninguno'; onElegir: (d: Destino | 'ninguno') => void; permitirNinguno?: boolean
}) {
    const [q, setQ] = useState('')
    const [resultados, setResultados] = useState<Destino[] | null>(null)
    const [buscando, setBuscando] = useState(false)
    useEffect(() => {
        if (!q.trim()) { setResultados(null); return }
        const t = setTimeout(async () => {
            setBuscando(true)
            const r = await buscarParaUnir(q)
            setResultados(r.resultados as Destino[]); setBuscando(false)
        }, 300)
        return () => clearTimeout(t)
    }, [q])
    const lista = resultados ?? candidatos
    const sel = (d: Destino) => elegido !== 'ninguno' && elegido?.id === d.id && elegido?.tipo === d.tipo
    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar otro albarán o factura por número o cliente…" className="pl-9" />
                {buscando && <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-2.5 text-muted-foreground" />}
            </div>
            {!resultados && candidatos.length > 0 && <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Sugeridos por la IA</p>}
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {lista.length === 0 && <p className="text-sm text-muted-foreground py-2">{resultados ? 'Sin resultados.' : 'No hay ninguna coincidencia clara. Búscalo arriba o déjalo pendiente de unir.'}</p>}
                {lista.map(d => (
                    <button key={d.tipo + d.id} type="button" onClick={() => onElegir(d)}
                        className={cn('w-full text-left rounded-xl border px-3 py-2 transition-colors', sel(d) ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60')}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm">{d.tipo === 'albaran' ? 'Albarán' : 'Factura'} {d.numero}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{d.total != null ? formatCurrency(d.total) : ''}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{d.cliente} · {fechaES(d.fecha)}{d.factura_numero ? ` · facturado en ${d.factura_numero}` : ''}</div>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                            {d.motivo && d.motivo !== 'reciente' && <span className="text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">{d.motivo}</span>}
                            {d.ya_firmado && <span className="text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5">ya tiene un firmado</span>}
                        </div>
                    </button>
                ))}
            </div>
            {permitirNinguno && (
                <button type="button" onClick={() => onElegir('ninguno')}
                    className={cn('w-full text-left rounded-xl border border-dashed px-3 py-2 text-sm flex items-center gap-2', elegido === 'ninguno' ? 'border-primary bg-primary/5' : 'hover:bg-muted/60')}>
                    <Unlink className="h-4 w-4" /> No unir ahora (queda en «Pendientes de unir»)
                </button>
            )}
        </div>
    )
}

type Paso = { file: File; estado: 'subiendo' | 'leyendo' | 'listo' | 'error'; url?: string; vista?: string; esPdf?: boolean; datos?: any; candidatos?: Destino[]; error?: string }

/**
 * Asistente de subida: sube cada archivo (reducido si es foto), la IA lo lee,
 * se revisan los datos y se pregunta a qué documento se une.
 */
export function SubirFirmadoDialog({ archivos, destinoInicial, onCerrar, onGuardado }: {
    archivos: File[]; destinoInicial?: Destino | null; onCerrar: () => void; onGuardado: () => void
}) {
    const [i, setI] = useState(0)
    const [pasos, setPasos] = useState<Paso[]>(() => archivos.map(file => ({ file, estado: 'subiendo' })))
    const [datos, setDatos] = useState<any>({})
    const [destino, setDestino] = useState<Destino | null | 'ninguno'>(null)
    const [guardando, setGuardando] = useState(false)
    const actual = pasos[i]

    const actualizar = (k: number, p: Partial<Paso>) => setPasos(ps => ps.map((x, j) => (j === k ? { ...x, ...p } : x)))

    // Procesa todos los archivos en segundo plano, uno tras otro
    useEffect(() => {
        let vivo = true
        ;(async () => {
            for (let k = 0; k < archivos.length; k++) {
                const f = archivos[k]
                try {
                    const esPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
                    let subir: File = f, vista: string | undefined
                    if (!esPdf) {
                        if (!f.type.startsWith('image/')) throw new Error('Formato no admitido: sube una foto o un PDF.')
                        const img = await prepararImagen(f, 2200, { soloJpeg: true })
                        subir = new File([img.blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
                        vista = img.dataUrl
                    } else {
                        if (f.size > 15 * 1024 * 1024) throw new Error('El PDF supera 15 MB.')
                        vista = URL.createObjectURL(f)
                    }
                    const url = await subirArchivoPrivado('albaranes-firmados', subir, 'firmado')
                    if (!vivo) return
                    actualizar(k, { estado: 'leyendo', url, vista, esPdf })
                    const r = await analizarFirmado(url)
                    if (!vivo) return
                    if (!r.success) actualizar(k, { estado: 'listo', datos: {}, candidatos: [], error: 'La IA no pudo leerlo: ' + r.error + '. Rellena los datos a mano.' })
                    else actualizar(k, { estado: 'listo', datos: r.datos, candidatos: r.candidatos as Destino[] })
                } catch (e: any) {
                    if (vivo) actualizar(k, { estado: 'error', error: e?.message || 'No se pudo subir' })
                }
            }
        })()
        return () => { vivo = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Al llegar al documento actual listo: cargar sus datos y el destino propuesto
    useEffect(() => {
        if (actual?.estado !== 'listo') return
        setDatos({ tipo: 'albaran', ...(actual.datos || {}) })
        const cands = actual.candidatos || []
        if (destinoInicial) setDestino(destinoInicial)
        else if (cands[0] && (cands[0].puntos || 0) >= 60) setDestino(cands[0])
        else setDestino(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [i, actual?.estado])

    const set = (k: string, v: any) => setDatos((d: any) => ({ ...d, [k]: v }))
    const siguiente = () => { if (i + 1 < pasos.length) setI(i + 1); else { onGuardado(); onCerrar() } }

    const guardar = async () => {
        if (!actual?.url) return
        if (!destino) return toast.error('Elige a qué documento lo unes, o marca «No unir ahora».')
        if (datos.firmado === false && !confirm('La IA no ve ninguna firma en este documento. ¿Guardarlo igualmente?')) return
        setGuardando(true)
        const r = await guardarFirmado({
            archivo_url: actual.url, archivo_nombre: actual.file.name, archivo_tipo: actual.esPdf ? 'application/pdf' : 'image/jpeg',
            datos: { ...datos, horas: datos.horas ? Number(datos.horas) : null },
            albaran_id: destino !== 'ninguno' && destino.tipo === 'albaran' ? destino.id : null,
            factura_id: destino !== 'ninguno' && destino.tipo === 'factura' ? destino.id : null,
        }).catch((e: any) => ({ success: false as const, error: e?.message || 'Error de conexión' }))
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        toast.success(destino === 'ninguno' ? 'Guardado. Queda pendiente de unir.' : `Unido a ${destino.tipo === 'albaran' ? 'albarán' : 'factura'} ${destino.numero}${destino.factura_numero ? ` y a su factura ${destino.factura_numero}` : ''}`)
        onGuardado()
        siguiente()
    }

    return (
        <Dialog open onOpenChange={v => !v && onCerrar()}>
            <DialogContent className="max-w-5xl max-h-[94vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-primary" /> Documento firmado {pasos.length > 1 ? `(${i + 1} de ${pasos.length})` : ''}</DialogTitle>
                    <DialogDescription>La IA lee el documento; revisa los datos y elige a qué albarán o factura lo unes.</DialogDescription>
                </DialogHeader>

                {!actual || actual.estado === 'subiendo' || actual.estado === 'leyendo' ? (
                    <div className="py-16 flex flex-col items-center gap-3 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="font-bold">{actual?.estado === 'leyendo' ? 'Leyendo el documento con IA…' : 'Subiendo el documento…'}</p>
                        <p className="text-sm text-muted-foreground">{actual?.file.name}</p>
                    </div>
                ) : actual.estado === 'error' ? (
                    <div className="py-10 text-center space-y-3">
                        <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
                        <p className="font-bold">{actual.file.name}</p>
                        <p className="text-sm text-rose-600">{actual.error}</p>
                        <Button variant="outline" onClick={siguiente}>{i + 1 < pasos.length ? 'Pasar al siguiente' : 'Cerrar'}</Button>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 gap-5">
                        <div className="rounded-xl border bg-muted/30 overflow-hidden min-h-[320px] flex items-center justify-center">
                            {actual.esPdf ? <iframe src={actual.vista} className="w-full h-[62vh]" title="Documento" /> : <img src={actual.vista} alt="Documento firmado" className="max-h-[62vh] w-full object-contain" />}
                        </div>
                        <div className="space-y-4">
                            {actual.error && <p className="text-sm rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 p-3">{actual.error}</p>}
                            {datos.firmado === false && <p className="text-sm rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 p-3 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> No se ve ninguna firma en el documento. Comprueba que es la copia firmada.</p>}
                            {actual.datos && Object.keys(actual.datos).length > 0 && <p className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Datos leídos por la IA: revísalos antes de guardar.</p>}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <Label className="text-xs">Qué es</Label>
                                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                                        {TIPOS.map(t => <button key={t.value} type="button" onClick={() => set('tipo', t.value)} className={cn('rounded-lg border px-2 py-1.5 text-xs font-semibold', datos.tipo === t.value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{t.label}</button>)}
                                    </div>
                                </div>
                                <div><Label className="text-xs">Nº en el papel</Label><Input value={datos.numero_documento || ''} onChange={e => set('numero_documento', e.target.value)} className="mt-1" /></div>
                                <div><Label className="text-xs">Fecha</Label><Input type="date" value={datos.fecha_documento || ''} onChange={e => set('fecha_documento', e.target.value)} className="mt-1" /></div>
                                <div><Label className="text-xs">Firmado por</Label><Input value={datos.firmante_nombre || ''} onChange={e => set('firmante_nombre', e.target.value)} placeholder="Nombre de quien recibe" className="mt-1" /></div>
                                <div><Label className="text-xs">DNI (opcional)</Label><Input value={datos.firmante_dni || ''} onChange={e => set('firmante_dni', e.target.value)} className="mt-1" /></div>
                                {datos.tipo === 'parte_trabajo' && <div><Label className="text-xs">Horas</Label><Input type="number" step="0.25" value={datos.horas ?? ''} onChange={e => set('horas', e.target.value)} className="mt-1" /></div>}
                                <label className="flex items-center gap-2 text-sm col-span-2"><Switch checked={datos.firmado !== false} onCheckedChange={v => set('firmado', v)} /> Está firmado por el cliente</label>
                                <div className="col-span-2"><Label className="text-xs">Incidencias anotadas por el cliente</Label><Textarea rows={2} value={datos.incidencias || ''} onChange={e => set('incidencias', e.target.value)} placeholder="Faltas, roturas, «conforme con reservas»… (vacío si no hay)" className="mt-1" /></div>
                            </div>
                            <div className="border-t pt-4">
                                <p className="font-extrabold text-sm flex items-center gap-1.5 mb-2"><Link2 className="h-4 w-4 text-primary" /> ¿A qué documento lo unes?</p>
                                <ElegirDestino candidatos={[...(destinoInicial ? [destinoInicial] : []), ...(actual.candidatos || []).filter(c => c.id !== destinoInicial?.id)]} elegido={destino} onElegir={setDestino} />
                                {destino && destino !== 'ninguno' && destino.tipo === 'albaran' && (
                                    <p className="text-xs text-muted-foreground mt-2">{destino.factura_numero ? `Quedará unido al albarán ${destino.numero} y a su factura ${destino.factura_numero}.` : `Quedará unido al albarán ${destino.numero}; cuando lo factures, la firma pasará sola a la factura.`}</p>
                                )}
                            </div>
                            <div className="flex justify-end gap-2">
                                {pasos.length > 1 && <Button variant="ghost" onClick={siguiente} disabled={guardando}>Saltar</Button>}
                                <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
                                <Button onClick={guardar} disabled={guardando} className="font-bold">{guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}{destino === 'ninguno' ? 'Guardar' : 'Guardar y unir'}</Button>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

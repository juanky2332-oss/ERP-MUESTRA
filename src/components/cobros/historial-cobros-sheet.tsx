'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Paperclip, Undo2, Mail, CalendarClock, Check } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { etiquetaMetodo } from '@/lib/cobros/vencimientos'
import { getFacturaCobroAction, anularCobroAction, confirmarCobroPropuestoAction, cambiarVencimientoAction } from '@/actions/cobros'
import { EstadoCobroBadge, BarraCobro } from './estado-cobro'

function fecha(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Panel lateral con todo el seguimiento de cobro de una factura. */
export function HistorialCobrosSheet({ facturaId, open, onOpenChange, onChanged }: { facturaId: string | null; open: boolean; onOpenChange: (v: boolean) => void; onChanged?: () => void }) {
    const [data, setData] = useState<any>(null)
    const [cargando, setCargando] = useState(false)
    const [venc, setVenc] = useState('')

    const cargar = async () => {
        if (!facturaId) return
        setCargando(true)
        const r = await getFacturaCobroAction(facturaId)
        if (r.success) { setData(r); setVenc(r.factura.fecha_vencimiento || '') } else toast.error(r.error)
        setCargando(false)
    }
    useEffect(() => { if (open) cargar() }, [open, facturaId])

    const anular = async (id: string) => {
        const motivo = prompt('Motivo de la anulación del cobro:')
        if (motivo === null) return
        const r = await anularCobroAction(id, motivo)
        if (!r.success) return toast.error(r.error)
        toast.success('Cobro anulado'); cargar(); onChanged?.()
    }
    const confirmarPropuesto = async (id: string) => {
        const r = await confirmarCobroPropuestoAction(id)
        if (!r.success) return toast.error(r.error)
        toast.success('Cobro confirmado'); cargar(); onChanged?.()
    }
    const guardarVenc = async () => {
        const r = await cambiarVencimientoAction(facturaId!, venc || null)
        if (!r.success) return toast.error(r.error)
        toast.success('Vencimiento actualizado'); cargar(); onChanged?.()
    }

    const f = data?.factura
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader><SheetTitle>Seguimiento de cobro</SheetTitle></SheetHeader>
                {cargando || !f ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                    <div className="space-y-6 px-4 pb-8">
                        <div className="space-y-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-lg font-black">{f.numero}</p>
                                    <p className="text-sm text-muted-foreground">{f.cliente_razon_social}</p>
                                </div>
                                <EstadoCobroBadge info={f.info} />
                            </div>
                            <BarraCobro info={f.info} />
                            <div className="grid grid-cols-3 gap-2 text-sm pt-1">
                                <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Total</p><p className="font-bold tabular-nums">{formatCurrency(f.info.total)}</p></div>
                                <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Cobrado</p><p className="font-bold tabular-nums text-emerald-600">{formatCurrency(f.info.cobrado)}</p></div>
                                <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Pendiente</p><p className="font-bold tabular-nums text-amber-600">{formatCurrency(f.info.pendiente)}</p></div>
                            </div>
                        </div>

                        <div className="rounded-xl border p-3">
                            <p className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5 mb-2"><CalendarClock className="h-3.5 w-3.5" /> Vencimiento</p>
                            <div className="flex gap-2">
                                <Input type="date" value={venc} onChange={e => setVenc(e.target.value)} />
                                <Button variant="outline" onClick={guardarVenc} disabled={venc === (f.fecha_vencimiento || '')}>Guardar</Button>
                            </div>
                            {f.forma_pago && <p className="text-xs text-muted-foreground mt-2">Condición: {f.forma_pago}</p>}
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Pagos registrados</p>
                            {data.cobros.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Todavía no hay pagos.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {data.cobros.map((c: any) => (
                                        <li key={c.id} className={`rounded-lg border p-3 text-sm ${c.estado === 'anulado' ? 'opacity-50 line-through' : ''}`}>
                                            <div className="flex justify-between">
                                                <span className="font-bold tabular-nums">{formatCurrency(Number(c.importe))}</span>
                                                <span className="text-xs text-muted-foreground">{fecha(c.fecha)}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {etiquetaMetodo(c.metodo)} · {c.usuario_nombre || 'Sistema'} · {c.origen === 'telegram' ? 'Telegram' : c.origen === 'importacion' ? 'Histórico' : 'App'}
                                                {c.estado === 'propuesto' && <span className="ml-1 font-bold text-amber-600">· PROPUESTO</span>}
                                            </p>
                                            {c.referencia && <p className="text-xs">Ref.: {c.referencia}</p>}
                                            {c.nota && <p className="text-xs italic">{c.nota}</p>}
                                            <div className="flex gap-2 mt-2">
                                                {c.justificante_path && (
                                                    <a href={c.justificante_path} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary inline-flex items-center gap-1"><Paperclip className="h-3 w-3" /> Justificante</a>
                                                )}
                                                {data.puedeCobrar && c.estado === 'propuesto' && (
                                                    <button onClick={() => confirmarPropuesto(c.id)} className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Confirmar</button>
                                                )}
                                                {data.puedeCobrar && c.estado !== 'anulado' && c.origen !== 'importacion' && (
                                                    <button onClick={() => anular(c.id)} className="text-xs font-semibold text-rose-600 inline-flex items-center gap-1 ml-auto"><Undo2 className="h-3 w-3" /> Anular</button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Correos y reclamaciones</p>
                            {data.historial.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No se ha enviado nada todavía.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {data.historial.map((h: any) => (
                                        <li key={h.id} className="rounded-lg border p-3 text-sm">
                                            <p className="font-semibold flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {h.tipo_documento}</p>
                                            <p className="text-xs text-muted-foreground">{fecha(h.created_at)} · {h.usuario_nombre} → {h.destinatario}</p>
                                            <p className="text-xs">{h.asunto}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}

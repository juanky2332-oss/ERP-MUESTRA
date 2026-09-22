'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Loader2, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { METODOS_PAGO, hoyISO } from '@/lib/cobros/vencimientos'
import { getFacturaCobroAction, registrarCobroAction, subirJustificanteAction } from '@/actions/cobros'
import { EstadoCobroBadge } from './estado-cobro'

interface Props {
    facturaId: string | null
    open: boolean
    onOpenChange: (v: boolean) => void
    onDone?: () => void
    modoInicial?: 'total' | 'parcial'
}

/**
 * "Marcar como pagada": un solo clic para el propietario. Campos opcionales
 * (método, fecha, referencia, nota, justificante) y opción de pago parcial.
 */
export function MarcarPagadaDialog({ facturaId, open, onOpenChange, onDone, modoInicial = 'total' }: Props) {
    const [cargando, setCargando] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [factura, setFactura] = useState<any>(null)
    const [puedeCobrar, setPuedeCobrar] = useState(true)
    const [modo, setModo] = useState<'total' | 'parcial'>(modoInicial)
    const [importe, setImporte] = useState('')
    const [metodo, setMetodo] = useState<string>('')
    const [fecha, setFecha] = useState(hoyISO())
    const [referencia, setReferencia] = useState('')
    const [nota, setNota] = useState('')
    const [archivo, setArchivo] = useState<File | null>(null)
    const [hecho, setHecho] = useState<string | null>(null)
    // Clave de idempotencia por apertura del modal: un doble clic no crea dos cobros.
    const idempotencia = useMemo(() => (open ? crypto.randomUUID() : ''), [open, facturaId])

    useEffect(() => {
        if (!open || !facturaId) return
        setModo(modoInicial); setImporte(''); setReferencia(''); setNota(''); setArchivo(null); setHecho(null); setFecha(hoyISO())
        setCargando(true)
        getFacturaCobroAction(facturaId).then(r => {
            if (r.success) {
                setFactura(r.factura)
                setPuedeCobrar(r.puedeCobrar)
                setMetodo(r.factura.metodo_pago || '')
            } else toast.error(r.error)
            setCargando(false)
        })
    }, [open, facturaId, modoInicial])

    const info = factura?.info
    const importeNum = modo === 'total' ? info?.pendiente : Number(String(importe).replace(',', '.'))

    const confirmar = async () => {
        if (!factura) return
        if (modo === 'parcial' && (!importeNum || importeNum <= 0)) return toast.error('Indica el importe cobrado.')
        if (modo === 'parcial' && importeNum > info.pendiente + 0.01) return toast.error(`No puede superar lo pendiente (${formatCurrency(info.pendiente)}).`)
        setGuardando(true)
        try {
            let justificantePath: string | null = null
            if (archivo) {
                const fd = new FormData()
                fd.append('file', archivo)
                const up = await subirJustificanteAction(fd)
                if (!up.success) throw new Error(up.error)
                justificantePath = up.path
            }
            const r = await registrarCobroAction({
                facturaId: factura.id,
                importe: modo === 'total' ? null : importeNum,
                fecha, metodo: metodo || null, referencia: referencia || null, nota: nota || null,
                justificantePath, idempotencyKey: idempotencia,
            })
            if (!r.success) throw new Error(r.error)
            const msg = r.estado === 'propuesto'
                ? 'Cobro enviado a administración para su confirmación.'
                : r.factura.info.estado === 'pagada' ? `Factura ${r.factura.numero} marcada como pagada.` : `Cobro registrado. Quedan ${formatCurrency(r.factura.info.pendiente)} pendientes.`
            setHecho(msg)
            toast.success(msg)
            onDone?.()
            setTimeout(() => onOpenChange(false), 1100)
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo registrar el cobro')
        } finally {
            setGuardando(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{modo === 'total' ? 'Marcar como pagada' : 'Registrar pago parcial'}</DialogTitle>
                    <DialogDescription>Confirma el cobro. Queda registrado con tu usuario, fecha y método.</DialogDescription>
                </DialogHeader>

                {cargando || !info ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : hecho ? (
                    <div className="flex flex-col items-center text-center py-8 gap-3 animate-in zoom-in-95 fade-in duration-200">
                        <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                        </div>
                        <p className="font-bold text-foreground">{hecho}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-xl border bg-muted/40 p-4 space-y-1.5">
                            <div className="flex justify-between items-start gap-2">
                                <div>
                                    <p className="font-extrabold text-foreground">Factura {factura.numero}</p>
                                    <p className="text-sm text-muted-foreground">{factura.cliente_razon_social}</p>
                                </div>
                                <EstadoCobroBadge info={info} />
                            </div>
                            <div className="grid grid-cols-3 gap-2 pt-2 text-sm">
                                <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Total</p><p className="font-bold tabular-nums">{formatCurrency(info.total)}</p></div>
                                <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Cobrado</p><p className="font-bold tabular-nums text-emerald-600">{formatCurrency(info.cobrado)}</p></div>
                                <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Pendiente</p><p className="font-bold tabular-nums text-amber-600">{formatCurrency(info.pendiente)}</p></div>
                            </div>
                        </div>

                        {info.estado === 'pagada' ? (
                            <p className="text-sm text-emerald-700 font-semibold">Esta factura ya está pagada por completo.</p>
                        ) : (
                            <>
                                {modo === 'total' ? (
                                    <p className="text-sm font-medium">¿Confirmas que se ha cobrado el importe pendiente de <b>{formatCurrency(info.pendiente)}</b>?</p>
                                ) : (
                                    <div>
                                        <Label className="text-xs font-bold uppercase text-muted-foreground">Importe cobrado</Label>
                                        <Input autoFocus inputMode="decimal" placeholder={`máx. ${formatCurrency(info.pendiente)}`} value={importe} onChange={e => setImporte(e.target.value)} className="mt-1 text-lg font-bold" />
                                        {importeNum > 0 && importeNum <= info.pendiente && (
                                            <p className="text-xs text-muted-foreground mt-1">Quedarán pendientes {formatCurrency(Math.round((info.pendiente - importeNum) * 100) / 100)}.</p>
                                        )}
                                    </div>
                                )}

                                {!puedeCobrar && (
                                    <p className="text-xs rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 p-2">Tu rol no confirma cobros: se enviará como propuesta a administración.</p>
                                )}

                                <details className="group rounded-lg border p-3">
                                    <summary className="text-xs font-bold uppercase text-muted-foreground cursor-pointer select-none">Datos opcionales</summary>
                                    <div className="grid grid-cols-2 gap-3 mt-3">
                                        <div>
                                            <Label className="text-xs">Método</Label>
                                            <Select value={metodo} onValueChange={setMetodo}>
                                                <SelectTrigger className="mt-1"><SelectValue placeholder="Sin indicar" /></SelectTrigger>
                                                <SelectContent>{METODOS_PAGO.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Fecha de cobro</Label>
                                            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="mt-1" />
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs">Referencia</Label>
                                            <Input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Nº de transferencia, recibo…" className="mt-1" />
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs">Nota</Label>
                                            <Textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} className="mt-1" />
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs">Justificante (foto o PDF)</Label>
                                            {archivo ? (
                                                <div className="flex items-center justify-between mt-1 rounded-md border px-3 py-2 text-sm">
                                                    <span className="truncate flex items-center gap-2"><Paperclip className="h-4 w-4" />{archivo.name}</span>
                                                    <button type="button" onClick={() => setArchivo(null)}><X className="h-4 w-4" /></button>
                                                </div>
                                            ) : (
                                                <Input type="file" accept="image/*,application/pdf" onChange={e => setArchivo(e.target.files?.[0] || null)} className="mt-1" />
                                            )}
                                        </div>
                                    </div>
                                </details>

                                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between pt-1">
                                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={guardando}>Cancelar</Button>
                                    <div className="flex flex-col-reverse sm:flex-row gap-2">
                                        <Button variant="outline" onClick={() => setModo(modo === 'total' ? 'parcial' : 'total')} disabled={guardando}>
                                            {modo === 'total' ? 'Registrar pago parcial' : 'Cobrar todo lo pendiente'}
                                        </Button>
                                        <Button onClick={confirmar} disabled={guardando} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                                            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                                            {modo === 'total' ? 'Confirmar pago' : 'Registrar pago'}
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

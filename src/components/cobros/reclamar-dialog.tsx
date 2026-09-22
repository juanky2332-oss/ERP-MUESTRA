'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Mail, Send, Eye, Pencil, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { getBorradorReclamacionAction, enviarReclamacionAction } from '@/actions/cobros'
import { EstadoCobroBadge } from './estado-cobro'

/**
 * Reclamar pago: borrador con la plantilla de la empresa, editable, vista
 * previa y confirmación explícita antes de enviar. Nunca se envía solo.
 */
export function ReclamarDialog({ facturaId, open, onOpenChange, onDone }: { facturaId: string | null; open: boolean; onOpenChange: (v: boolean) => void; onDone?: () => void }) {
    const [cargando, setCargando] = useState(false)
    const [enviando, setEnviando] = useState(false)
    const [paso, setPaso] = useState<'editar' | 'revisar'>('editar')
    const [factura, setFactura] = useState<any>(null)
    const [para, setPara] = useState('')
    const [asunto, setAsunto] = useState('')
    const [cuerpo, setCuerpo] = useState('')

    useEffect(() => {
        if (!open || !facturaId) return
        setPaso('editar'); setCargando(true)
        getBorradorReclamacionAction(facturaId).then(r => {
            if (r.success) {
                setFactura(r.factura); setAsunto(r.asunto); setCuerpo(r.cuerpo); setPara(r.destinatarios.join(', '))
            } else { toast.error(r.error); onOpenChange(false) }
            setCargando(false)
        })
    }, [open, facturaId, onOpenChange])

    const enviar = async () => {
        const destinatarios = para.split(/[,;]/).map(s => s.trim()).filter(Boolean)
        if (!destinatarios.length) return toast.error('Añade al menos un destinatario.')
        setEnviando(true)
        const r = await enviarReclamacionAction({ facturaId: factura.id, destinatarios, asunto, cuerpo })
        setEnviando(false)
        if (!r.success) return toast.error(r.error)
        toast.success(`Reclamación enviada a ${r.destinatarios.join(', ')}`)
        onDone?.()
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> Reclamar pago</DialogTitle>
                    <DialogDescription>Revisa el correo antes de enviarlo. Se adjunta la factura en PDF.</DialogDescription>
                </DialogHeader>

                {cargando || !factura ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
                            <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Cliente</p><p className="font-bold truncate">{factura.cliente_razon_social}</p></div>
                            <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Factura</p><p className="font-bold">{factura.numero}</p></div>
                            <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Pendiente</p><p className="font-bold text-amber-600 tabular-nums">{formatCurrency(factura.info.pendiente)}</p></div>
                            <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Situación</p><EstadoCobroBadge info={factura.info} /></div>
                        </div>

                        {paso === 'editar' ? (
                            <div className="space-y-3">
                                <div>
                                    <Label className="text-xs font-bold uppercase text-muted-foreground">Para</Label>
                                    <Input value={para} onChange={e => setPara(e.target.value)} placeholder="email@cliente.com" className="mt-1" />
                                    {!para && <p className="text-xs text-rose-600 mt-1">Este cliente no tiene email guardado: escríbelo aquí.</p>}
                                </div>
                                <div>
                                    <Label className="text-xs font-bold uppercase text-muted-foreground">Asunto</Label>
                                    <Input value={asunto} onChange={e => setAsunto(e.target.value)} className="mt-1" />
                                </div>
                                <div>
                                    <Label className="text-xs font-bold uppercase text-muted-foreground">Mensaje</Label>
                                    <Textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={12} className="mt-1 text-sm leading-relaxed" />
                                    <p className="text-[11px] text-muted-foreground mt-1">La firma de la empresa se añade automáticamente. La plantilla se cambia en Ajustes.</p>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                                    <Button onClick={() => setPaso('revisar')} disabled={!para.trim() || !asunto.trim() || !cuerpo.trim()}><Eye className="h-4 w-4 mr-1" /> Vista previa</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
                                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 border-b bg-muted/40 text-sm space-y-0.5">
                                        <p><span className="text-muted-foreground">Para:</span> <b>{para}</b></p>
                                        <p><span className="text-muted-foreground">Asunto:</span> <b>{asunto}</b></p>
                                        <p className="flex items-center gap-1 text-muted-foreground"><Paperclip className="h-3.5 w-3.5" /> Factura_{factura.numero}.pdf</p>
                                    </div>
                                    <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed">{cuerpo}</div>
                                </div>
                                <p className="text-sm font-semibold">¿Confirmas el envío de esta reclamación a {factura.cliente_razon_social}?</p>
                                <div className="flex justify-between gap-2">
                                    <Button variant="outline" onClick={() => setPaso('editar')} disabled={enviando}><Pencil className="h-4 w-4 mr-1" /> Editar</Button>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={enviando}>Cancelar</Button>
                                        <Button onClick={enviar} disabled={enviando} className="font-bold">
                                            {enviando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />} Confirmar y enviar
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

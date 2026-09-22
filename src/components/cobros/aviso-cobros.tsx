'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import { getAvisoCobrosAction, marcarAvisoCobrosVistoAction } from '@/actions/cobros'
import { ReclamarDialog } from './reclamar-dialog'

/**
 * Aviso emergente al entrar al ERP si hay facturas vencidas o que vencen hoy.
 * No invasivo: aparece como tarjeta en la esquina, una vez al día (o si hay
 * vencidas nuevas), y solo para usuarios con permisos económicos.
 */
export function AvisoCobros() {
    const router = useRouter()
    const [aviso, setAviso] = useState<any>(null)
    const [visible, setVisible] = useState(false)
    const [reclamar, setReclamar] = useState<string | null>(null)

    useEffect(() => {
        const t = setTimeout(async () => {
            const r = await getAvisoCobrosAction()
            if (r.success && r.mostrar) { setAviso(r); setVisible(true) }
        }, 900)
        return () => clearTimeout(t)
    }, [])

    const cerrar = () => {
        setVisible(false)
        if (aviso?.firma) marcarAvisoCobrosVistoAction(aviso.firma)
    }

    if (!aviso) return null

    return (
        <>
            <div
                role="dialog"
                aria-label="Facturas vencidas"
                className={cn(
                    'fixed z-[60] left-4 right-4 bottom-24 md:left-auto md:right-6 md:bottom-6 md:w-[420px] transition-all duration-200 motion-reduce:transition-none',
                    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                )}
            >
                <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-card shadow-2xl overflow-hidden">
                    <div className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-950/40">
                        <div className="h-9 w-9 shrink-0 rounded-xl bg-rose-600 text-white flex items-center justify-center"><AlertTriangle className="h-5 w-5" /></div>
                        <div className="flex-1 min-w-0">
                            <p className="font-extrabold text-foreground leading-snug">
                                {aviso.vencidas > 0
                                    ? `Tienes ${aviso.vencidas} factura${aviso.vencidas !== 1 ? 's' : ''} vencida${aviso.vencidas !== 1 ? 's' : ''}`
                                    : `${aviso.venceHoy} factura${aviso.venceHoy !== 1 ? 's' : ''} vence${aviso.venceHoy !== 1 ? 'n' : ''} hoy`}
                                {' '}por un total de {formatCurrency(aviso.total)}.
                            </p>
                        </div>
                        <button onClick={cerrar} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                    </div>
                    <ul className="px-4 py-2 divide-y max-h-56 overflow-y-auto">
                        {aviso.facturas.map((f: any) => (
                            <li key={f.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                                <div className="min-w-0">
                                    <p className="font-semibold truncate">{f.cliente}</p>
                                    <p className={cn('text-xs', f.visual === 'vencida' ? 'text-rose-600' : 'text-orange-600')}>{f.numero} · {f.etiqueta.toLowerCase()}</p>
                                </div>
                                <span className="font-bold tabular-nums whitespace-nowrap">{formatCurrency(f.pendiente)}</span>
                            </li>
                        ))}
                        {aviso.restantes > 0 && <li className="py-2 text-xs text-muted-foreground">…y {aviso.restantes} más</li>}
                    </ul>
                    <div className="flex gap-2 p-3 border-t bg-muted/30">
                        <Button size="sm" className="flex-1" onClick={() => { cerrar(); router.push('/cobros') }}>Ver cobros pendientes</Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setReclamar(aviso.facturas[0]?.id)}>Reclamar ahora</Button>
                        <Button size="sm" variant="ghost" onClick={cerrar}>Cerrar</Button>
                    </div>
                </div>
            </div>
            <ReclamarDialog facturaId={reclamar} open={!!reclamar} onOpenChange={v => !v && setReclamar(null)} onDone={cerrar} />
        </>
    )
}

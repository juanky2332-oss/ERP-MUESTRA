'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDot, Clock, Loader2, Mail, Search, Wallet, History, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import { getResumenCobrosAction } from '@/actions/cobros'
import { EstadoCobroBadge, BarraCobro } from '@/components/cobros/estado-cobro'
import { MarcarPagadaDialog } from '@/components/cobros/marcar-pagada-dialog'
import { ReclamarDialog } from '@/components/cobros/reclamar-dialog'
import { HistorialCobrosSheet } from '@/components/cobros/historial-cobros-sheet'
import { EmptyState } from '@/components/ui/empty-state'

type Filtro = 'vencidas' | 'hoy' | 'proximas' | 'parciales' | 'pendientes'

const HORIZONTES = [3, 7, 15, 30]

function fecha(iso?: string | null) {
    if (!iso) return 'Sin vencimiento'
    const [y, m, d] = iso.slice(0, 10).split('-')
    return `${d}/${m}/${y}`
}

export default function CobrosPage() {
    const [data, setData] = useState<any>(null)
    const [puedeCobrar, setPuedeCobrar] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filtro, setFiltro] = useState<Filtro>('vencidas')
    const [horizonte, setHorizonte] = useState(7)
    const [q, setQ] = useState('')
    const [pagar, setPagar] = useState<{ id: string; modo: 'total' | 'parcial' } | null>(null)
    const [reclamar, setReclamar] = useState<string | null>(null)
    const [historial, setHistorial] = useState<string | null>(null)

    const cargar = useCallback(async () => {
        const r = await getResumenCobrosAction()
        if (!r.success) { setError(r.error); return }
        setData(r.data); setPuedeCobrar(r.puedeCobrar)
        setFiltro(f => (f === 'vencidas' && r.data.vencidas.length === 0 ? (r.data.venceHoy.length ? 'hoy' : 'proximas') : f))
    }, [])
    useEffect(() => { cargar() }, [cargar])

    const lista = useMemo(() => {
        if (!data) return []
        let l: any[] =
            filtro === 'vencidas' ? data.vencidas :
                filtro === 'hoy' ? data.venceHoy :
                    filtro === 'proximas' ? data.proximas.filter((f: any) => (f.info.dias ?? 999) <= horizonte) :
                        filtro === 'parciales' ? data.parciales : data.pendientes
        if (q.trim()) {
            const t = q.toLowerCase()
            l = l.filter((f: any) => f.numero.toLowerCase().includes(t) || f.cliente_razon_social.toLowerCase().includes(t))
        }
        return l
    }, [data, filtro, horizonte, q])

    if (error) return <EmptyState icon={Wallet} title="No disponible" description={error} />
    if (!data) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>

    const tarjetas = [
        { k: 'pendientes' as Filtro, t: 'Pendiente de cobro', v: formatCurrency(data.pendienteTotal), s: `${data.pendientes.length} factura(s)`, i: Wallet, c: 'text-slate-700 dark:text-slate-200', bg: 'bg-slate-100 dark:bg-slate-800' },
        { k: 'vencidas' as Filtro, t: 'Vencido', v: formatCurrency(data.vencidoTotal), s: `${data.vencidas.length} factura(s)`, i: AlertTriangle, c: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-950/40' },
        { k: 'proximas' as Filtro, t: 'Vence esta semana', v: String(data.venceEstaSemana), s: `${data.venceHoy.length} vence(n) hoy`, i: Clock, c: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
        { k: 'parciales' as Filtro, t: 'Parcialmente pagadas', v: String(data.parciales.length), s: formatCurrency(data.parciales.reduce((a: number, f: any) => a + f.info.pendiente, 0)) + ' pendiente', i: CircleDot, c: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-950/40' },
        { k: null, t: 'Cobrado este mes', v: formatCurrency(data.cobradoEsteMes), s: `de ${formatCurrency(data.facturadoEsteMes)} facturado`, i: TrendingUp, c: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    ]

    const pestanas: { k: Filtro; label: string; n: number; color: string }[] = [
        { k: 'vencidas', label: 'Vencidas', n: data.vencidas.length, color: 'data-[on=true]:text-rose-600' },
        { k: 'hoy', label: 'Vencen hoy', n: data.venceHoy.length, color: 'data-[on=true]:text-orange-600' },
        { k: 'proximas', label: 'Próximas', n: data.proximas.length, color: 'data-[on=true]:text-amber-600' },
        { k: 'parciales', label: 'Parciales', n: data.parciales.length, color: 'data-[on=true]:text-sky-600' },
        { k: 'pendientes', label: 'Todas', n: data.pendientes.length, color: 'data-[on=true]:text-foreground' },
    ]

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">Cobros y vencimientos</h1>
                    <p className="text-muted-foreground mt-1">Qué te deben, qué vence y a quién reclamar.</p>
                </div>
                <div className="flex gap-2">
                    <Button asChild variant="outline"><Link href="/agenda"><CalendarClock className="h-4 w-4 mr-1" /> Ver en agenda</Link></Button>
                    <Button asChild variant="outline"><Link href="/facturas"><History className="h-4 w-4 mr-1" /> Facturas</Link></Button>
                </div>
            </div>

            {data.cobrosPropuestos > 0 && puedeCobrar && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-300">
                    Hay {data.cobrosPropuestos} cobro(s) propuestos por otros usuarios pendientes de confirmar. Ábrelos desde el historial de cada factura.
                </div>
            )}

            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
                {tarjetas.map(t => (
                    <button key={t.t} onClick={() => t.k && setFiltro(t.k)} className={cn('text-left rounded-2xl border bg-card p-4 transition-all duration-200 hover:shadow-md', t.k && filtro === t.k && 'ring-2 ring-primary/40')}>
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-muted-foreground">{t.t}</p>
                            <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', t.bg)}><t.i className={cn('h-4 w-4', t.c)} /></div>
                        </div>
                        <p className={cn('text-xl md:text-2xl font-black mt-2 tabular-nums', t.c)}>{t.v}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t.s}</p>
                    </button>
                ))}
            </div>

            <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
                <div className="flex gap-1 overflow-x-auto bg-muted/60 p-1 rounded-xl">
                    {pestanas.map(p => (
                        <button key={p.k} data-on={filtro === p.k} onClick={() => setFiltro(p.k)}
                            className={cn('px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap text-muted-foreground transition-colors data-[on=true]:bg-card data-[on=true]:shadow-sm', p.color)}>
                            {p.label} <span className="ml-1 opacity-70">{p.n}</span>
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 items-center">
                    {filtro === 'proximas' && (
                        <div className="flex gap-1">
                            {HORIZONTES.map(h => (
                                <button key={h} onClick={() => setHorizonte(h)} className={cn('px-2.5 py-1 rounded-lg text-xs font-bold border', horizonte === h ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground')}>{h} días</button>
                            ))}
                        </div>
                    )}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente o factura…" className="pl-9 w-full sm:w-64" />
                    </div>
                </div>
            </div>

            {lista.length === 0 ? (
                <EmptyState
                    icon={CheckCircle2}
                    title={filtro === 'vencidas' ? 'Nada vencido' : 'Nada por aquí'}
                    description={filtro === 'vencidas' ? 'No tienes facturas vencidas. 🎉' : 'No hay facturas en esta vista.'}
                />
            ) : (
                <div className="rounded-2xl border bg-card overflow-hidden divide-y">
                    {lista.map((f: any) => (
                        <div key={f.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3 hover:bg-muted/30 transition-colors">
                            <button className="flex-1 min-w-0 text-left" onClick={() => setHistorial(f.id)}>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-black text-foreground">{f.numero}</span>
                                    <EstadoCobroBadge info={f.info} />
                                    {f.reminder_count > 0 && <span className="text-[10px] font-bold text-muted-foreground inline-flex items-center gap-1"><Mail className="h-3 w-3" /> reclamada {f.reminder_count}×</span>}
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{f.cliente_razon_social} · vence {fecha(f.fecha_vencimiento)}</p>
                            </button>
                            <div className="md:w-48"><BarraCobro info={f.info} /></div>
                            <div className="md:w-32 md:text-right">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Pendiente</p>
                                <p className="text-lg font-black tabular-nums">{formatCurrency(f.info.pendiente)}</p>
                            </div>
                            <div className="flex gap-2 md:justify-end flex-wrap">
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={() => setPagar({ id: f.id, modo: 'total' })}>
                                    <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar pagada
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setPagar({ id: f.id, modo: 'parcial' })}>Parcial</Button>
                                {puedeCobrar && (f.info.visual === 'vencida' || f.info.visual === 'vence_hoy' || f.info.visual === 'pronto') && (
                                    <Button size="sm" variant="outline" onClick={() => setReclamar(f.id)}><Mail className="h-4 w-4 mr-1" /> Reclamar</Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <MarcarPagadaDialog facturaId={pagar?.id || null} modoInicial={pagar?.modo} open={!!pagar} onOpenChange={v => !v && setPagar(null)} onDone={cargar} />
            <ReclamarDialog facturaId={reclamar} open={!!reclamar} onOpenChange={v => !v && setReclamar(null)} onDone={cargar} />
            <HistorialCobrosSheet facturaId={historial} open={!!historial} onOpenChange={v => !v && setHistorial(null)} onChanged={cargar} />
        </div>
    )
}

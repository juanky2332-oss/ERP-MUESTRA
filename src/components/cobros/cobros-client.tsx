'use client'

import { useMemo, useState, useTransition } from 'react'
import {
    ChevronLeft, ChevronRight, Search, Mail, CircleDollarSign, Clock,
    AlertTriangle, TrendingUp, CalendarDays, Check, Loader2,
} from 'lucide-react'
import {
    startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths,
    format, isSameDay, isToday, differenceInCalendarDays, startOfWeek, endOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'

import { PageHeader } from '@/components/ui/page-header'
import { KpiCard } from '@/components/ui/kpi-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { MoneyDisplay } from '@/components/ui/money-display'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn, formatCurrency } from '@/lib/utils'
import { registerInvoicePayment, sendPaymentReminder, setInvoiceDueDate } from '@/actions/collections'

interface FacturaRow {
    id: string
    numero: string
    fecha: string
    fecha_vencimiento: string | null
    cliente_id: string | null
    cliente_razon_social: string
    cliente_email: string | null
    total: number
    pagada: boolean
    metodo_pago: string | null
    fecha_pago: string | null
    last_reminder_at: string | null
    reminder_count: number | null
}

function invoiceRisk(f: FacturaRow, today: Date): 'pagada' | 'vencida' | 'proxima' | 'al_dia' | 'sin_fecha' {
    if (f.pagada) return 'pagada'
    if (!f.fecha_vencimiento) return 'sin_fecha'
    const days = differenceInCalendarDays(new Date(f.fecha_vencimiento), today)
    if (days < 0) return 'vencida'
    if (days <= 7) return 'proxima'
    return 'al_dia'
}

export function CobrosClient({ initialFacturas }: { initialFacturas: FacturaRow[] }) {
    const [facturas, setFacturas] = useState(initialFacturas)
    const [search, setSearch] = useState('')
    const [tab, setTab] = useState('pendientes')
    const [month, setMonth] = useState(() => startOfMonth(new Date()))
    const [payDialog, setPayDialog] = useState<FacturaRow | null>(null)
    const [dueDialog, setDueDialog] = useState<FacturaRow | null>(null)
    const [pending, startTransition] = useTransition()
    const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)

    const today = useMemo(() => new Date(), [])

    const pendientes = facturas.filter(f => !f.pagada)
    const totalPendiente = pendientes.reduce((a, f) => a + Number(f.total), 0)
    const vencidas = pendientes.filter(f => f.fecha_vencimiento && new Date(f.fecha_vencimiento) < today)
    const totalVencido = vencidas.reduce((a, f) => a + Number(f.total), 0)
    const proximos7 = pendientes.filter(f => {
        if (!f.fecha_vencimiento) return false
        const days = differenceInCalendarDays(new Date(f.fecha_vencimiento), today)
        return days >= 0 && days <= 7
    })
    const cobradoEsteMes = facturas
        .filter(f => f.pagada && f.fecha_pago && new Date(f.fecha_pago) >= startOfMonth(today) && new Date(f.fecha_pago) <= endOfMonth(today))
        .reduce((a, f) => a + Number(f.total), 0)

    const filtered = facturas.filter(f => {
        if (tab === 'pendientes' && f.pagada) return false
        if (tab === 'vencidas' && (f.pagada || !f.fecha_vencimiento || new Date(f.fecha_vencimiento) >= today)) return false
        if (tab === 'pagadas' && !f.pagada) return false
        if (search && !`${f.numero} ${f.cliente_razon_social}`.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })

    // ---- Calendario ----
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
    const dueByDay = useMemo(() => {
        const map = new Map<string, FacturaRow[]>()
        pendientes.forEach(f => {
            if (!f.fecha_vencimiento) return
            const key = format(new Date(f.fecha_vencimiento), 'yyyy-MM-dd')
            map.set(key, [...(map.get(key) || []), f])
        })
        return map
    }, [pendientes])

    async function handleRegisterPayment(metodo: string, fecha: string) {
        if (!payDialog) return
        startTransition(async () => {
            const res = await registerInvoicePayment(payDialog.id, metodo, fecha)
            if (res.success) {
                setFacturas(prev => prev.map(f => f.id === payDialog.id ? { ...f, pagada: true, metodo_pago: metodo, fecha_pago: fecha } : f))
                toast.success(`Cobro registrado en ${payDialog.numero}`)
                setPayDialog(null)
            } else {
                toast.error(res.error || 'No se pudo registrar el cobro')
            }
        })
    }

    async function handleSetDueDate(fecha: string) {
        if (!dueDialog) return
        startTransition(async () => {
            const res = await setInvoiceDueDate(dueDialog.id, fecha)
            if (res.success) {
                setFacturas(prev => prev.map(f => f.id === dueDialog.id ? { ...f, fecha_vencimiento: fecha } : f))
                toast.success('Vencimiento actualizado')
                setDueDialog(null)
            } else {
                toast.error(res.error || 'No se pudo guardar el vencimiento')
            }
        })
    }

    async function handleRemind(f: FacturaRow) {
        setSendingReminderId(f.id)
        const res = await sendPaymentReminder(f.id)
        setSendingReminderId(null)
        if (res.success) {
            setFacturas(prev => prev.map(x => x.id === f.id ? { ...x, last_reminder_at: new Date().toISOString(), reminder_count: (x.reminder_count || 0) + 1 } : x))
            toast.success(`Recordatorio enviado a ${f.cliente_razon_social}`)
        } else {
            toast.error(res.error || 'No se pudo enviar el recordatorio')
        }
    }

    return (
        <div className="space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
            <PageHeader
                title="Cobros y vencimientos"
                description="Qué está cobrado, qué está por llegar y qué se ha vencido."
                breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Cobros y vencimientos' }]}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard title="Pendiente de cobro" value={formatCurrency(totalPendiente)} subtitle={`${pendientes.length} factura(s)`} icon={Clock} scheme="orange" />
                <KpiCard title="Vencido" value={formatCurrency(totalVencido)} subtitle={`${vencidas.length} factura(s)`} icon={AlertTriangle} scheme="red" />
                <KpiCard title="Cobrado este mes" value={formatCurrency(cobradoEsteMes)} icon={TrendingUp} scheme="green" />
                <KpiCard title="Vencen en 7 días" value={formatCurrency(proximos7.reduce((a, f) => a + Number(f.total), 0))} subtitle={`${proximos7.length} factura(s)`} icon={CalendarDays} scheme="purple" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
                {/* Calendario de vencimientos */}
                <div className="metric-card bg-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-extrabold text-foreground capitalize">{format(month, 'MMMM yyyy', { locale: es })}</h3>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => setMonth(m => subMonths(m, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setMonth(m => addMonths(m, 1))}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground uppercase mb-2">
                        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => <div key={d}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {days.map(day => {
                            const key = format(day, 'yyyy-MM-dd')
                            const items = dueByDay.get(key) || []
                            const inMonth = day.getMonth() === month.getMonth()
                            const hasVencida = items.some(f => new Date(f.fecha_vencimiento!) < today)
                            return (
                                <div
                                    key={key}
                                    title={items.map(f => `${f.numero} · ${formatCurrency(Number(f.total))}`).join('\n')}
                                    className={cn(
                                        'aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-semibold relative',
                                        inMonth ? 'text-foreground' : 'text-muted-foreground/30',
                                        isToday(day) && 'ring-2 ring-primary/50',
                                        items.length > 0 && (hasVencida ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-amber-50 dark:bg-amber-950/40')
                                    )}
                                >
                                    {day.getDate()}
                                    {items.length > 0 && (
                                        <span className={cn('h-1.5 w-1.5 rounded-full mt-0.5', hasVencida ? 'bg-rose-500' : 'bg-amber-500')} />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    <div className="flex items-center gap-4 mt-4 text-[10px] font-bold text-muted-foreground uppercase">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Vence este mes</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> Vencida</span>
                    </div>
                </div>

                {/* Tabla de facturas */}
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <Tabs value={tab} onValueChange={setTab}>
                            <TabsList className="bg-muted/50 p-1 rounded-xl h-auto flex-wrap">
                                <TabsTrigger value="pendientes" className="rounded-lg text-xs font-bold uppercase px-4 py-2">Pendientes <span className="ml-2 bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 py-0.5 px-2 rounded-full text-[10px]">{pendientes.length}</span></TabsTrigger>
                                <TabsTrigger value="vencidas" className="rounded-lg text-xs font-bold uppercase px-4 py-2">Vencidas <span className="ml-2 bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 py-0.5 px-2 rounded-full text-[10px]">{vencidas.length}</span></TabsTrigger>
                                <TabsTrigger value="pagadas" className="rounded-lg text-xs font-bold uppercase px-4 py-2">Pagadas</TabsTrigger>
                                <TabsTrigger value="todas" className="rounded-lg text-xs font-bold uppercase px-4 py-2">Todas</TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar factura o cliente..." className="pl-9 w-full sm:w-[240px]" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                    </div>

                    <div className="bg-card border border-border rounded-3xl shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden">
                        {filtered.length === 0 ? (
                            <EmptyState icon={CircleDollarSign} title="Nada por aquí" description="No hay facturas que coincidan con este filtro." />
                        ) : (
                            <div className="divide-y divide-border">
                                {filtered.map(f => {
                                    const risk = invoiceRisk(f, today)
                                    const days = f.fecha_vencimiento ? differenceInCalendarDays(new Date(f.fecha_vencimiento), today) : null
                                    return (
                                        <div key={f.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-muted/40 transition-colors">
                                            <span className={cn(
                                                'h-2.5 w-2.5 rounded-full shrink-0 hidden sm:block',
                                                risk === 'pagada' ? 'bg-emerald-500' : risk === 'vencida' ? 'bg-rose-500' : risk === 'proxima' ? 'bg-amber-500' : risk === 'sin_fecha' ? 'bg-slate-300' : 'bg-emerald-500'
                                            )} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-bold text-foreground">{f.numero}</span>
                                                    <StatusBadge status={f.pagada ? 'pagada' : risk === 'vencida' ? 'vencida' : 'pendiente'} />
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{f.cliente_razon_social}</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                    {f.fecha_vencimiento
                                                        ? `Vence ${format(new Date(f.fecha_vencimiento), "d MMM yyyy", { locale: es })}${!f.pagada ? (days! < 0 ? ` · ${Math.abs(days!)} día(s) de retraso` : days === 0 ? ' · vence hoy' : ` · en ${days} día(s)`) : ''}`
                                                        : (
                                                            <button onClick={() => setDueDialog(f)} className="underline decoration-dotted hover:text-primary">
                                                                Sin fecha de vencimiento · añadir
                                                            </button>
                                                        )}
                                                    {f.reminder_count ? ` · ${f.reminder_count} recordatorio(s) enviado(s)` : ''}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <MoneyDisplay value={Number(f.total)} size="md" tone={f.pagada ? 'positive' : 'neutral'} />
                                                {!f.pagada && (
                                                    <>
                                                        <Button size="sm" variant="outline" className="gap-1.5" disabled={sendingReminderId === f.id} onClick={() => handleRemind(f)}>
                                                            {sendingReminderId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                                                            Reclamar
                                                        </Button>
                                                        <Button size="sm" className="gap-1.5" onClick={() => setPayDialog(f)}>
                                                            <Check className="h-3.5 w-3.5" />
                                                            Cobrar
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Dialogo: registrar cobro */}
            <Dialog open={!!payDialog} onOpenChange={(v) => !v && setPayDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Registrar cobro — {payDialog?.numero}</DialogTitle>
                        <DialogDescription>Marca esta factura como cobrada e indica cómo se ha pagado.</DialogDescription>
                    </DialogHeader>
                    <PaymentForm onSubmit={handleRegisterPayment} pending={pending} total={payDialog ? Number(payDialog.total) : 0} />
                </DialogContent>
            </Dialog>

            {/* Dialogo: fijar vencimiento */}
            <Dialog open={!!dueDialog} onOpenChange={(v) => !v && setDueDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Fecha de vencimiento — {dueDialog?.numero}</DialogTitle>
                        <DialogDescription>Esta factura no tiene vencimiento registrado todavía.</DialogDescription>
                    </DialogHeader>
                    <DueDateForm onSubmit={handleSetDueDate} pending={pending} />
                </DialogContent>
            </Dialog>
        </div>
    )
}

function PaymentForm({ onSubmit, pending, total }: { onSubmit: (metodo: string, fecha: string) => void, pending: boolean, total: number }) {
    const [metodo, setMetodo] = useState('bank_transfer')
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])

    return (
        <div className="space-y-4">
            <div className="bg-muted rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm font-bold text-muted-foreground">Importe a cobrar</span>
                <MoneyDisplay value={total} size="md" tone="positive" />
            </div>
            <div>
                <Label className="text-xs font-bold uppercase text-muted-foreground">Método de pago</Label>
                <Select value={metodo} onValueChange={setMetodo}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="bank_transfer">Transferencia bancaria</SelectItem>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="card">Tarjeta</SelectItem>
                        <SelectItem value="bizum">Bizum</SelectItem>
                        <SelectItem value="direct_debit">Domiciliación</SelectItem>
                        <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label className="text-xs font-bold uppercase text-muted-foreground">Fecha de cobro</Label>
                <Input type="date" className="mt-1" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <DialogFooter>
                <Button disabled={pending} onClick={() => onSubmit(metodo, fecha)} className="w-full gap-2">
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirmar cobro
                </Button>
            </DialogFooter>
        </div>
    )
}

function DueDateForm({ onSubmit, pending }: { onSubmit: (fecha: string) => void, pending: boolean }) {
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
    return (
        <div className="space-y-4">
            <div>
                <Label className="text-xs font-bold uppercase text-muted-foreground">Fecha de vencimiento</Label>
                <Input type="date" className="mt-1" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <DialogFooter>
                <Button disabled={pending} onClick={() => onSubmit(fecha)} className="w-full gap-2">
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Guardar
                </Button>
            </DialogFooter>
        </div>
    )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Loader2, MapPin, Check, Trash2, Receipt, FileText, Phone, Users, Truck, Bell, Wallet, Handshake, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ClientCombobox } from '@/components/contacts/client-combobox'
import { MarcarPagadaDialog } from '@/components/cobros/marcar-pagada-dialog'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { listarAgenda, guardarEvento, cambiarEstadoEvento, eliminarEvento, type ItemAgenda } from '@/actions/agenda'

type Vista = 'dia' | 'semana' | 'mes'

export const TIPOS_EVENTO = [
    { value: 'cita', label: 'Cita', icon: CalendarDays },
    { value: 'reunion', label: 'Reunión', icon: Users },
    { value: 'llamada', label: 'Llamada', icon: Phone },
    { value: 'visita', label: 'Visita', icon: MapPin },
    { value: 'entrega', label: 'Entrega', icon: Truck },
    { value: 'recordatorio', label: 'Recordatorio', icon: Bell },
    { value: 'cobro_previsto', label: 'Cobro previsto', icon: Wallet },
    { value: 'pago_previsto', label: 'Pago previsto', icon: Receipt },
    { value: 'seguimiento_presupuesto', label: 'Seguimiento de presupuesto', icon: Handshake },
    { value: 'otro', label: 'Otro', icon: Clock },
]
const ESTADOS = [
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'confirmado', label: 'Confirmado' },
    { value: 'completado', label: 'Completado' },
    { value: 'cancelado', label: 'Cancelado' },
    { value: 'reprogramado', label: 'Reprogramado' },
]

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const localInput = (isoStr: string) => format(new Date(isoStr), "yyyy-MM-dd'T'HH:mm")

function colorItem(it: ItemAgenda) {
    if (it.origen === 'vencimiento') {
        if (it.visual === 'pagada') return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
        if (it.visual === 'vencida') return 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
        return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900'
    }
    if (it.origen === 'presupuesto') return 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900'
    if (it.estado === 'completado') return 'bg-muted text-muted-foreground border-border line-through'
    if (it.estado === 'cancelado') return 'bg-muted text-muted-foreground border-border line-through opacity-60'
    return 'bg-primary/10 text-primary border-primary/20'
}

function iconoItem(it: ItemAgenda) {
    if (it.origen === 'vencimiento') return it.visual === 'pagada' ? '🟢' : it.visual === 'vencida' ? '🔴' : '🟡'
    if (it.origen === 'presupuesto') return '📝'
    return null
}

function hora(it: ItemAgenda) {
    return it.todoElDia ? '' : format(new Date(it.inicio), 'HH:mm')
}

export default function AgendaPage() {
    const params = useSearchParams()
    const [vista, setVista] = useState<Vista>('semana')
    const [ref, setRef] = useState(new Date())
    const [items, setItems] = useState<ItemAgenda[] | null>(null)
    const [usuarios, setUsuarios] = useState<any[]>([])
    const [puedeEditar, setPuedeEditar] = useState(false)
    const [filtroTipo, setFiltroTipo] = useState('todos')
    const [filtroEstado, setFiltroEstado] = useState('todos')
    const [filtroUsuario, setFiltroUsuario] = useState('todos')
    const [editando, setEditando] = useState<any>(null)
    const [pagar, setPagar] = useState<string | null>(null)

    useEffect(() => { if (typeof window !== 'undefined' && window.innerWidth < 768) setVista('dia') }, [])

    const rango = useMemo(() => {
        if (vista === 'dia') return { desde: ref, hasta: ref }
        if (vista === 'semana') return { desde: startOfWeek(ref, { weekStartsOn: 1 }), hasta: endOfWeek(ref, { weekStartsOn: 1 }) }
        return { desde: startOfWeek(startOfMonth(ref), { weekStartsOn: 1 }), hasta: endOfWeek(endOfMonth(ref), { weekStartsOn: 1 }) }
    }, [vista, ref])

    const cargar = useCallback(async () => {
        const r = await listarAgenda(iso(rango.desde), iso(rango.hasta))
        if (!r.success) { toast.error(r.error); setItems([]); return }
        setItems(r.items); setUsuarios(r.usuarios); setPuedeEditar(r.puedeEditar)
    }, [rango])
    useEffect(() => { cargar() }, [cargar])

    useEffect(() => {
        if (params.get('nuevo') === '1') nuevo(new Date())
    }, [params])

    const filtrados = useMemo(() => (items || []).filter(it => {
        if (filtroTipo === 'vencimientos') { if (it.origen !== 'vencimiento') return false }
        else if (filtroTipo !== 'todos' && it.tipo !== filtroTipo) return false
        if (filtroEstado !== 'todos' && it.origen === 'evento' && it.estado !== filtroEstado) return false
        if (filtroEstado !== 'todos' && it.origen !== 'evento') return false
        if (filtroUsuario !== 'todos' && it.origen === 'evento' && it.usuarioId !== filtroUsuario) return false
        return true
    }), [items, filtroTipo, filtroEstado, filtroUsuario])

    const porDia = useMemo(() => {
        const m = new Map<string, ItemAgenda[]>()
        for (const it of filtrados) m.set(it.fecha, [...(m.get(it.fecha) || []), it])
        return m
    }, [filtrados])

    function nuevo(dia: Date) {
        const inicio = new Date(dia); inicio.setHours(9, 0, 0, 0)
        setEditando({ titulo: '', tipo: 'cita', estado: 'pendiente', inicio: format(inicio, "yyyy-MM-dd'T'HH:mm"), fin: format(new Date(inicio.getTime() + 3600000), "yyyy-MM-dd'T'HH:mm"), todo_el_dia: false })
    }

    function abrir(it: ItemAgenda) {
        if (it.origen === 'vencimiento') { if (it.visual !== 'pagada' && it.facturaId) setPagar(it.facturaId); return }
        if (it.origen === 'presupuesto') { window.location.href = '/presupuestos'; return }
        setEditando({ id: it.id, titulo: it.titulo, tipo: it.tipo, estado: it.estado, inicio: localInput(it.inicio), fin: it.fin ? localInput(it.fin) : '', todo_el_dia: it.todoElDia, cliente_id: it.clienteId, direccion: it.direccion || '', notas: it.notas || '', importe: it.importe ?? '', usuario_id: it.usuarioId })
    }

    const mover = (dir: 1 | -1) => setRef(r => vista === 'dia' ? addDays(r, dir) : vista === 'semana' ? (dir > 0 ? addWeeks(r, 1) : subWeeks(r, 1)) : (dir > 0 ? addMonths(r, 1) : subMonths(r, 1)))
    const titulo = vista === 'dia' ? format(ref, "EEEE d 'de' MMMM", { locale: es }) : vista === 'semana' ? `${format(rango.desde, 'd MMM', { locale: es })} – ${format(rango.hasta, 'd MMM yyyy', { locale: es })}` : format(ref, 'MMMM yyyy', { locale: es })

    const dias: Date[] = []
    for (let d = rango.desde; d <= rango.hasta; d = addDays(d, 1)) dias.push(d)
    const hoyStr = iso(new Date())

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">Agenda</h1>
                    <p className="text-muted-foreground mt-1">Citas, llamadas, visitas, recordatorios y vencimientos.</p>
                </div>
                {puedeEditar && <Button onClick={() => nuevo(vista === 'dia' ? ref : new Date())} className="font-bold"><Plus className="h-4 w-4 mr-1" /> Nuevo evento</Button>}
            </div>

            <div className="flex flex-col lg:flex-row gap-3 justify-between lg:items-center">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => mover(-1)} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" onClick={() => setRef(new Date())}>Hoy</Button>
                    <Button variant="outline" size="icon" onClick={() => mover(1)} aria-label="Siguiente"><ChevronRight className="h-4 w-4" /></Button>
                    <h2 className="text-lg font-extrabold capitalize ml-2">{titulo}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className="flex bg-muted/60 p-1 rounded-xl">
                        {(['dia', 'semana', 'mes'] as Vista[]).map(v => (
                            <button key={v} onClick={() => setVista(v)} className={cn('px-3 py-1.5 rounded-lg text-xs font-bold capitalize text-muted-foreground', vista === v && 'bg-card text-foreground shadow-sm')}>{v === 'dia' ? 'Día' : v}</button>
                        ))}
                    </div>
                    <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                        <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todos los tipos</SelectItem>
                            <SelectItem value="vencimientos">Solo vencimientos</SelectItem>
                            {TIPOS_EVENTO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                        <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todos los estados</SelectItem>
                            {ESTADOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {usuarios.length > 1 && (
                        <Select value={filtroUsuario} onValueChange={setFiltroUsuario}>
                            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos los usuarios</SelectItem>
                                {usuarios.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.nombre || u.email}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            {items === null ? (
                <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
            ) : vista === 'mes' ? (
                <div className="rounded-2xl border bg-card overflow-hidden">
                    <div className="grid grid-cols-7 border-b bg-muted/40 text-[11px] font-bold uppercase text-muted-foreground">
                        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="px-2 py-2">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7">
                        {dias.map(d => {
                            const lista = porDia.get(iso(d)) || []
                            return (
                                <div key={iso(d)} onDoubleClick={() => puedeEditar && nuevo(d)} className={cn('min-h-[96px] md:min-h-[120px] border-b border-r p-1.5 space-y-1', !isSameMonth(d, ref) && 'bg-muted/30')}>
                                    <button onClick={() => { setRef(d); setVista('dia') }} className={cn('text-xs font-bold h-6 w-6 rounded-full', iso(d) === hoyStr ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{format(d, 'd')}</button>
                                    {lista.slice(0, 3).map(it => (
                                        <button key={it.id} onClick={() => abrir(it)} className={cn('w-full text-left truncate text-[11px] font-semibold px-1.5 py-0.5 rounded border transition-colors', colorItem(it))}>
                                            {iconoItem(it)} {hora(it)} {it.titulo}
                                        </button>
                                    ))}
                                    {lista.length > 3 && <button onClick={() => { setRef(d); setVista('dia') }} className="text-[10px] font-bold text-muted-foreground px-1">+{lista.length - 3} más</button>}
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <div className={cn('grid gap-3', vista === 'semana' ? 'md:grid-cols-7' : 'grid-cols-1')}>
                    {dias.map(d => {
                        const lista = porDia.get(iso(d)) || []
                        return (
                            <div key={iso(d)} className={cn('rounded-2xl border bg-card p-3 min-h-[120px]', iso(d) === hoyStr && 'ring-2 ring-primary/40')}>
                                <div className="flex items-center justify-between mb-2">
                                    <button onClick={() => { setRef(d); setVista('dia') }} className="text-left">
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">{format(d, 'EEEE', { locale: es })}</p>
                                        <p className={cn('text-lg font-black', iso(d) === hoyStr && 'text-primary')}>{format(d, 'd MMM', { locale: es })}</p>
                                    </button>
                                    {puedeEditar && <button onClick={() => nuevo(d)} className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Añadir"><Plus className="h-4 w-4" /></button>}
                                </div>
                                <div className="space-y-1.5">
                                    {lista.length === 0 && <p className="text-xs text-muted-foreground">{vista === 'dia' ? 'Nada programado para este día.' : '—'}</p>}
                                    {lista.map(it => (
                                        <div key={it.id} className={cn('rounded-lg border px-2.5 py-2 text-xs transition-colors', colorItem(it))}>
                                            <button className="w-full text-left" onClick={() => abrir(it)}>
                                                <p className="font-bold leading-snug">{iconoItem(it)} {hora(it) && <span className="tabular-nums mr-1">{hora(it)}</span>}{it.titulo}</p>
                                                {it.clienteNombre && <p className="opacity-80 truncate">{it.clienteNombre}</p>}
                                                {it.origen === 'vencimiento' && <p className="opacity-80">{formatCurrency(it.importe || 0)} · {it.etiqueta}</p>}
                                                {it.origen !== 'vencimiento' && it.importe ? <p className="opacity-80">{formatCurrency(it.importe)}</p> : null}
                                                {it.direccion && vista === 'dia' && <p className="opacity-80 flex items-center gap-1"><MapPin className="h-3 w-3" />{it.direccion}</p>}
                                            </button>
                                            {vista === 'dia' && it.origen === 'evento' && puedeEditar && it.estado !== 'completado' && (
                                                <div className="flex gap-2 mt-1.5">
                                                    <button onClick={async () => { const r = await cambiarEstadoEvento(it.id, 'completado'); r.success ? (toast.success('Completado'), cargar()) : toast.error(r.error) }} className="font-bold inline-flex items-center gap-1"><Check className="h-3 w-3" /> Completar</button>
                                                </div>
                                            )}
                                            {vista === 'dia' && it.origen === 'vencimiento' && it.visual !== 'pagada' && (
                                                <button onClick={() => it.facturaId && setPagar(it.facturaId)} className="font-bold mt-1 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Marcar pagada</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span>🔴 Factura vencida</span><span>🟡 Vence pronto</span><span>🟢 Cobrada</span><span>📝 Presupuesto que caduca</span>
            </div>

            <EventoDialog evento={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); cargar() }} usuarios={usuarios} />
            <MarcarPagadaDialog facturaId={pagar} open={!!pagar} onOpenChange={v => !v && setPagar(null)} onDone={cargar} />
        </div>
    )
}

function EventoDialog({ evento, onClose, onSaved, usuarios }: { evento: any; onClose: () => void; onSaved: () => void; usuarios: any[] }) {
    const [e, setE] = useState<any>(evento)
    const [guardando, setGuardando] = useState(false)
    useEffect(() => setE(evento), [evento])
    if (!e) return null
    const set = (k: string, v: any) => setE((x: any) => ({ ...x, [k]: v }))

    const guardar = async () => {
        setGuardando(true)
        const inicio = e.todo_el_dia ? new Date(e.inicio.slice(0, 10) + 'T00:00') : new Date(e.inicio)
        const r = await guardarEvento({
            ...e,
            inicio: inicio.toISOString(),
            fin: !e.todo_el_dia && e.fin ? new Date(e.fin).toISOString() : null,
        })
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        toast.success(e.id ? 'Evento actualizado' : 'Evento creado')
        onSaved()
    }
    const borrar = async () => {
        if (!confirm('¿Eliminar este evento?')) return
        const r = await eliminarEvento(e.id)
        if (!r.success) return toast.error(r.error)
        toast.success('Evento eliminado'); onSaved()
    }

    return (
        <Dialog open={!!evento} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{e.id ? 'Editar evento' : 'Nuevo evento'}</DialogTitle>
                    <DialogDescription>Organiza citas, llamadas, visitas y recordatorios.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <div>
                        <Label className="text-xs">Título</Label>
                        <Input autoFocus value={e.titulo} onChange={x => set('titulo', x.target.value)} placeholder="Llamar a Construcciones López" className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs">Tipo</Label>
                            <Select value={e.tipo} onValueChange={v => set('tipo', v)}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>{TIPOS_EVENTO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs">Estado</Label>
                            <Select value={e.estado} onValueChange={v => set('estado', v)}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>{ESTADOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2"><Switch checked={!!e.todo_el_dia} onCheckedChange={v => set('todo_el_dia', v)} /><span className="text-sm">Todo el día</span></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs">Inicio</Label>
                            <Input type={e.todo_el_dia ? 'date' : 'datetime-local'} value={e.todo_el_dia ? String(e.inicio).slice(0, 10) : e.inicio} onChange={x => set('inicio', e.todo_el_dia ? x.target.value + 'T00:00' : x.target.value)} className="mt-1" />
                        </div>
                        {!e.todo_el_dia && (
                            <div>
                                <Label className="text-xs">Fin</Label>
                                <Input type="datetime-local" value={e.fin || ''} onChange={x => set('fin', x.target.value)} className="mt-1" />
                            </div>
                        )}
                    </div>
                    <div>
                        <Label className="text-xs">Cliente (opcional)</Label>
                        <div className="mt-1"><ClientCombobox value={e.cliente_id || ''} onChange={(v: string) => set('cliente_id', v || null)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs">Dirección</Label>
                            <Input value={e.direccion || ''} onChange={x => set('direccion', x.target.value)} className="mt-1" />
                        </div>
                        <div>
                            <Label className="text-xs">Importe (cobros/pagos previstos)</Label>
                            <Input inputMode="decimal" value={e.importe ?? ''} onChange={x => set('importe', x.target.value)} className="mt-1" />
                        </div>
                    </div>
                    {usuarios.length > 1 && (
                        <div>
                            <Label className="text-xs">Asignado a</Label>
                            <Select value={e.usuario_id || ''} onValueChange={v => set('usuario_id', v)}>
                                <SelectTrigger className="mt-1"><SelectValue placeholder="Yo" /></SelectTrigger>
                                <SelectContent>{usuarios.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.nombre || u.email}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    )}
                    <div>
                        <Label className="text-xs">Notas</Label>
                        <Textarea value={e.notas || ''} onChange={x => set('notas', x.target.value)} rows={3} className="mt-1" />
                    </div>
                </div>
                <div className="flex justify-between pt-2">
                    {e.id ? <Button variant="ghost" className="text-rose-600" onClick={borrar}><Trash2 className="h-4 w-4 mr-1" /> Eliminar</Button> : <span />}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button onClick={guardar} disabled={guardando || !e.titulo?.trim()}>{guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Guardar</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

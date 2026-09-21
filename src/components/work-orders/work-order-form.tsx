'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, Wrench, MapPin, Package, ClipboardList, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { ClientCombobox } from '@/components/contacts/client-combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoneyDisplay } from '@/components/ui/money-display'
import { cn, formatCurrency } from '@/lib/utils'
import { getEffectiveRate, saveWorkOrder, type EffectiveRate, type MaterialLineInput } from '@/actions/work-orders'
import type { Contacto } from '@/types'

interface Tecnico { id: string; nombre: string }

interface ExistingWorkOrder {
    id: string
    cliente_id: string | null
    cliente_razon_social: string
    cliente_direccion?: string | null
    cliente_telefono?: string | null
    cliente_email?: string | null
    tecnico_id: string | null
    service_date: string | null
    descripcion: string | null
    diagnostico: string | null
    resolucion: string | null
    hours_worked_minutes: number
    travel_km: number
    travel_amount: number
    iva_porcentaje: number
    status: string
    materialLines: MaterialLineInput[]
}

const STATUS_OPTIONS = [
    { value: 'borrador', label: 'Borrador' },
    { value: 'programado', label: 'Programado' },
    { value: 'en_curso', label: 'En curso' },
    { value: 'pendiente_aprobacion', label: 'Pendiente de aprobación del cliente' },
    { value: 'terminado', label: 'Terminado' },
]

export function WorkOrderForm({ tecnicos, existing }: { tecnicos: Tecnico[]; existing?: ExistingWorkOrder }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    const [clienteId, setClienteId] = useState<string | null>(existing?.cliente_id ?? null)
    const [clienteNombre, setClienteNombre] = useState(existing?.cliente_razon_social ?? '')
    const [clienteDireccion, setClienteDireccion] = useState(existing?.cliente_direccion ?? '')
    const [clienteTelefono, setClienteTelefono] = useState(existing?.cliente_telefono ?? '')
    const [clienteEmail, setClienteEmail] = useState(existing?.cliente_email ?? '')
    const [tecnicoId, setTecnicoId] = useState<string | null>(existing?.tecnico_id ?? null)
    const [serviceDate, setServiceDate] = useState(existing?.service_date?.split('T')[0] ?? new Date().toISOString().split('T')[0])
    const [descripcion, setDescripcion] = useState(existing?.descripcion ?? '')
    const [diagnostico, setDiagnostico] = useState(existing?.diagnostico ?? '')
    const [resolucion, setResolucion] = useState(existing?.resolucion ?? '')
    const [minutos, setMinutos] = useState(existing?.hours_worked_minutes ?? 0)
    const [includeTravel, setIncludeTravel] = useState((existing?.travel_amount ?? 0) > 0)
    const [travelKm, setTravelKm] = useState(existing?.travel_km ?? 0)
    const [materials, setMaterials] = useState<MaterialLineInput[]>(existing?.materialLines?.length ? existing.materialLines : [])
    const [ivaPorcentaje, setIvaPorcentaje] = useState(existing?.iva_porcentaje ?? 21)
    const [status, setStatus] = useState(existing?.status ?? 'borrador')

    const [rate, setRate] = useState<EffectiveRate | null>(null)
    const [loadingRate, setLoadingRate] = useState(false)

    useEffect(() => {
        setLoadingRate(true)
        getEffectiveRate(clienteId).then(r => { setRate(r); setLoadingRate(false) })
    }, [clienteId])

    const amounts = useMemo(() => {
        if (!rate) return { billableMinutes: 0, labor: 0, travel: 0, materialsTotal: 0, subtotal: 0, iva: 0, total: 0 }
        const billableMinutes = minutos > 0 ? Math.max(minutos, rate.minimum_billable_minutes) : 0
        const labor = (billableMinutes / 60) * rate.hourly_rate
        const travel = includeTravel
            ? (rate.travel_rate_type === 'fixed' ? rate.travel_fixed_amount : rate.travel_rate_type === 'per_km' ? travelKm * rate.travel_rate_per_km : 0)
            : 0
        const materialsTotal = materials.reduce((a, m) => a + (Number(m.cantidad) || 0) * (Number(m.precio_unitario) || 0), 0)
        const subtotal = labor + travel + materialsTotal
        const iva = subtotal * (ivaPorcentaje / 100)
        return { billableMinutes, labor, travel, materialsTotal, subtotal, iva, total: subtotal + iva }
    }, [rate, minutos, includeTravel, travelKm, materials, ivaPorcentaje])

    const missing: string[] = []
    if (!clienteId) missing.push('Cliente')
    if (!descripcion.trim()) missing.push('Descripción de la intervención')
    if (!serviceDate) missing.push('Fecha de intervención')
    if (amounts.subtotal <= 0) missing.push('Al menos una línea valorada')

    function handleClientSelect(id: string, contact?: Contacto) {
        setClienteId(id || null)
        if (contact) {
            setClienteNombre(contact.razon_social)
            setClienteDireccion(contact.direccion || '')
            setClienteTelefono(contact.telefono || '')
            setClienteEmail(contact.email || '')
        }
    }

    function updateMaterial(idx: number, patch: Partial<MaterialLineInput>) {
        setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))
    }

    function save() {
        if (!clienteId) { toast.error('Selecciona un cliente antes de guardar') ; return }
        startTransition(async () => {
            const res = await saveWorkOrder({
                id: existing?.id,
                cliente_id: clienteId,
                cliente_razon_social: clienteNombre,
                cliente_direccion: clienteDireccion,
                cliente_telefono: clienteTelefono,
                cliente_email: clienteEmail,
                tecnico_id: tecnicoId,
                tecnico_nombre: tecnicos.find(t => t.id === tecnicoId)?.nombre,
                service_date: serviceDate,
                descripcion,
                diagnostico,
                resolucion,
                hours_worked_minutes: minutos,
                include_travel: includeTravel,
                travel_km: travelKm,
                materials,
                iva_porcentaje: ivaPorcentaje,
                status,
            })

            if (res.success) {
                toast.success(existing ? 'Parte actualizado' : 'Parte creado')
                if (!existing) router.push(`/partes-de-trabajo/${res.id}`)
                else router.refresh()
            } else {
                toast.error(res.error || 'No se pudo guardar el parte')
            }
        })
    }

    return (
        <div className="space-y-6 pb-32">
            {/* Cliente */}
            <Section icon={Wrench} title="Cliente">
                <ClientCombobox value={clienteId ?? undefined} onChange={handleClientSelect} />
                {loadingRate && <p className="text-xs text-muted-foreground mt-2">Cargando tarifa…</p>}
                {rate && !loadingRate && clienteId && (
                    <div className={cn(
                        'mt-3 text-xs font-semibold px-3 py-2 rounded-lg inline-flex items-center gap-2',
                        rate.source === 'client' ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' : 'bg-muted text-muted-foreground'
                    )}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {rate.label}
                        {rate.travel_rate_type === 'fixed' && ` · Desplazamiento fijo: ${formatCurrency(rate.travel_fixed_amount)}`}
                        {rate.travel_rate_type === 'per_km' && ` · Desplazamiento: ${formatCurrency(rate.travel_rate_per_km)}/km`}
                    </div>
                )}
            </Section>

            {/* Intervención */}
            <Section icon={MapPin} title="Intervención">
                <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Fecha</Label>
                        <Input type="date" className="mt-1" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
                    </div>
                    <div>
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Técnico asignado</Label>
                        <Select value={tecnicoId ?? undefined} onValueChange={setTecnicoId}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                            <SelectContent>
                                {tecnicos.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="mt-4">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Descripción del aviso</Label>
                    <Textarea className="mt-1" rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Qué se ha reportado, dirección, contexto…" />
                </div>
            </Section>

            {/* Trabajo realizado */}
            <Section icon={ClipboardList} title="Trabajo realizado">
                <div className="space-y-4">
                    <div>
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Diagnóstico</Label>
                        <Textarea className="mt-1" rows={2} value={diagnostico} onChange={e => setDiagnostico(e.target.value)} />
                    </div>
                    <div>
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Resolución</Label>
                        <Textarea className="mt-1" rows={2} value={resolucion} onChange={e => setResolucion(e.target.value)} />
                    </div>
                </div>
            </Section>

            {/* Mano de obra + desplazamiento */}
            <Section icon={Wrench} title="Mano de obra y desplazamiento">
                <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Minutos trabajados</Label>
                        <Input type="number" min={0} className="mt-1" value={minutos} onChange={e => setMinutos(Number(e.target.value))} />
                        {rate && minutos > 0 && (
                            <p className="text-xs text-muted-foreground mt-1.5">
                                {amounts.billableMinutes} min facturables (mínimo {rate.minimum_billable_minutes}) → <b>{formatCurrency(amounts.labor)}</b>
                            </p>
                        )}
                    </div>
                    <div>
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">Incluir desplazamiento</Label>
                            <Switch checked={includeTravel} onCheckedChange={setIncludeTravel} />
                        </div>
                        {includeTravel && rate?.travel_rate_type === 'per_km' && (
                            <Input type="number" min={0} className="mt-2" placeholder="Km recorridos" value={travelKm} onChange={e => setTravelKm(Number(e.target.value))} />
                        )}
                        {includeTravel && (
                            <p className="text-xs text-muted-foreground mt-1.5">→ <b>{formatCurrency(amounts.travel)}</b></p>
                        )}
                    </div>
                </div>
            </Section>

            {/* Materiales */}
            <Section icon={Package} title="Materiales y servicios">
                <div className="space-y-2">
                    {materials.map((m, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                            <Input className="col-span-6" placeholder="Descripción" value={m.descripcion} onChange={e => updateMaterial(idx, { descripcion: e.target.value })} />
                            <Input className="col-span-2 text-center" type="number" step="0.01" placeholder="Cant." value={m.cantidad} onChange={e => updateMaterial(idx, { cantidad: Number(e.target.value) })} />
                            <Input className="col-span-3 text-right" type="number" step="0.01" placeholder="Precio €" value={m.precio_unitario} onChange={e => updateMaterial(idx, { precio_unitario: Number(e.target.value) })} />
                            <Button type="button" variant="ghost" size="icon" className="col-span-1 text-rose-500" onClick={() => setMaterials(prev => prev.filter((_, i) => i !== idx))}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setMaterials(prev => [...prev, { descripcion: '', cantidad: 1, precio_unitario: 0 }])}>
                        <Plus className="h-4 w-4 mr-1" /> Añadir material
                    </Button>
                </div>
            </Section>

            {/* Resumen */}
            <div className="metric-card bg-card sticky bottom-20 md:bottom-4 z-10 shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">IVA aplicable</Label>
                    <Select value={String(ivaPorcentaje)} onValueChange={v => setIvaPorcentaje(Number(v))}>
                        <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="21">21%</SelectItem>
                            <SelectItem value="10">10%</SelectItem>
                            <SelectItem value="4">4%</SelectItem>
                            <SelectItem value="0">0%</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1 text-sm">
                    <Row label="Mano de obra" value={amounts.labor} />
                    <Row label="Desplazamiento" value={amounts.travel} />
                    <Row label="Materiales" value={amounts.materialsTotal} />
                    <Row label={`IVA (${ivaPorcentaje}%)`} value={amounts.iva} />
                    <div className="flex justify-between items-center pt-2 border-t border-border mt-2">
                        <span className="font-extrabold text-foreground">Total</span>
                        <MoneyDisplay value={amounts.total} size="lg" tone="positive" />
                    </div>
                </div>

                {missing.length > 0 && (
                    <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3">
                        <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">Para poder convertir a albarán falta:</p>
                        <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc list-inside space-y-0.5">
                            {missing.map(m => <li key={m}>{m}</li>)}
                        </ul>
                    </div>
                )}

                <div className="flex items-center gap-3 mt-4">
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button onClick={save} disabled={pending} className="gap-2 font-bold">
                        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Guardar
                    </Button>
                </div>
            </div>
        </div>
    )
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
    return (
        <div className="metric-card bg-card">
            <div className="flex items-center gap-2.5 mb-4">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
            </div>
            {children}
        </div>
    )
}

function Row({ label, value }: { label: string; value: number }) {
    if (value === 0) return null
    return (
        <div className="flex justify-between text-muted-foreground">
            <span>{label}</span>
            <span className="font-mono">{formatCurrency(value)}</span>
        </div>
    )
}

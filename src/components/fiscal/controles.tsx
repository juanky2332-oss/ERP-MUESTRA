'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { desmarcarEntregado, guardarConfigFiscal, marcarEntregado } from '@/actions/fiscal'
import { MODELOS, modeloActivo, type ConfigFiscal, type IdModelo, type Regimen } from '@/lib/fiscal/calendario'

export function SelectorPeriodo({ actual, opciones }: { actual: string; opciones: { clave: string; etiqueta: string }[] }) {
    const router = useRouter()
    const [pendiente, start] = useTransition()
    return (
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Periodo
            <select value={actual} disabled={pendiente} onChange={e => start(() => router.push(`/fiscal?periodo=${encodeURIComponent(e.target.value)}`))}
                className="h-10 rounded-lg border bg-background px-3 text-sm font-medium min-w-0 max-w-full">
                {opciones.map(o => <option key={o.clave} value={o.clave}>{o.etiqueta}</option>)}
            </select>
            {pendiente && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </label>
    )
}

export function BotonEntregado({ clave, periodo, entregado }: { clave: string; periodo: string; entregado?: boolean }) {
    const router = useRouter()
    const [pendiente, start] = useTransition()
    const accion = () => start(async () => {
        const r = entregado ? await desmarcarEntregado(clave) : await marcarEntregado(clave, periodo)
        if (!r.success) { toast.error(r.error); return }
        toast.success(entregado ? 'Aviso reactivado' : 'Marcado como entregado: ya no se avisará de este periodo')
        router.refresh()
    })
    return (
        <Button size="sm" variant={entregado ? 'ghost' : 'secondary'} onClick={accion} disabled={pendiente}>
            {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : entregado ? <Undo2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {entregado ? 'Deshacer' : 'Ya entregado al asesor'}
        </Button>
    )
}

export function ConfigFiscalForm({ inicial, puedeEditar }: { inicial: ConfigFiscal; puedeEditar: boolean }) {
    const router = useRouter()
    const [cfg, setCfg] = useState<ConfigFiscal>(inicial)
    const [pendiente, start] = useTransition()
    const cambiado = JSON.stringify(cfg) !== JSON.stringify(inicial)

    const setRegimen = (regimen: Regimen) => setCfg({ ...cfg, regimen, modelos: {} })
    const setModelo = (id: IdModelo, v: boolean) => setCfg({ ...cfg, modelos: { ...cfg.modelos, [id]: v } })
    const guardar = () => start(async () => {
        const r = await guardarConfigFiscal(cfg)
        if (!r.success) { toast.error(r.error); return }
        toast.success('Configuración fiscal guardada')
        router.refresh()
    })

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Régimen fiscal">
                {([['sociedad', 'Sociedad (S.L., S.A.)', 'Impuesto sobre Sociedades'], ['autonomo', 'Autónomo', 'IRPF, estimación directa']] as const).map(([v, t, d]) => (
                    <button key={v} type="button" role="radio" aria-checked={cfg.regimen === v} disabled={!puedeEditar} onClick={() => setRegimen(v)}
                        className={`rounded-xl border p-3 text-left transition-colors ${cfg.regimen === v ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'} disabled:opacity-60`}>
                        <p className="text-sm font-bold">{t}</p>
                        <p className="text-xs text-muted-foreground">{d}</p>
                    </button>
                ))}
            </div>

            <div className="space-y-1">
                <p className="text-sm font-bold">Modelos que presentas</p>
                {MODELOS.filter(m => m.regimenes.includes(cfg.regimen)).map(m => (
                    <label key={m.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/40 cursor-pointer">
                        <Switch checked={modeloActivo(cfg, m.id)} onCheckedChange={v => setModelo(m.id, v)} disabled={!puedeEditar} className="mt-0.5" />
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold">{m.nombre}</span>
                            <span className="block text-xs text-muted-foreground">{m.descripcion}</span>
                        </span>
                    </label>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold space-y-1">
                    <span>Avisar con</span>
                    <div className="flex items-center gap-2"><Input type="number" min={1} max={90} value={cfg.dias_aviso} disabled={!puedeEditar} onChange={e => setCfg({ ...cfg, dias_aviso: Number(e.target.value) })} className="w-20" /><span className="text-xs text-muted-foreground font-normal">días de antelación</span></div>
                </label>
                <label className="text-sm font-semibold space-y-1">
                    <span>El asesor necesita</span>
                    <div className="flex items-center gap-2"><Input type="number" min={0} max={30} value={cfg.dias_margen_asesor} disabled={!puedeEditar} onChange={e => setCfg({ ...cfg, dias_margen_asesor: Number(e.target.value) })} className="w-20" /><span className="text-xs text-muted-foreground font-normal">días antes del plazo</span></div>
                </label>
            </div>

            {puedeEditar
                ? <Button onClick={guardar} disabled={!cambiado || pendiente}>{pendiente && <Loader2 className="h-4 w-4 animate-spin" />}Guardar configuración</Button>
                : <p className="text-xs text-muted-foreground">Solo el propietario o un administrador puede cambiar la configuración fiscal.</p>}
        </div>
    )
}

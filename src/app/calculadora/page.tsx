'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Calculator, TrendingUp, TrendingDown, RefreshCw, Plus, Trash2, Wand2, FileText, Package, Save, Copy, Loader2, Info, Scale, Settings2, History, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClientCombobox } from '@/components/contacts/client-combobox'
import { DiagramaForma } from '@/components/calculadora/diagrama-forma'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { MATERIALES, FAMILIAS, MAQUINAS, TRATAMIENTOS, INDICES_REFERENCIA, precioConMercado, materialPorId, type Material } from '@/lib/calculadora/materiales'
import { FORMAS, PERFILES_STD, calcular, cicloSugerido, corteSugerido, seccionCm2, descripcionPieza, formaPorId, type FormaId, type Operacion, type Tratamiento, type Taladro, type Cajera } from '@/lib/calculadora/calculo'
import { getCalculadora, guardarPrecioMaterial, actualizarPreciosConMercado, restablecerPrecioMaterial, guardarTarifasYParametros, guardarMaterialPropio, eliminarMaterialPropio, guardarCalculo } from '@/actions/calculadora'

const num = (v: string | number) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : 0 }
const kg = (x: number) => `${x.toLocaleString('es-ES', { maximumFractionDigits: 3 })} kg`
const uid = () => Math.random().toString(36).slice(2, 9)
const CANTIDADES = [1, 5, 10, 25, 50, 100, 250]

function CampoNum({ label, value, onChange, sufijo = 'mm', className }: { label: string; value: any; onChange: (v: string) => void; sufijo?: string; className?: string }) {
    return (
        <div className={className}>
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="relative mt-1">
                <Input inputMode="decimal" value={value ?? ''} onChange={e => onChange(e.target.value)} className="pr-10 font-semibold tabular-nums" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{sufijo}</span>
            </div>
        </div>
    )
}

export default function CalculadoraPage() {
    const [datos, setDatos] = useState<any>(null)
    const [cargando, setCargando] = useState(true)

    // Pieza
    const [nombre, setNombre] = useState('Eje')
    const [cantidad, setCantidad] = useState('10')
    const [materialId, setMaterialId] = useState('c45')
    const [precioManual, setPrecioManual] = useState<string>('')
    const [forma, setForma] = useState<FormaId>('redonda')
    const [perfil, setPerfil] = useState({ serie: 'IPE', talla: '200' })
    const [dims, setDims] = useState<Record<string, string>>({ D: '40', L: '120' })
    const [secc, setSecc] = useState('3')
    const [largo, setLargo] = useState('5')
    const [comercial, setComercial] = useState(true)
    const [taladros, setTaladros] = useState<(Taladro & { id: string })[]>([])
    const [cajeras, setCajeras] = useState<(Cajera & { id: string })[]>([])
    const [kerf, setKerf] = useState('3')
    const [largoBarra, setLargoBarra] = useState('0')
    const [merma, setMerma] = useState('0')
    const [viruta, setViruta] = useState(false)
    const [operaciones, setOperaciones] = useState<Operacion[]>([
        { id: uid(), maquinaId: 'sierra', nombre: 'Sierra de cinta (corte)', tarifa: 28, prepMin: 5, cicloMin: 1 },
        { id: uid(), maquinaId: 'torno_cnc', nombre: 'Torno CNC', tarifa: 52, prepMin: 45, cicloMin: 6 },
    ])
    const [tratamientos, setTratamientos] = useState<Tratamiento[]>([])
    const [otros, setOtros] = useState('0')
    const [margen, setMargen] = useState('30')
    const [iva, setIva] = useState('21')

    const [dialogo, setDialogo] = useState<null | 'presupuesto'>(null)
    const [clienteId, setClienteId] = useState('')
    const [guardando, setGuardando] = useState(false)

    const cargar = useCallback(async () => {
        const r = await getCalculadora()
        if (r.success) {
            setDatos(r)
            const p = r.config.parametros || {}
            if (p.margen != null) setMargen(String(p.margen))
            if (p.kerf != null) setKerf(String(p.kerf))
            if (p.largoBarra != null) setLargoBarra(String(p.largoBarra))
            if (p.sobremedidaSeccion != null) setSecc(String(p.sobremedidaSeccion))
            if (p.sobremedidaLargo != null) setLargo(String(p.sobremedidaLargo))
            const t = r.config.tarifas || {}
            setOperaciones(ops => ops.map(o => (t[o.maquinaId] ? { ...o, tarifa: t[o.maquinaId] } : o)))
        } else toast.error(r.error)
        setCargando(false)
    }, [])
    useEffect(() => { cargar() }, [cargar])

    const extra: Material[] = datos?.config?.materiales_extra || []
    const todos = useMemo(() => [...MATERIALES, ...extra], [extra])
    const material = materialPorId(materialId, extra) || MATERIALES[0]
    const mercado = datos?.mercado

    /** Precio efectivo: el tuyo guardado; si no, el orientativo ajustado al mercado de hoy. */
    const precioDe = useCallback((m: Material) => {
        const propio = datos?.config?.precios?.[m.id]
        if (propio?.precioKg) return { precio: Number(propio.precioKg), origen: 'propio' as const, fecha: propio.fecha }
        const cot = mercado?.cotizaciones || {}
        return { precio: precioConMercado(m.precioKg, m.indice, m.sensibilidad, cot, INDICES_REFERENCIA), origen: m.indice && m.sensibilidad ? 'mercado' as const : 'orientativo' as const, fecha: null }
    }, [datos, mercado])

    const precioEfectivo = precioManual !== '' ? num(precioManual) : precioDe(material).precio
    const tarifaDe = (maquinaId: string) => datos?.config?.tarifas?.[maquinaId] ?? MAQUINAS.find(m => m.id === maquinaId)?.tarifa ?? 40

    const final = useMemo(() => Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, num(v)])), [dims])
    const entrada = useMemo(() => ({
        material, precioKg: precioEfectivo, forma, perfil, final,
        sobremedida: { seccion: num(secc), largo: num(largo), redondearComercial: comercial },
        taladros, cajeras, cantidad: Math.max(1, Math.round(num(cantidad))), kerf: num(kerf), largoBarra: num(largoBarra),
        merma: num(merma), descontarViruta: viruta, operaciones, tratamientos, otrosLote: num(otros), margen: num(margen),
    }), [material, precioEfectivo, forma, perfil, final, secc, largo, comercial, taladros, cajeras, cantidad, kerf, largoBarra, merma, viruta, operaciones, tratamientos, otros, margen])

    const r = useMemo(() => calcular(entrada), [entrada])
    const escalado = useMemo(() => CANTIDADES.map(c => ({ c, r: calcular({ ...entrada, cantidad: c }) })), [entrada])
    const f = formaPorId(forma)
    const descripcion = descripcionPieza(nombre, forma, final, material.nombre, r.pesoNeto, forma === 'perfil_std' ? perfil : undefined)
    const totalConIva = r.precioLote * (1 + num(iva) / 100)

    const cambiarForma = (id: FormaId) => {
        setForma(id)
        const nueva = formaPorId(id)
        setDims(prev => Object.fromEntries(nueva.campos.map(c => [c.key, prev[c.key] ?? ''])))
    }

    const estimar = (o: Operacion) => {
        const volViruta = Math.max(0, r.volBrutoCm3 - r.volFinalCm3)
        if (o.maquinaId === 'sierra') {
            const s = seccionCm2(forma, r.bruto, material.densidad, forma === 'perfil_std' ? perfil : undefined)
            return s ? corteSugerido(s, material.maquinabilidad) : null
        }
        const maq = MAQUINAS.find(m => m.id === o.maquinaId)
        const principales = operaciones.filter(x => (MAQUINAS.find(m => m.id === x.maquinaId)?.mrr || 0) > 0 && x.maquinaId !== 'sierra')
        const reparto = principales.length ? volViruta / principales.length : volViruta
        return maq ? cicloSugerido(reparto, maq.mrr, material.maquinabilidad) : null
    }

    const guardar = async (modo: 'historial' | 'presupuesto' | 'catalogo') => {
        if (modo === 'presupuesto' && !clienteId) return toast.error('Elige un cliente.')
        setGuardando(true)
        const res = await guardarCalculo({
            nombre, entrada: { ...entrada, materialId, material: undefined }, resultado: r, precioUnidad: r.precioUnidad, cantidad: entrada.cantidad,
            descripcionLinea: descripcion,
            crearPresupuesto: modo === 'presupuesto' ? { clienteId, ivaPct: num(iva) } : null,
            anadirCatalogo: modo === 'catalogo',
        })
        setGuardando(false)
        if (!res.success) return toast.error(res.error)
        if (res.presupuesto) toast.success(`Presupuesto ${res.presupuesto.numero} creado en borrador`, { action: { label: 'Ver', onClick: () => (window.location.href = '/presupuestos') } })
        else toast.success(modo === 'catalogo' ? 'Añadido al catálogo' : 'Cálculo guardado')
        setDialogo(null); cargar()
    }

    const cargarDelHistorial = (h: any) => {
        const e = h.entrada || {}
        setNombre(h.nombre); setMaterialId(e.materialId || 'c45'); setForma(e.forma); setPerfil(e.perfil || { serie: 'IPE', talla: '200' })
        setDims(Object.fromEntries(Object.entries(e.final || {}).map(([k, v]) => [k, String(v)])))
        setSecc(String(e.sobremedida?.seccion ?? 0)); setLargo(String(e.sobremedida?.largo ?? 0)); setComercial(!!e.sobremedida?.redondearComercial)
        setTaladros((e.taladros || []).map((t: any) => ({ ...t, id: uid() }))); setCajeras((e.cajeras || []).map((t: any) => ({ ...t, id: uid() })))
        setCantidad(String(e.cantidad || 1)); setKerf(String(e.kerf ?? 3)); setLargoBarra(String(e.largoBarra ?? 0)); setMerma(String(e.merma ?? 0))
        setViruta(!!e.descontarViruta); setOperaciones(e.operaciones || []); setTratamientos(e.tratamientos || []); setOtros(String(e.otrosLote ?? 0)); setMargen(String(e.margen ?? 30))
        setPrecioManual(String(e.precioKg ?? ''))
        toast.success(`Cálculo «${h.nombre}» cargado`)
    }

    if (cargando) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2"><Calculator className="h-7 w-7 text-primary" /> Calculadora de mecanizado</h1>
                    <p className="text-muted-foreground mt-1">Peso de cualquier pieza en cualquier material, coste de material al precio de hoy, tiempos de máquina y precio para presupuestar.</p>
                </div>
            </div>

            <MercadoHoy mercado={mercado} puedeEditar={datos?.puedeEditar} onActualizado={cargar} />

            <Tabs defaultValue="calculo">
                <TabsList>
                    <TabsTrigger value="calculo"><Calculator className="h-4 w-4 mr-1" /> Calcular pieza</TabsTrigger>
                    <TabsTrigger value="precios"><Settings2 className="h-4 w-4 mr-1" /> Mis precios y tarifas</TabsTrigger>
                    <TabsTrigger value="historial"><History className="h-4 w-4 mr-1" /> Historial</TabsTrigger>
                </TabsList>

                <TabsContent value="calculo" className="pt-4">
                    <div className="grid xl:grid-cols-[1fr_400px] gap-5 items-start">
                        <div className="space-y-4">
                            {/* 1. Pieza y material */}
                            <Bloque n={1} titulo="Pieza y material">
                                <div className="grid sm:grid-cols-[1fr_120px] gap-3">
                                    <div><Label className="text-xs text-muted-foreground">Nombre de la pieza</Label><Input value={nombre} onChange={e => setNombre(e.target.value)} className="mt-1" placeholder="Eje, casquillo, brida…" /></div>
                                    <CampoNum label="Cantidad" value={cantidad} onChange={setCantidad} sufijo="ud" />
                                </div>
                                <div className="grid sm:grid-cols-[1fr_170px] gap-3">
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Material</Label>
                                        <Select value={materialId} onValueChange={v => { setMaterialId(v); setPrecioManual('') }}>
                                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                            <SelectContent className="max-h-[420px]">
                                                {[...FAMILIAS, 'Materiales propios' as const].map(fam => {
                                                    const lista = todos.filter(m => (fam === 'Materiales propios' ? extra.includes(m) : m.familia === fam && !extra.includes(m)))
                                                    if (!lista.length) return null
                                                    return (
                                                        <SelectGroup key={fam}>
                                                            <SelectLabel>{fam}</SelectLabel>
                                                            {lista.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                                                        </SelectGroup>
                                                    )
                                                })}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[11px] text-muted-foreground mt-1">{material.norma} · densidad {material.densidad} g/cm³ · maquinabilidad {material.maquinabilidad}</p>
                                    </div>
                                    <div>
                                        <CampoNum label="Precio material" value={precioManual !== '' ? precioManual : precioDe(material).precio.toFixed(2)} onChange={setPrecioManual} sufijo="€/kg" />
                                        <p className="text-[11px] mt-1 text-muted-foreground">
                                            {precioManual !== '' ? <button className="text-primary font-semibold" onClick={async () => { const x = await guardarPrecioMaterial(materialId, num(precioManual)); if (x.success) { toast.success('Guardado como tu precio'); setPrecioManual(''); cargar() } else toast.error(x.error) }}>Guardar como mi precio</button>
                                                : precioDe(material).origen === 'propio' ? `Tu precio (${precioDe(material).fecha})` : precioDe(material).origen === 'mercado' ? 'Orientativo ajustado a mercado hoy' : 'Orientativo'}
                                        </p>
                                    </div>
                                </div>
                            </Bloque>

                            {/* 2. Forma y medidas */}
                            <Bloque n={2} titulo="Forma y medidas de la pieza terminada">
                                <div className="flex flex-wrap gap-1.5">
                                    {FORMAS.map(x => (
                                        <button key={x.id} onClick={() => cambiarForma(x.id)} className={cn('px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors', forma === x.id ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{x.nombre}</button>
                                    ))}
                                </div>
                                <div className="grid md:grid-cols-[220px_1fr] gap-4 items-start">
                                    <DiagramaForma forma={forma} dims={final} />
                                    <div className="space-y-3">
                                        {forma === 'perfil_std' && (
                                            <div className="grid grid-cols-2 gap-3">
                                                <div><Label className="text-xs text-muted-foreground">Serie</Label>
                                                    <Select value={perfil.serie} onValueChange={v => setPerfil({ serie: v, talla: Object.keys(PERFILES_STD[v])[0] })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(PERFILES_STD).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                                                <div><Label className="text-xs text-muted-foreground">Tamaño</Label>
                                                    <Select value={perfil.talla} onValueChange={v => setPerfil({ ...perfil, talla: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PERFILES_STD[perfil.serie]).map(([t, k]) => <SelectItem key={t} value={t}>{perfil.serie} {t} · {k} kg/m</SelectItem>)}</SelectContent></Select></div>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            {f.campos.map(c => <CampoNum key={c.key} label={c.label} value={dims[c.key]} onChange={v => setDims({ ...dims, [c.key]: v })} sufijo={c.key === 'V' ? 'cm³' : c.key === 'P' ? 'kg' : 'mm'} />)}
                                        </div>
                                        {!['volumen', 'peso'].includes(forma) && (
                                            <details className="rounded-lg border p-3" open={taladros.length + cajeras.length > 0}>
                                                <summary className="text-xs font-bold text-muted-foreground cursor-pointer">Taladros y cajeras (restan peso a la pieza terminada)</summary>
                                                <div className="space-y-2 mt-2">
                                                    {taladros.map(t => (
                                                        <div key={t.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                                                            <CampoNum label="Taladro Ø" value={t.d} onChange={v => setTaladros(l => l.map(x => x.id === t.id ? { ...x, d: num(v) } : x))} />
                                                            <CampoNum label="Profundidad" value={t.prof} onChange={v => setTaladros(l => l.map(x => x.id === t.id ? { ...x, prof: num(v) } : x))} />
                                                            <CampoNum label="Nº" value={t.n} onChange={v => setTaladros(l => l.map(x => x.id === t.id ? { ...x, n: num(v) } : x))} sufijo="ud" />
                                                            <Button variant="ghost" size="icon" onClick={() => setTaladros(l => l.filter(x => x.id !== t.id))} aria-label="Quitar"><Trash2 className="h-4 w-4" /></Button>
                                                        </div>
                                                    ))}
                                                    {cajeras.map(t => (
                                                        <div key={t.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end">
                                                            <CampoNum label="Cajera largo" value={t.a} onChange={v => setCajeras(l => l.map(x => x.id === t.id ? { ...x, a: num(v) } : x))} />
                                                            <CampoNum label="Ancho" value={t.b} onChange={v => setCajeras(l => l.map(x => x.id === t.id ? { ...x, b: num(v) } : x))} />
                                                            <CampoNum label="Prof." value={t.p} onChange={v => setCajeras(l => l.map(x => x.id === t.id ? { ...x, p: num(v) } : x))} />
                                                            <CampoNum label="Nº" value={t.n} onChange={v => setCajeras(l => l.map(x => x.id === t.id ? { ...x, n: num(v) } : x))} sufijo="ud" />
                                                            <Button variant="ghost" size="icon" onClick={() => setCajeras(l => l.filter(x => x.id !== t.id))} aria-label="Quitar"><Trash2 className="h-4 w-4" /></Button>
                                                        </div>
                                                    ))}
                                                    <div className="flex gap-2">
                                                        <Button size="sm" variant="outline" onClick={() => setTaladros(l => [...l, { id: uid(), d: 10, prof: 20, n: 1 }])}><Plus className="h-4 w-4 mr-1" /> Taladro</Button>
                                                        <Button size="sm" variant="outline" onClick={() => setCajeras(l => [...l, { id: uid(), a: 20, b: 10, p: 5, n: 1 }])}><Plus className="h-4 w-4 mr-1" /> Cajera</Button>
                                                    </div>
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            </Bloque>

                            {/* 3. Material en bruto */}
                            {!['volumen', 'peso'].includes(forma) && (
                                <Bloque n={3} titulo="Material en bruto y compra">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <CampoNum label="Creces en sección" value={secc} onChange={setSecc} />
                                        <CampoNum label="Creces en largo" value={largo} onChange={setLargo} />
                                        <CampoNum label="Ancho de corte sierra" value={kerf} onChange={setKerf} />
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Compra</Label>
                                            <Select value={largoBarra} onValueChange={setLargoBarra}>
                                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="0">Cortado a medida</SelectItem>
                                                    <SelectItem value="1000">Barra de 1 m</SelectItem>
                                                    <SelectItem value="3000">Barra de 3 m</SelectItem>
                                                    <SelectItem value="6000">Barra de 6 m</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <CampoNum label="Merma / recortes" value={merma} onChange={setMerma} sufijo="%" />
                                        <div className="col-span-2 md:col-span-3 flex flex-wrap gap-x-6 gap-y-2 items-end pb-2">
                                            {f.comercial && <label className="flex items-center gap-2 text-sm"><Switch checked={comercial} onCheckedChange={setComercial} /> Redondear a medida comercial</label>}
                                            <label className="flex items-center gap-2 text-sm"><Switch checked={viruta} onCheckedChange={setViruta} /> Descontar venta de viruta ({formatCurrency(material.viruta)}/kg)</label>
                                        </div>
                                    </div>
                                    <p className="text-xs rounded-lg bg-muted p-2">
                                        Bruto: <b>{f.campos.map(c => `${c.key} ${String(Math.round((r.bruto[c.key] || 0) * 100) / 100).replace('.', ',')}`).join(' · ')}</b>
                                        {r.piezasPorBarra != null && <> · <b>{r.piezasPorBarra}</b> piezas por barra · <b>{r.barras ?? '—'}</b> barra(s)</>}
                                        {r.piezasPorBarra === 0 && <span className="text-rose-600"> · la pieza no cabe en la barra</span>}
                                    </p>
                                </Bloque>
                            )}

                            {/* 4. Operaciones */}
                            <Bloque n={4} titulo="Operaciones y tiempos">
                                <div className="space-y-2">
                                    <div className="hidden md:grid grid-cols-[1.6fr_90px_100px_100px_auto_auto] gap-2 text-[11px] font-bold uppercase text-muted-foreground px-1">
                                        <span>Máquina</span><span>€/hora</span><span>Preparación (lote)</span><span>Ciclo (pieza)</span><span /><span />
                                    </div>
                                    {operaciones.map(o => (
                                        <div key={o.id} className="grid grid-cols-2 md:grid-cols-[1.6fr_90px_100px_100px_auto_auto] gap-2 items-end">
                                            <Select value={o.maquinaId} onValueChange={v => { const m = MAQUINAS.find(x => x.id === v)!; setOperaciones(l => l.map(x => x.id === o.id ? { ...x, maquinaId: v, nombre: m.nombre, tarifa: tarifaDe(v) } : x)) }}>
                                                <SelectTrigger className="col-span-2 md:col-span-1"><SelectValue /></SelectTrigger>
                                                <SelectContent>{MAQUINAS.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}</SelectContent>
                                            </Select>
                                            <CampoNum label="" value={o.tarifa} onChange={v => setOperaciones(l => l.map(x => x.id === o.id ? { ...x, tarifa: num(v) } : x))} sufijo="€/h" />
                                            <CampoNum label="" value={o.prepMin} onChange={v => setOperaciones(l => l.map(x => x.id === o.id ? { ...x, prepMin: num(v) } : x))} sufijo="min" />
                                            <CampoNum label="" value={o.cicloMin} onChange={v => setOperaciones(l => l.map(x => x.id === o.id ? { ...x, cicloMin: num(v) } : x))} sufijo="min" />
                                            <Button variant="outline" size="sm" title="Estimar el ciclo según el volumen a quitar y el material" onClick={() => { const t = estimar(o); if (t == null) return toast.info('Para esta operación pon el tiempo a mano.'); setOperaciones(l => l.map(x => x.id === o.id ? { ...x, cicloMin: t } : x)); toast.success(`Ciclo estimado: ${t} min/pieza`) }}><Wand2 className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => setOperaciones(l => l.filter(x => x.id !== o.id))} aria-label="Quitar"><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    ))}
                                    <Button size="sm" variant="outline" onClick={() => setOperaciones(l => [...l, { id: uid(), maquinaId: 'cm3', nombre: 'Centro de mecanizado 3 ejes', tarifa: tarifaDe('cm3'), prepMin: 30, cicloMin: 5 }])}><Plus className="h-4 w-4 mr-1" /> Operación</Button>
                                    <p className="text-[11px] text-muted-foreground flex items-start gap-1"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0" /> La varita estima el ciclo con el volumen de viruta ({(Math.max(0, r.volBrutoCm3 - r.volFinalCm3)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} cm³/pieza), el arranque típico de la máquina y la maquinabilidad del material. Ajústalo con tu experiencia.</p>
                                </div>
                            </Bloque>

                            {/* 5. Tratamientos y otros */}
                            <Bloque n={5} titulo="Tratamientos, otros costes y margen">
                                <div className="space-y-2">
                                    {tratamientos.map(t => (
                                        <div key={t.id} className="grid grid-cols-2 md:grid-cols-[1.5fr_120px_110px_110px_auto] gap-2 items-end">
                                            <div className="col-span-2 md:col-span-1"><Input value={t.nombre} onChange={e => setTratamientos(l => l.map(x => x.id === t.id ? { ...x, nombre: e.target.value } : x))} /></div>
                                            <Select value={t.unidad} onValueChange={v => setTratamientos(l => l.map(x => x.id === t.id ? { ...x, unidad: v as any } : x))}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent><SelectItem value="kg">€ por kg</SelectItem><SelectItem value="pieza">€ por pieza</SelectItem><SelectItem value="lote">€ por lote</SelectItem></SelectContent>
                                            </Select>
                                            <CampoNum label="" value={t.precio} onChange={v => setTratamientos(l => l.map(x => x.id === t.id ? { ...x, precio: num(v) } : x))} sufijo="€" />
                                            <CampoNum label="" value={t.minimo ?? 0} onChange={v => setTratamientos(l => l.map(x => x.id === t.id ? { ...x, minimo: num(v) } : x))} sufijo="mín." />
                                            <Button variant="ghost" size="icon" onClick={() => setTratamientos(l => l.filter(x => x.id !== t.id))} aria-label="Quitar"><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    ))}
                                    <Select value="" onValueChange={v => { const t = TRATAMIENTOS.find(x => x.id === v)!; setTratamientos(l => [...l, { id: uid(), nombre: t.nombre, unidad: t.unidad, precio: t.precio, minimo: t.minimo }]) }}>
                                        <SelectTrigger className="w-64"><SelectValue placeholder="+ Añadir tratamiento" /></SelectTrigger>
                                        <SelectContent>{TRATAMIENTOS.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre} · {t.precio} €/kg (mín. {t.minimo} €)</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <CampoNum label="Otros costes del lote" value={otros} onChange={setOtros} sufijo="€" />
                                    <CampoNum label="Margen" value={margen} onChange={setMargen} sufijo="%" />
                                    <CampoNum label="IVA" value={iva} onChange={setIva} sufijo="%" />
                                </div>
                            </Bloque>
                        </div>

                        {/* Resultado */}
                        <div className="xl:sticky xl:top-24 space-y-3">
                            <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
                                <div className="grid grid-cols-2 gap-3">
                                    <Kpi t="Peso pieza terminada" v={kg(r.pesoNeto)} icono={Scale} fuerte />
                                    <Kpi t="Peso en bruto" v={kg(r.pesoBruto)} />
                                    <Kpi t="Viruta por pieza" v={kg(r.pesoViruta)} />
                                    <Kpi t="Aprovechamiento" v={`${r.aprovechamiento.toLocaleString('es-ES')} %`} c={r.aprovechamiento < 40 ? 'text-rose-600' : r.aprovechamiento < 65 ? 'text-amber-600' : 'text-emerald-600'} />
                                </div>
                                <div className="border-t pt-3 space-y-1.5 text-sm">
                                    <Fila t={`Material (${kg(r.kgMaterialLote)} × ${formatCurrency(precioEfectivo)})`} v={r.costeMaterialLote} />
                                    {r.abonoVirutaLote > 0 && <Fila t="Abono venta de viruta" v={-r.abonoVirutaLote} />}
                                    {r.desgloseOperaciones.map((o, i) => <Fila key={i} t={`${o.nombre} (${o.horas.toLocaleString('es-ES', { maximumFractionDigits: 2 })} h)`} v={o.coste} />)}
                                    {r.costeTratamientosLote > 0 && <Fila t="Tratamientos" v={r.costeTratamientosLote} />}
                                    {r.otrosLote > 0 && <Fila t="Otros" v={r.otrosLote} />}
                                    <Fila t="Coste del lote" v={r.costeLote} fuerte />
                                    <Fila t={`Margen ${margen}%`} v={r.beneficioLote} />
                                </div>
                                <div className="rounded-xl bg-primary/10 p-4">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-[11px] font-bold uppercase text-primary">Precio por pieza</p>
                                            <p className="text-3xl font-black tabular-nums text-foreground">{formatCurrency(r.precioUnidad)}</p>
                                            <p className="text-xs text-muted-foreground">coste {formatCurrency(r.costeUnidad)}/ud</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[11px] font-bold uppercase text-muted-foreground">{entrada.cantidad} ud (sin IVA)</p>
                                            <p className="text-xl font-black tabular-nums">{formatCurrency(r.precioLote)}</p>
                                            <p className="text-xs text-muted-foreground">con IVA {formatCurrency(totalConIva)}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {datos?.puedePresupuestar && <Button onClick={() => setDialogo('presupuesto')} className="font-bold"><FileText className="h-4 w-4 mr-1" /> Crear presupuesto</Button>}
                                    <Button variant="outline" onClick={() => guardar('catalogo')} disabled={guardando}><Package className="h-4 w-4 mr-1" /> Al catálogo</Button>
                                    <Button variant="outline" onClick={() => guardar('historial')} disabled={guardando}><Save className="h-4 w-4 mr-1" /> Guardar cálculo</Button>
                                    <Button variant="outline" onClick={() => { navigator.clipboard.writeText(`${descripcion} — ${entrada.cantidad} ud × ${formatCurrency(r.precioUnidad)}`); toast.success('Línea copiada') }}><Copy className="h-4 w-4 mr-1" /> Copiar línea</Button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">Línea: {descripcion}</p>
                            </div>

                            <div className="rounded-2xl border bg-card p-4">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Precio según cantidad (la preparación se reparte)</p>
                                <table className="w-full text-sm">
                                    <thead className="text-[11px] text-muted-foreground"><tr><th className="text-left">Cant.</th><th className="text-right">€/pieza</th><th className="text-right">Total</th></tr></thead>
                                    <tbody>
                                        {escalado.map(x => (
                                            <tr key={x.c} className={cn('border-t', x.c === entrada.cantidad && 'font-bold text-primary')}>
                                                <td className="py-1">{x.c}</td>
                                                <td className="text-right tabular-nums">{formatCurrency(x.r.precioUnidad)}</td>
                                                <td className="text-right tabular-nums">{formatCurrency(x.r.precioLote)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="precios" className="pt-4">
                    <PreciosYTarifas datos={datos} precioDe={precioDe} onCambio={cargar} />
                </TabsContent>

                <TabsContent value="historial" className="pt-4">
                    {(datos?.historial || []).length === 0 ? <p className="text-sm text-muted-foreground">Todavía no has guardado cálculos.</p> : (
                        <div className="rounded-2xl border bg-card divide-y">
                            {datos.historial.map((h: any) => (
                                <div key={h.id} className="p-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-bold truncate">{h.nombre}</p>
                                        <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })} · {h.cantidad} ud × {formatCurrency(Number(h.precio_unidad))}{h.presupuesto_id ? ' · con presupuesto' : ''}</p>
                                    </div>
                                    <Button size="sm" variant="outline" onClick={() => cargarDelHistorial(h)}>Cargar</Button>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            <Dialog open={dialogo === 'presupuesto'} onOpenChange={v => !v && setDialogo(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Crear presupuesto con esta pieza</DialogTitle>
                        <DialogDescription>Se crea en borrador; no se envía a nadie.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div><Label className="text-xs">Cliente</Label><div className="mt-1"><ClientCombobox value={clienteId} onChange={v => setClienteId(v)} /></div></div>
                        <div className="rounded-lg bg-muted p-3 text-sm">
                            <p className="font-semibold">{descripcion}</p>
                            <p className="mt-1">{entrada.cantidad} ud × {formatCurrency(r.precioUnidad)} = <b>{formatCurrency(r.precioLote)}</b> + IVA {iva}% = <b>{formatCurrency(totalConIva)}</b></p>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setDialogo(null)}>Cancelar</Button>
                            <Button onClick={() => guardar('presupuesto')} disabled={guardando || !clienteId}>{guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Crear presupuesto</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function Bloque({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border bg-card p-4 md:p-5 space-y-3">
            <h2 className="font-extrabold flex items-center gap-2"><span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{n}</span>{titulo}</h2>
            {children}
        </section>
    )
}

function Kpi({ t, v, c, fuerte, icono: I }: { t: string; v: string; c?: string; fuerte?: boolean; icono?: any }) {
    return (
        <div className={cn('rounded-xl p-3', fuerte ? 'bg-primary/10' : 'bg-muted/50')}>
            <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">{I && <I className="h-3 w-3" />}{t}</p>
            <p className={cn('font-black tabular-nums', fuerte ? 'text-xl' : 'text-lg', c)}>{v}</p>
        </div>
    )
}

function Fila({ t, v, fuerte }: { t: string; v: number; fuerte?: boolean }) {
    return <div className={cn('flex justify-between gap-2', fuerte && 'font-bold border-t pt-1.5')}><span className="text-muted-foreground truncate">{t}</span><span className="tabular-nums">{formatCurrency(v)}</span></div>
}

function MercadoHoy({ mercado, puedeEditar, onActualizado }: { mercado: any; puedeEditar: boolean; onActualizado: () => void }) {
    const [act, setAct] = useState(false)
    if (!mercado) return null
    const items = [
        { k: 'acero', t: 'Acero (bobina HRC)' },
        { k: 'aluminio', t: 'Aluminio' },
        { k: 'cobre', t: 'Cobre' },
        { k: 'zinc', t: 'Zinc' },
    ]
    return (
        <div className="rounded-2xl border bg-card p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
                    {items.map(i => {
                        const v = mercado.eurKg?.[i.k], varia = mercado.variacion?.[i.k]
                        return (
                            <div key={i.k} className="rounded-xl bg-muted/50 p-3">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground">{i.t} · hoy</p>
                                <p className="text-lg font-black tabular-nums">{v != null ? `${v.toLocaleString('es-ES', { maximumFractionDigits: 3 })} €/kg` : '—'}</p>
                                {varia != null && (
                                    <p className={cn('text-[11px] font-bold flex items-center gap-0.5', varia > 0 ? 'text-rose-600' : varia < 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                                        {varia > 0 ? <TrendingUp className="h-3 w-3" /> : varia < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                        {varia > 0 ? '+' : ''}{varia.toLocaleString('es-ES')} % vs 22/09/2026
                                    </p>
                                )}
                            </div>
                        )
                    })}
                </div>
                {puedeEditar && (
                    <Button variant="outline" disabled={act} onClick={async () => {
                        setAct(true)
                        const r = await actualizarPreciosConMercado()
                        setAct(false)
                        if (!r.success) return toast.error(r.error)
                        toast.success(r.cambios.length ? `Actualizados ${r.cambios.length} precios al mercado de hoy` : 'Tus precios ya estaban al día con el mercado')
                        onActualizado()
                    }}>
                        {act ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />} Actualizar mis precios con el mercado
                    </Button>
                )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
                Cotización de materia prima (COMEX/CME), no precio de almacén. Cambio USD→EUR {mercado.usdEur ? mercado.usdEur.toLocaleString('es-ES', { maximumFractionDigits: 4 }) : '—'} (BCE).
                {mercado.errores?.length ? ` Algunas fuentes no respondieron: se usan los últimos precios guardados.` : ''} Los precios por material se ajustan solo en la parte que depende del metal.
            </p>
        </div>
    )
}

function PreciosYTarifas({ datos, precioDe, onCambio }: { datos: any; precioDe: (m: Material) => { precio: number; origen: string; fecha: string | null }; onCambio: () => void }) {
    const extra: Material[] = datos?.config?.materiales_extra || []
    const [editando, setEditando] = useState<Record<string, string>>({})
    const [tarifas, setTarifas] = useState<Record<string, string>>(Object.fromEntries(MAQUINAS.map(m => [m.id, String(datos?.config?.tarifas?.[m.id] ?? m.tarifa)])))
    const p = datos?.config?.parametros || {}
    const [param, setParam] = useState<Record<string, string>>({ margen: String(p.margen ?? 30), kerf: String(p.kerf ?? 3), largoBarra: String(p.largoBarra ?? 0), sobremedidaSeccion: String(p.sobremedidaSeccion ?? 3), sobremedidaLargo: String(p.sobremedidaLargo ?? 5) })
    const [nuevo, setNuevo] = useState({ nombre: '', densidad: '', precioKg: '', maquinabilidad: '1', viruta: '0' })
    const [q, setQ] = useState('')
    const lista = [...MATERIALES, ...extra].filter(m => !q || m.nombre.toLowerCase().includes(q.toLowerCase()) || m.norma.toLowerCase().includes(q.toLowerCase()))

    return (
        <div className="grid xl:grid-cols-[1fr_380px] gap-5 items-start">
            <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="p-3 border-b flex items-center justify-between gap-2">
                    <p className="font-extrabold">Precios de materiales (€/kg, sin IVA)</p>
                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar material o norma…" className="max-w-xs" />
                </div>
                <div className="max-h-[640px] overflow-y-auto divide-y">
                    {lista.map(m => {
                        const pr = precioDe(m)
                        return (
                            <div key={m.id} className="p-3 grid grid-cols-[1fr_auto] md:grid-cols-[1fr_110px_150px_auto] gap-2 items-center">
                                <div className="min-w-0">
                                    <p className="font-semibold text-sm truncate">{m.nombre}</p>
                                    <p className="text-[11px] text-muted-foreground">{m.norma} · {m.densidad} g/cm³{m.indice ? ` · sigue ${m.indice}` : ''}</p>
                                </div>
                                <p className="text-xs text-muted-foreground hidden md:block">Orient. {formatCurrency(m.precioKg)}</p>
                                <div className="flex items-center gap-1">
                                    <Input inputMode="decimal" className="h-8 w-24 tabular-nums" value={editando[m.id] ?? pr.precio.toFixed(2)} onChange={e => setEditando({ ...editando, [m.id]: e.target.value })} />
                                    <span className={cn('text-[10px] font-bold', pr.origen === 'propio' ? 'text-emerald-600' : 'text-muted-foreground')}>{pr.origen === 'propio' ? 'TUYO' : pr.origen === 'mercado' ? 'MERC.' : ''}</span>
                                </div>
                                <div className="flex gap-1 col-span-2 md:col-span-1 justify-end">
                                    {editando[m.id] !== undefined && <Button size="sm" onClick={async () => { const r = await guardarPrecioMaterial(m.id, num(editando[m.id])); if (r.success) { toast.success('Precio guardado'); const e = { ...editando }; delete e[m.id]; setEditando(e); onCambio() } else toast.error(r.error) }}>Guardar</Button>}
                                    {pr.origen === 'propio' && <Button size="sm" variant="ghost" onClick={async () => { await restablecerPrecioMaterial(m.id); onCambio() }}>Restablecer</Button>}
                                    {extra.includes(m) && <Button size="icon" variant="ghost" onClick={async () => { await eliminarMaterialPropio(m.id); onCambio() }} aria-label="Eliminar"><Trash2 className="h-4 w-4" /></Button>}
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div className="p-3 border-t space-y-2 bg-muted/30">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Añadir material propio</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <Input className="col-span-2" placeholder="Nombre (p. ej. Acero Hardox 400)" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
                        <Input inputMode="decimal" placeholder="Densidad g/cm³" value={nuevo.densidad} onChange={e => setNuevo({ ...nuevo, densidad: e.target.value })} />
                        <Input inputMode="decimal" placeholder="Precio €/kg" value={nuevo.precioKg} onChange={e => setNuevo({ ...nuevo, precioKg: e.target.value })} />
                        <Input inputMode="decimal" placeholder="Maquinabilidad (C45=1)" value={nuevo.maquinabilidad} onChange={e => setNuevo({ ...nuevo, maquinabilidad: e.target.value })} />
                    </div>
                    <Button size="sm" onClick={async () => {
                        const r = await guardarMaterialPropio({ id: '', nombre: nuevo.nombre, norma: 'Material propio', familia: 'Aceros al carbono', densidad: num(nuevo.densidad), precioKg: num(nuevo.precioKg), indice: null, sensibilidad: 0, maquinabilidad: num(nuevo.maquinabilidad) || 1, viruta: num(nuevo.viruta) })
                        if (!r.success) return toast.error(r.error)
                        toast.success('Material añadido'); setNuevo({ nombre: '', densidad: '', precioKg: '', maquinabilidad: '1', viruta: '0' }); onCambio()
                    }}><Plus className="h-4 w-4 mr-1" /> Añadir material</Button>
                </div>
            </div>

            <div className="space-y-4">
                <div className="rounded-2xl border bg-card p-4 space-y-2">
                    <p className="font-extrabold">Tarifas de tus máquinas (€/hora)</p>
                    {MAQUINAS.map(m => (
                        <div key={m.id} className="flex items-center justify-between gap-2">
                            <span className="text-sm">{m.nombre}</span>
                            <Input inputMode="decimal" className="h-8 w-24 tabular-nums" value={tarifas[m.id]} onChange={e => setTarifas({ ...tarifas, [m.id]: e.target.value })} />
                        </div>
                    ))}
                </div>
                <div className="rounded-2xl border bg-card p-4 space-y-2">
                    <p className="font-extrabold">Valores por defecto</p>
                    {[['margen', 'Margen (%)'], ['kerf', 'Ancho de corte sierra (mm)'], ['sobremedidaSeccion', 'Creces en sección (mm)'], ['sobremedidaLargo', 'Creces en largo (mm)'], ['largoBarra', 'Compra por barra (mm, 0 = a medida)']].map(([k, t]) => (
                        <div key={k} className="flex items-center justify-between gap-2">
                            <span className="text-sm">{t}</span>
                            <Input inputMode="decimal" className="h-8 w-24 tabular-nums" value={param[k]} onChange={e => setParam({ ...param, [k]: e.target.value })} />
                        </div>
                    ))}
                </div>
                <Button className="w-full" onClick={async () => {
                    const r = await guardarTarifasYParametros(Object.fromEntries(Object.entries(tarifas).map(([k, v]) => [k, num(v)])), Object.fromEntries(Object.entries(param).map(([k, v]) => [k, num(v)])))
                    if (!r.success) return toast.error(r.error)
                    toast.success('Tarifas y valores guardados'); onCambio()
                }}><Save className="h-4 w-4 mr-1" /> Guardar tarifas y valores</Button>
                <p className="text-[11px] text-muted-foreground">Los precios orientativos son de almacén en España (septiembre 2026). Pon los de tu proveedor: quedan guardados solo para tu empresa y se pueden actualizar con el mercado cuando quieras.</p>
            </div>
        </div>
    )
}

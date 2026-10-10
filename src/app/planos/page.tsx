'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanLine, Upload, Loader2, AlertTriangle, Calculator, FileText, Plus, Trash2, Settings2, CircleHelp, Cpu, Wrench, Boxes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ClientCombobox } from '@/components/contacts/client-combobox'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { prepararImagen } from '@/lib/imagen-cliente'
import { MATERIALES, TRATAMIENTOS, INDICES_REFERENCIA, precioConMercado, materialPorId, type Material } from '@/lib/calculadora/materiales'
import { FORMAS, formaPorId, volumenCm3, pesoKg, medidasTexto, type FormaId } from '@/lib/calculadora/calculo'
import { TARIFAS_CALDERIA_DEFECTO, precioConjunto, m2Chapas, perimetroChapas, type LecturaPlano, type ElementoConjunto, type ProcesosConjunto, type TarifasCalderia } from '@/lib/planos/tipos'
import { getCalculadora, guardarTarifasYParametros } from '@/actions/calculadora'
import { leerPlano, buscarEnCatalogo, type CoincidenciaCatalogo } from '@/actions/planos'
import { createDocument } from '@/actions/documents'

const num = (v: unknown) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0 }
const MODOS = [
    { id: 'auto', t: 'Detectar solo', d: 'La IA decide qué es' },
    { id: 'pieza', t: 'Pieza mecanizada', d: 'Plano de eje, brida, casquillo…' },
    { id: 'conjunto', t: 'Calderería / inox', d: 'Mesa, bastidor, soporte…' },
    { id: 'esquema', t: 'Esquema', d: 'Eléctrico, neumático, hidráulico' },
] as const
const FORMAS_CONJUNTO = FORMAS.filter(f => !['volumen', 'peso', 'esfera'].includes(f.id))

export default function PlanosPage() {
    const router = useRouter()
    const [archivo, setArchivo] = useState<File | null>(null)
    const [vista, setVista] = useState<string | null>(null)
    const [modo, setModo] = useState<string>('auto')
    const [nota, setNota] = useState('')
    const [leyendo, setLeyendo] = useState(false)
    const [lectura, setLectura] = useState<LecturaPlano | null>(null)
    const [catalogo, setCatalogo] = useState<Record<number, CoincidenciaCatalogo[]>>({})
    const [calc, setCalc] = useState<any>(null)
    const input = useRef<HTMLInputElement>(null)

    useEffect(() => { getCalculadora().then(r => r.success ? setCalc(r) : toast.error(r.error)) }, [])

    const extra: Material[] = useMemo(() => calc?.config?.materiales_extra || [], [calc])
    const precioKgDe = useCallback((id: string | null) => {
        const m = id ? materialPorId(id, extra) : null
        if (!m) return 0
        const propio = calc?.config?.precios?.[m.id]
        if (propio?.precioKg) return Number(propio.precioKg)
        return precioConMercado(m.precioKg, m.indice, m.sensibilidad, calc?.mercado?.cotizaciones || {}, INDICES_REFERENCIA)
    }, [calc, extra])

    const elegir = (f: File | null | undefined) => {
        if (!f) return
        setArchivo(f); setLectura(null)
        setVista(f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
    }

    const leer = async () => {
        if (!archivo) return toast.error('Sube primero el plano, la foto o el esquema.')
        setLeyendo(true)
        try {
            let subir: Blob = archivo, tipo = archivo.type, nombre = archivo.name
            // Fotos: se reducen en el navegador manteniendo resolución suficiente para leer cotas
            if (archivo.type.startsWith('image/') && archivo.size > 1.5 * 1024 * 1024) {
                const p = await prepararImagen(archivo, 2400, { soloJpeg: true })
                subir = p.blob; tipo = p.tipo; nombre = nombre.replace(/\.\w+$/, '.jpg')
            }
            const fd = new FormData()
            fd.append('archivo', new File([subir], nombre, { type: tipo }))
            fd.append('modo', modo); fd.append('nota', nota)
            const r = await leerPlano(fd)
            if (!r.success) return toast.error(r.error)
            setLectura(r.lectura); setCatalogo(r.catalogo)
            if (!r.lectura.legible) toast.warning('La imagen no se lee bien: revisa lo que falta.')
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo leer el plano')
        } finally {
            setLeyendo(false)
        }
    }

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2"><ScanLine className="h-7 w-7 text-primary" /> Presupuesto desde plano</h1>
                <p className="text-muted-foreground mt-1">Sube el plano, una foto con medidas o el esquema. La IA lee lo que hay dibujado y el ERP calcula con <b>tus</b> precios y tarifas. Lo que no se vea, te lo pregunta: no se inventa nada.</p>
            </div>

            <div className="grid lg:grid-cols-[380px_1fr] gap-5 items-start">
                <div className="rounded-2xl border bg-card p-4 space-y-4">
                    <div
                        className="rounded-xl border-2 border-dashed p-5 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => input.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); elegir(e.dataTransfer.files?.[0]) }}
                    >
                        {vista ? <img src={vista} alt="Plano subido" className="mx-auto max-h-56 rounded-md object-contain" /> : <Upload className="mx-auto h-8 w-8 text-muted-foreground" />}
                        <p className="mt-2 text-sm font-semibold">{archivo ? archivo.name : 'Arrastra aquí o pulsa para elegir'}</p>
                        <p className="text-xs text-muted-foreground">Foto, captura o PDF (hasta 4 MB)</p>
                        <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => elegir(e.target.files?.[0])} />
                    </div>
                    <div>
                        <Label className="text-xs text-muted-foreground">Qué es</Label>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                            {MODOS.map(m => (
                                <button key={m.id} type="button" onClick={() => setModo(m.id)} className={cn('rounded-lg border p-2 text-left transition-colors', modo === m.id ? 'border-primary bg-primary/10' : 'hover:bg-muted')}>
                                    <span className="block text-sm font-bold">{m.t}</span>
                                    <span className="block text-[11px] text-muted-foreground">{m.d}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs text-muted-foreground">Indicaciones (opcional)</Label>
                        <Textarea value={nota} onChange={e => setNota(e.target.value)} className="mt-1 h-20" placeholder="Ej.: 10 unidades, en inox 304, acabado satinado" />
                    </div>
                    <Button className="w-full" onClick={leer} disabled={leyendo || !archivo}>
                        {leyendo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Leyendo el plano…</> : <><ScanLine className="h-4 w-4 mr-2" /> Leer y presupuestar</>}
                    </Button>
                </div>

                <div className="space-y-4 min-w-0">
                    {!lectura && !leyendo && (
                        <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                            <div className="flex justify-center gap-6 mb-3"><Wrench className="h-6 w-6" /><Boxes className="h-6 w-6" /><Cpu className="h-6 w-6" /></div>
                            <p className="text-sm"><b>Pieza mecanizada</b>: se abre en la calculadora con material y medidas. <b>Calderería / inox</b>: despiece con kg, corte, plegado, soldadura y acabado. <b>Esquema</b>: lista de componentes con los precios de tu catálogo.</p>
                        </div>
                    )}
                    {lectura && lectura.faltan?.length > 0 && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4">
                            <p className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2"><CircleHelp className="h-4 w-4" /> Falta información en el plano</p>
                            <ul className="mt-1 list-disc pl-5 text-sm text-amber-900 dark:text-amber-200">{lectura.faltan.map((f, i) => <li key={i}>{f}</li>)}</ul>
                            <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">Complétalo abajo o escríbelo en «Indicaciones» y vuelve a leer.</p>
                        </div>
                    )}
                    {lectura?.modo === 'pieza' && lectura.pieza && <ResultadoPieza lectura={lectura} onAbrir={(datos) => { sessionStorage.setItem('calc_desde_plano', JSON.stringify(datos)); router.push('/calculadora') }} extra={extra} />}
                    {lectura?.modo === 'conjunto' && lectura.conjunto && calc && <ResultadoConjunto key={JSON.stringify(lectura.conjunto).length} lectura={lectura} extra={extra} precioKgDe={precioKgDe} calc={calc} onTarifas={() => getCalculadora().then(r => r.success && setCalc(r))} />}
                    {lectura?.modo === 'esquema' && lectura.esquema && <ResultadoEsquema lectura={lectura} catalogo={catalogo} />}
                </div>
            </div>
        </div>
    )
}

// ───────────────────────────── Pieza mecanizada ─────────────────────────────

function ResultadoPieza({ lectura, onAbrir, extra }: { lectura: LecturaPlano; onAbrir: (d: any) => void; extra: Material[] }) {
    const p = lectura.pieza!
    const [materialId, setMaterialId] = useState(p.material_id || '')
    const [forma, setForma] = useState<FormaId>(p.forma || 'redonda')
    const [medidas, setMedidas] = useState<Record<string, string>>(Object.fromEntries(Object.entries(p.medidas || {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])))
    const [cantidad, setCantidad] = useState(String(p.cantidad ?? ''))
    const f = formaPorId(forma)
    const faltaAlgo = !materialId || !cantidad || f.campos.some(c => !num(medidas[c.key]))
    const tratamientos = TRATAMIENTOS.filter(t => p.tratamientos.some(x => x.toLowerCase().includes(t.nombre.split(' ')[0].toLowerCase())))

    return (
        <div className="rounded-2xl border bg-card p-4 space-y-4">
            <h2 className="font-black text-lg flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /> {p.nombre || 'Pieza'}</h2>
            <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Material {p.material_texto ? <span>(en el plano: «{p.material_texto}»)</span> : null}</Label>
                    <SelectorMaterial value={materialId} onChange={setMaterialId} extra={extra} />
                </div>
                <div><Label className="text-xs text-muted-foreground">Cantidad</Label><Input className={cn('mt-1', !cantidad && 'border-amber-400')} value={cantidad} onChange={e => setCantidad(e.target.value)} inputMode="numeric" /></div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
                <div>
                    <Label className="text-xs text-muted-foreground">Forma del material en bruto</Label>
                    <select className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={forma} onChange={e => setForma(e.target.value as FormaId)}>
                        {FORMAS.filter(x => x.id !== 'peso').map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                    </select>
                </div>
                {f.campos.map(c => (
                    <div key={c.key}><Label className="text-xs text-muted-foreground">{c.label} (mm)</Label><Input className={cn('mt-1', !num(medidas[c.key]) && 'border-amber-400')} value={medidas[c.key] ?? ''} onChange={e => setMedidas(m => ({ ...m, [c.key]: e.target.value }))} inputMode="decimal" /></div>
                ))}
            </div>
            <ListaInfo titulo="Tolerancias y ajustes" items={p.tolerancias} />
            <ListaInfo titulo="Tratamientos" items={p.tratamientos} />
            <ListaInfo titulo="Taladros" items={p.taladros.map(t => `${t.n} × Ø${t.d} · prof. ${t.prof} mm`)} />
            <ListaInfo titulo="Notas del plano" items={[...(p.acabado ? [`Acabado: ${p.acabado}`] : []), ...p.notas]} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <p className="text-xs text-muted-foreground max-w-md">En la calculadora se aplican tus precios de material, tus tarifas de máquina y tu margen. Revisa las operaciones y los tiempos antes de presupuestar.</p>
                <Button disabled={faltaAlgo} onClick={() => onAbrir({
                    nombre: p.nombre || 'Pieza',
                    entrada: {
                        materialId, forma, final: Object.fromEntries(f.campos.map(c => [c.key, num(medidas[c.key])])),
                        cantidad: Math.max(1, Math.round(num(cantidad))), taladros: p.taladros,
                        tratamientos: tratamientos.map(t => ({ ...t })),
                    },
                    notas: [...p.tolerancias, ...p.notas],
                })}><Calculator className="h-4 w-4 mr-2" /> Abrir en la calculadora</Button>
            </div>
            {faltaAlgo && <p className="text-xs text-amber-700 dark:text-amber-300">Completa el material, la cantidad y las medidas marcadas para continuar.</p>}
        </div>
    )
}

// ──────────────────────────── Calderería / inox ─────────────────────────────

function ResultadoConjunto({ lectura, extra, precioKgDe, calc, onTarifas }: { lectura: LecturaPlano; extra: Material[]; precioKgDe: (id: string | null) => number; calc: any; onTarifas: () => void }) {
    const c = lectura.conjunto!
    const [nombre, setNombre] = useState(c.nombre || 'Conjunto')
    const [cantidad, setCantidad] = useState(String(c.cantidad ?? 1))
    const [elementos, setElementos] = useState<(ElementoConjunto & { _id: string })[]>(c.elementos.map((e, i) => ({ ...e, material_id: e.material_id || c.material_id, _id: String(i) })))
    const [procesos, setProcesos] = useState<ProcesosConjunto>(c.procesos)
    const [verTarifas, setVerTarifas] = useState(false)
    const [clienteId, setClienteId] = useState('')
    const [creando, setCreando] = useState(false)
    const tarifas: TarifasCalderia = { ...TARIFAS_CALDERIA_DEFECTO, ...(calc?.config?.parametros?.calderia || {}) }

    const filas = elementos.map(e => {
        const m = e.material_id ? materialPorId(e.material_id, extra) : null
        const med = Object.fromEntries(Object.entries(e.medidas).map(([k, v]) => [k, num(v)]))
        const completo = !!m && formaPorId(e.forma).campos.every(x => num(e.medidas[x.key]) > 0)
        const kgUnidad = completo ? pesoKg(volumenCm3(e.forma, med, m!.densidad), m!.densidad) : 0
        return { e, m, kgUnidad, precioKg: precioKgDe(e.material_id), completo }
    })
    const r = precioConjunto(filas.map(x => ({ nombre: x.e.nombre, cantidad: x.e.cantidad, kgUnidad: x.kgUnidad, precioKg: x.precioKg, espesorMm: num(x.e.medidas.E) || null })), procesos, tarifas, num(cantidad))
    const incompletos = [...filas.filter(x => !x.completo).map(x => `${x.e.nombre || 'Elemento'}: ${!x.m ? 'falta el material' : 'faltan medidas'}`), ...r.incompletos.filter(t => !t.includes('faltan medidas'))]

    const setEl = (id: string, cambios: Partial<ElementoConjunto>) => setElementos(l => l.map(x => x._id === id ? { ...x, ...cambios } : x))
    const setMed = (id: string, k: string, v: string) => setElementos(l => l.map(x => x._id === id ? { ...x, medidas: { ...x.medidas, [k]: v === '' ? null : num(v) } } : x))
    const setPro = (k: keyof ProcesosConjunto, v: any) => setProcesos(p => ({ ...p, [k]: v }))

    const descripcion = [
        nombre,
        ...filas.map(x => `- ${x.e.cantidad} × ${x.e.nombre}: ${formaPorId(x.e.forma).nombre.toLowerCase()} ${medidasTexto(x.e.forma, Object.fromEntries(Object.entries(x.e.medidas).map(([k, v]) => [k, num(v)])))}${x.m ? ` · ${x.m.nombre}` : ''}`),
        ...(procesos.soldadura_metros ? [`Soldadura ${procesos.soldadura_tipo || 'TIG'}`] : []),
        ...(procesos.acabado && procesos.acabado !== 'ninguno' ? [`Acabado: ${procesos.acabado}`] : []),
        `Peso aprox.: ${r.kgTotal.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg/ud`,
    ].join('\n')

    const crear = async () => {
        if (!clienteId) return toast.error('Elige el cliente.')
        if (incompletos.length) return toast.error('Completa antes los datos que faltan.')
        setCreando(true)
        const res = await createDocument({ cliente_id: clienteId, ...(await datosCliente(clienteId)), fecha: new Date(), lineas: [{ descripcion, cantidad: r.cantidad, precio_unitario: r.precioUnidad }], iva_porcentaje: 21, estado: 'borrador', observaciones: 'Presupuesto calculado desde plano. Precios según tarifas vigentes del taller.' }, 'presupuesto')
        setCreando(false)
        if (!res.success) return toast.error((res.error as any)?.message || 'No se pudo crear')
        toast.success(`Presupuesto ${res.data.numero} creado en borrador`, { action: { label: 'Ver', onClick: () => (window.location.href = '/presupuestos') } })
    }

    return (
        <div className="rounded-2xl border bg-card p-4 space-y-4">
            <div className="grid sm:grid-cols-[1fr_120px] gap-3">
                <div><Label className="text-xs text-muted-foreground">Qué se fabrica</Label><Input className="mt-1 font-bold" value={nombre} onChange={e => setNombre(e.target.value)} /></div>
                <div><Label className="text-xs text-muted-foreground">Unidades</Label><Input className="mt-1" value={cantidad} onChange={e => setCantidad(e.target.value)} inputMode="numeric" /></div>
            </div>

            <div className="space-y-2">
                <p className="text-sm font-bold">Despiece</p>
                {filas.map(({ e, kgUnidad, precioKg, completo }) => (
                    <div key={e._id} className={cn('rounded-xl border p-3 space-y-2', !completo && 'border-amber-300')}>
                        <div className="grid sm:grid-cols-[1fr_190px_220px_80px_36px] gap-2 items-end">
                            <div><Label className="text-[11px] text-muted-foreground">Elemento</Label><Input value={e.nombre} onChange={x => setEl(e._id, { nombre: x.target.value })} /></div>
                            <div>
                                <Label className="text-[11px] text-muted-foreground">Forma</Label>
                                <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={e.forma} onChange={x => setEl(e._id, { forma: x.target.value as FormaId })}>
                                    {FORMAS_CONJUNTO.map(fm => <option key={fm.id} value={fm.id}>{fm.nombre}</option>)}
                                </select>
                            </div>
                            <div><Label className="text-[11px] text-muted-foreground">Material</Label><SelectorMaterial value={e.material_id || ''} onChange={v => setEl(e._id, { material_id: v })} extra={extra} /></div>
                            <div><Label className="text-[11px] text-muted-foreground">Cant.</Label><Input value={e.cantidad} onChange={x => setEl(e._id, { cantidad: num(x.target.value) })} inputMode="numeric" /></div>
                            <Button variant="ghost" size="icon" aria-label="Quitar elemento" onClick={() => setElementos(l => l.filter(x => x._id !== e._id))}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-2 items-end">
                            {formaPorId(e.forma).campos.map(cp => (
                                <div key={cp.key} className="w-28"><Label className="text-[11px] text-muted-foreground">{cp.label}</Label><Input className={cn(!num(e.medidas[cp.key]) && 'border-amber-400')} value={e.medidas[cp.key] ?? ''} onChange={x => setMed(e._id, cp.key, x.target.value)} inputMode="decimal" /></div>
                            ))}
                            <div className="text-xs text-muted-foreground ml-auto text-right">
                                {e.origen === 'deducido' && <span className="block text-amber-700 dark:text-amber-300">Medida deducida{e.nota ? `: ${e.nota}` : ''}</span>}
                                {completo ? <span>{(kgUnidad * e.cantidad).toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg · {formatCurrency(precioKg)}/kg</span> : <span className="text-amber-700 dark:text-amber-300">Faltan datos</span>}
                            </div>
                        </div>
                    </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setElementos(l => [...l, { _id: Math.random().toString(36).slice(2), nombre: 'Nuevo elemento', forma: 'chapa', material_id: c.material_id, medidas: {}, cantidad: 1, origen: 'texto', nota: null }])}><Plus className="h-4 w-4 mr-1" /> Añadir elemento</Button>
            </div>

            <div className="space-y-2">
                <p className="text-sm font-bold">Procesos</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <CampoP label="Corte (m)" v={procesos.corte_metros} on={v => setPro('corte_metros', v)} sugerencia={perimetroChapas(elementos)} />
                    <CampoP label="Perforaciones" v={procesos.perforaciones} on={v => setPro('perforaciones', v)} />
                    <CampoP label="Plegados" v={procesos.plegados} on={v => setPro('plegados', v)} />
                    <CampoP label="Soldadura (m)" v={procesos.soldadura_metros} on={v => setPro('soldadura_metros', v)} />
                    <div>
                        <Label className="text-[11px] text-muted-foreground">Tipo de soldadura</Label>
                        <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={procesos.soldadura_tipo || 'TIG'} onChange={e => setPro('soldadura_tipo', e.target.value)}><option>TIG</option><option>MIG</option></select>
                    </div>
                    <div>
                        <Label className="text-[11px] text-muted-foreground">Acabado</Label>
                        <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={procesos.acabado || 'ninguno'} onChange={e => setPro('acabado', e.target.value)}>
                            {['ninguno', 'satinado', 'pulido', 'pintura', 'galvanizado'].map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <CampoP label="Superficie acabado (m²)" v={procesos.acabado_m2} on={v => setPro('acabado_m2', v)} sugerencia={m2Chapas(elementos)} />
                    <CampoP label="Montaje (h)" v={procesos.montaje_horas} on={v => setPro('montaje_horas', v)} />
                </div>
                <p className="text-[11px] text-muted-foreground">«Usar» rellena con una aproximación a partir de las chapas (perímetro y una cara); corrígela si hace falta.</p>
            </div>

            <div className="grid md:grid-cols-[1fr_320px] gap-4 items-start border-t pt-4">
                <div className="space-y-1 text-sm">
                    {r.lineas.map((l, i) => <div key={i} className="flex justify-between gap-3"><span>{l.concepto} <span className="text-xs text-muted-foreground">{l.detalle}</span></span><span className="tabular-nums font-semibold">{formatCurrency(l.importe)}</span></div>)}
                    <div className="flex justify-between border-t pt-1 font-bold"><span>Coste por unidad</span><span className="tabular-nums">{formatCurrency(r.costeUnidad)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Margen {tarifas.margen}% sobre coste</span><span className="tabular-nums">{formatCurrency(r.precioUnidad - r.costeUnidad)}</span></div>
                    <button type="button" className="text-xs text-primary inline-flex items-center gap-1 mt-2" onClick={() => setVerTarifas(v => !v)}><Settings2 className="h-3 w-3" /> {verTarifas ? 'Ocultar' : 'Ver y cambiar'} mis tarifas de calderería</button>
                    {verTarifas && <EditorTarifas calc={calc} tarifas={tarifas} onGuardado={onTarifas} />}
                </div>
                <div className="rounded-xl bg-primary/10 p-4 space-y-3">
                    <div>
                        <p className="text-[11px] font-bold uppercase text-primary">Precio por unidad (sin IVA)</p>
                        <p className="text-3xl font-black tabular-nums">{formatCurrency(r.precioUnidad)}</p>
                        <p className="text-xs text-muted-foreground">{r.cantidad} ud · total {formatCurrency(r.precioLote)} · {r.kgTotal.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg/ud</p>
                    </div>
                    {incompletos.length > 0 && <div className="text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="inline h-3 w-3 mr-1" />{incompletos.join(' · ')}</div>}
                    <div><Label className="text-xs">Cliente</Label><div className="mt-1"><ClientCombobox value={clienteId} onChange={setClienteId} /></div></div>
                    <Button className="w-full" disabled={creando || incompletos.length > 0} onClick={crear}>{creando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />} Crear presupuesto</Button>
                </div>
            </div>
        </div>
    )
}

function CampoP({ label, v, on, sugerencia }: { label: string; v: number | null; on: (v: number | null) => void; sugerencia?: number }) {
    return (
        <div>
            <Label className="text-[11px] text-muted-foreground flex justify-between">{label}{sugerencia ? <button type="button" className="text-primary" onClick={() => on(sugerencia)}>Usar {sugerencia.toLocaleString('es-ES')}</button> : null}</Label>
            <Input value={v ?? ''} onChange={e => on(e.target.value === '' ? null : num(e.target.value))} inputMode="decimal" />
        </div>
    )
}

function EditorTarifas({ calc, tarifas, onGuardado }: { calc: any; tarifas: TarifasCalderia; onGuardado: () => void }) {
    const [t, setT] = useState<TarifasCalderia>(tarifas)
    const [guardando, setGuardando] = useState(false)
    const campos: [keyof TarifasCalderia, string][] = [['plegado', '€ por pliegue'], ['perforacion', '€ por perforación'], ['soldaduraTIG', 'TIG €/m'], ['soldaduraMIG', 'MIG €/m'], ['pulidoM2', 'Pulido/satinado €/m²'], ['pinturaM2', 'Pintura €/m²'], ['galvanizadoKg', 'Galvanizado €/kg'], ['montajeHora', 'Montaje €/h'], ['margen', 'Margen % sobre coste']]
    const guardar = async () => {
        setGuardando(true)
        const r = await guardarTarifasYParametros(calc?.config?.tarifas || {}, { ...(calc?.config?.parametros || {}), calderia: t })
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        toast.success('Tarifas de calderería guardadas'); onGuardado()
    }
    return (
        <div className="mt-2 rounded-xl border p-3 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {campos.map(([k, l]) => <div key={k}><Label className="text-[11px] text-muted-foreground">{l}</Label><Input value={String(t[k])} onChange={e => setT({ ...t, [k]: num(e.target.value) })} inputMode="decimal" /></div>)}
            </div>
            <p className="text-[11px] font-semibold">Corte (láser / plasma) por espesor</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {t.corte.map((c, i) => <div key={i}><Label className="text-[11px] text-muted-foreground">≤ {c.hastaMm >= 999 ? 'más' : `${c.hastaMm} mm`} €/m</Label><Input value={String(c.eurM)} onChange={e => setT({ ...t, corte: t.corte.map((x, j) => j === i ? { ...x, eurM: num(e.target.value) } : x) })} inputMode="decimal" /></div>)}
            </div>
            <Button size="sm" onClick={guardar} disabled={guardando || calc?.puedeEditar === false}>{guardando ? 'Guardando…' : 'Guardar tarifas'}</Button>
        </div>
    )
}

// ───────────────────────────────── Esquemas ─────────────────────────────────

function ResultadoEsquema({ lectura, catalogo }: { lectura: LecturaPlano; catalogo: Record<number, CoincidenciaCatalogo[]> }) {
    const e = lectura.esquema!
    const [filas, setFilas] = useState(() => e.componentes.map((c, i) => {
        const m = catalogo[i]?.[0]
        return { ...c, incluir: true, articulo: m || null, precio: m ? String(m.precio_venta) : '', opciones: catalogo[i] || [] }
    }))
    const [clienteId, setClienteId] = useState('')
    const [creando, setCreando] = useState(false)
    const set = (i: number, cambios: any) => setFilas(l => l.map((x, j) => j === i ? { ...x, ...cambios } : x))
    const incluidas = filas.filter(f => f.incluir)
    const sinPrecio = incluidas.filter(f => !(num(f.precio) > 0))
    const base = incluidas.reduce((a, f) => a + num(f.precio) * num(f.cantidad), 0)

    const buscar = async (i: number, texto: string) => {
        const r = await buscarEnCatalogo(texto)
        set(i, { opciones: r })
        if (!r.length) toast.info('No hay nada parecido en el catálogo')
    }
    const crear = async () => {
        if (!clienteId) return toast.error('Elige el cliente.')
        if (sinPrecio.length) return toast.error(`Hay ${sinPrecio.length} componente(s) sin precio: pon el precio o desmárcalos.`)
        setCreando(true)
        const lineas = incluidas.map(f => ({ descripcion: [f.articulo ? `${f.articulo.nombre}${f.articulo.referencia ? ` (${f.articulo.referencia})` : ''}` : f.descripcion, [f.caracteristicas, f.designacion ? `Ref. esquema: ${f.designacion}` : ''].filter(Boolean).join(' · ')].filter(Boolean).join('\n'), cantidad: num(f.cantidad), precio_unitario: num(f.precio) }))
        const res = await createDocument({ cliente_id: clienteId, ...(await datosCliente(clienteId)), fecha: new Date(), lineas, iva_porcentaje: 21, estado: 'borrador', observaciones: `Materiales según esquema: ${e.titulo || 'sin título'}. Cantidades leídas del esquema; revisar antes de enviar.` }, 'presupuesto')
        setCreando(false)
        if (!res.success) return toast.error((res.error as any)?.message || 'No se pudo crear')
        toast.success(`Presupuesto ${res.data.numero} creado en borrador`, { action: { label: 'Ver', onClick: () => (window.location.href = '/presupuestos') } })
    }

    return (
        <div className="rounded-2xl border bg-card p-4 space-y-4">
            <h2 className="font-black text-lg flex items-center gap-2"><Cpu className="h-5 w-5 text-primary" /> {e.titulo || 'Esquema'} <span className="text-xs font-semibold text-muted-foreground">({e.tipo_esquema})</span></h2>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead><tr className="text-left text-[11px] uppercase text-muted-foreground"><th className="p-2"></th><th className="p-2">Componente</th><th className="p-2 w-20">Cant.</th><th className="p-2 min-w-[220px]">Artículo de tu catálogo</th><th className="p-2 w-28">Precio ud.</th><th className="p-2 text-right">Importe</th></tr></thead>
                    <tbody>
                        {filas.map((f, i) => (
                            <tr key={i} className={cn('border-t align-top', !f.incluir && 'opacity-50')}>
                                <td className="p-2"><input type="checkbox" checked={f.incluir} onChange={x => set(i, { incluir: x.target.checked })} aria-label="Incluir en el presupuesto" /></td>
                                <td className="p-2">
                                    <p className="font-semibold">{f.descripcion}</p>
                                    <p className="text-xs text-muted-foreground">{[f.designacion, f.caracteristicas, f.marca_ref].filter(Boolean).join(' · ')}</p>
                                    {f.confianza !== 'alta' && <p className={cn('text-[11px] font-semibold', f.confianza === 'baja' ? 'text-rose-600' : 'text-amber-600')}>Lectura {f.confianza === 'baja' ? 'dudosa: compruébalo en el esquema' : 'media'}</p>}
                                </td>
                                <td className="p-2"><Input value={f.cantidad} onChange={x => set(i, { cantidad: num(x.target.value) })} inputMode="numeric" /></td>
                                <td className="p-2">
                                    <select className="h-9 w-full rounded-md border bg-background px-2 text-xs" value={f.articulo?.id || ''} onChange={x => { const a = f.opciones.find(o => o.id === x.target.value) || null; set(i, { articulo: a, precio: a ? String(a.precio_venta) : '' }) }}>
                                        <option value="">— Sin artículo (sin precio) —</option>
                                        {f.opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}{o.referencia ? ` · ${o.referencia}` : ''} · {formatCurrency(o.precio_venta)}</option>)}
                                    </select>
                                    <button type="button" className="mt-1 text-[11px] text-primary" onClick={() => { const t = prompt('Buscar en el catálogo:', f.descripcion); if (t) buscar(i, t) }}>Buscar otro en el catálogo</button>
                                </td>
                                <td className="p-2"><Input className={cn(f.incluir && !(num(f.precio) > 0) && 'border-amber-400')} value={f.precio} onChange={x => set(i, { precio: x.target.value })} inputMode="decimal" placeholder="Sin precio" /></td>
                                <td className="p-2 text-right tabular-nums font-semibold">{num(f.precio) > 0 ? formatCurrency(num(f.precio) * num(f.cantidad)) : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {e.notas?.length > 0 && <ListaInfo titulo="Notas del esquema" items={e.notas} />}
            <div className="grid md:grid-cols-[1fr_320px] gap-4 items-start border-t pt-4">
                <p className="text-xs text-muted-foreground">Los precios salen solo de tu catálogo. Si un componente no está, pon tú el precio (el de tu proveedor) o desmárcalo. Las cantidades son las contadas en el esquema: revísalas, sobre todo las de lectura dudosa.</p>
                <div className="rounded-xl bg-primary/10 p-4 space-y-3">
                    <div><p className="text-[11px] font-bold uppercase text-primary">Materiales (sin IVA)</p><p className="text-3xl font-black tabular-nums">{formatCurrency(base)}</p><p className="text-xs text-muted-foreground">{incluidas.length} componentes{sinPrecio.length ? ` · ${sinPrecio.length} sin precio` : ''}</p></div>
                    <div><Label className="text-xs">Cliente</Label><div className="mt-1"><ClientCombobox value={clienteId} onChange={setClienteId} /></div></div>
                    <Button className="w-full" disabled={creando || !incluidas.length} onClick={crear}>{creando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />} Crear presupuesto</Button>
                </div>
            </div>
        </div>
    )
}

// ───────────────────────────────── Comunes ──────────────────────────────────

function SelectorMaterial({ value, onChange, extra }: { value: string; onChange: (v: string) => void; extra: Material[] }) {
    const todos = useMemo(() => [...MATERIALES, ...extra], [extra])
    return (
        <select className={cn('mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm', !value && 'border-amber-400')} value={value} onChange={e => onChange(e.target.value)}>
            <option value="">— Elige el material —</option>
            {todos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
    )
}

function ListaInfo({ titulo, items }: { titulo: string; items: string[] }) {
    if (!items?.length) return null
    return <div><p className="text-xs font-bold text-muted-foreground">{titulo}</p><ul className="text-sm list-disc pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
}

/** Datos del cliente para el presupuesto (los mismos que copia el formulario normal). */
async function datosCliente(id: string) {
    const { supabase } = await import('@/lib/supabase')
    const { data: c } = await supabase.from('contactos').select('*').eq('id', id).maybeSingle()
    if (!c) return {}
    return { cliente_razon_social: c.razon_social, cliente_cif: c.cif, cliente_direccion: c.direccion, cliente_telefono: c.telefono, cliente_email: c.email, cliente_codigo_postal: c.codigo_postal, cliente_ciudad: c.ciudad, cliente_provincia: c.provincia }
}

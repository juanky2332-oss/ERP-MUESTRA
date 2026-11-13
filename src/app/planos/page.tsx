'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ScanLine, Settings2, Trash2, FileText, CircleHelp } from 'lucide-react'
import { toast } from 'sonner'
import { Subir, Leyendo, type SectorCorto } from '@/components/plano-ia/subir'
import { Boton, Campo, Tarjeta } from '@/components/plano-ia/ui'
import { getPlanosIA, leerPlanoIA, borrarPlanoIA, guardarAjustesPlano, type AjustesPlano } from '@/actions/plano-ia'
import { eur } from '@/lib/plano-ia/calculo'
import { sectorDe } from '@/lib/plano-ia/sectores'

type Fila = { id: string; titulo: string; sector: string; cantidad: number; base: number; total: number; created_at: string; presupuesto_numero: string | null; cliente: string | null; n_dudas: number; miniatura: string | null }

export default function PlanosPage() {
    const router = useRouter()
    const [datos, setDatos] = useState<{ planos: Fila[]; ajustes: AjustesPlano; sectores: SectorCorto[]; puedeEditar: boolean } | null>(null)
    const [error, setError] = useState('')
    const [leyendo, setLeyendo] = useState<string[] | null>(null)
    const [ajustesAbiertos, setAjustesAbiertos] = useState(false)

    const cargar = () => getPlanosIA().then(r => r.success ? setDatos(r) : setError(r.error))
    useEffect(() => { cargar() }, [])

    const enviar = async (fd: FormData, vistas: string[]) => {
        setLeyendo(vistas)
        try {
            const r = await leerPlanoIA(fd)
            if (!r.success) throw new Error(r.error)
            router.push(`/planos/${r.id}`)
        } catch (e) {
            toast.error((e as Error).message)
            setLeyendo(null)
        }
    }

    const borrar = async (f: Fila) => {
        if (!confirm(`¿Borrar «${f.titulo}»? El presupuesto del ERP, si lo creaste, no se borra.`)) return
        const r = await borrarPlanoIA(f.id)
        if (!r.success) return toast.error(r.error)
        toast.success('Borrado')
        cargar()
    }

    if (error) return <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{error}</div>

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2"><ScanLine className="h-7 w-7 text-acento" /> Presupuesto desde plano</h1>
                    <p className="text-muted-foreground mt-1 max-w-3xl">Sube el plano, el croquis o una foto. La IA lo despieza entero —material, horas, tornillería y componentes— y el ERP pone <b>tus</b> precios: tu hora de mano de obra, tus tarifas, tu catálogo o el precio de mercado del día. Lo revisas y lo pasas a presupuesto con un clic.</p>
                </div>
                {datos?.puedeEditar && <Boton onClick={() => setAjustesAbiertos(true)}><Settings2 className="h-4 w-4" /> Mis precios y ajustes</Boton>}
            </div>

            {leyendo ? <Leyendo vistas={leyendo} /> : datos ? (
                datos.puedeEditar && <Subir sectores={datos.sectores} sectorInicial={datos.ajustes.sector || 'calderia'} conCliente ocupado={!!leyendo} enviar={enviar} textoBoton="Despiezar y presupuestar" />
            ) : <div className="h-64 animate-pulse rounded-2xl bg-muted" />}

            {!leyendo && datos && (
                <Tarjeta titulo={`Planos presupuestados (${datos.planos.length})`} sub="Cada lectura queda guardada con su despiece: puedes volver a ella, cambiar precios y crear el presupuesto cuando quieras.">
                    {datos.planos.length === 0 ? <p className="text-sm text-txt-3">Aún no hay ninguno. Sube tu primer plano arriba.</p> : (
                        <ul className="divide-y divide-borde">
                            {datos.planos.map(f => {
                                const s = sectorDe(f.sector)
                                return (
                                    <li key={f.id} className="flex items-center gap-3 py-2.5">
                                        <Link href={`/planos/${f.id}`} className="flex min-w-0 flex-1 items-center gap-3 group">
                                            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-borde bg-white">
                                                {f.miniatura
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    ? <img src={`/api/archivos/documentos/${f.miniatura.split('/').map(encodeURIComponent).join('/')}`} alt="" className="h-full w-full object-cover" />
                                                    : <FileText className="h-5 w-5 text-txt-3" />}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate font-semibold group-hover:text-acento">{f.titulo}</span>
                                                <span className="block truncate text-xs text-txt-3">{s.icono} {s.corto} · {f.cantidad} {f.cantidad === 1 ? 'ud.' : 'uds.'} · {new Date(f.created_at).toLocaleDateString('es-ES')}{f.cliente ? ` · ${f.cliente}` : ''}</span>
                                            </span>
                                        </Link>
                                        {f.n_dudas > 0 && <span title="Datos por confirmar con el cliente" className="hidden sm:inline-flex items-center gap-1 rounded-full bg-aviso-suave px-2 py-0.5 text-[11px] text-aviso"><CircleHelp className="h-3 w-3" />{f.n_dudas}</span>}
                                        {f.presupuesto_numero
                                            ? <Link href={`/presupuestos?q=${encodeURIComponent(f.presupuesto_numero)}`} className="hidden sm:inline rounded-full bg-bien-suave px-2 py-0.5 text-[11px] font-medium text-bien">{f.presupuesto_numero}</Link>
                                            : <span className="hidden sm:inline rounded-full bg-card-2 px-2 py-0.5 text-[11px] text-txt-3">Sin pasar</span>}
                                        <span className="w-24 text-right text-sm font-semibold tabular">{eur(f.base)}</span>
                                        {datos.puedeEditar && <button onClick={() => borrar(f)} className="rounded-lg p-1.5 text-txt-3 hover:bg-mal-suave hover:text-mal" aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </Tarjeta>
            )}

            {ajustesAbiertos && datos && <Ajustes inicial={datos.ajustes} sectores={datos.sectores} cerrar={(a) => { setAjustesAbiertos(false); if (a) setDatos({ ...datos, ajustes: a }) }} />}
        </div>
    )
}

function Ajustes({ inicial, sectores, cerrar }: { inicial: AjustesPlano; sectores: SectorCorto[]; cerrar: (a?: AjustesPlano) => void }) {
    const [a, setA] = useState<AjustesPlano>(inicial)
    const [guardando, setGuardando] = useState(false)
    const n = (v: string) => { const x = Number(v.replace(',', '.')); return Number.isFinite(x) ? x : 0 }
    const guardar = async () => {
        setGuardando(true)
        const r = await guardarAjustesPlano(a)
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        toast.success('Ajustes guardados: se aplican a los próximos planos')
        cerrar(r.ajustes)
    }
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-noche/60 p-4" onClick={() => cerrar()}>
            <div className="aparecer max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold">Mis precios y ajustes</h3>
                <p className="mt-1 text-sm text-txt-3">Con esto calcula el ERP; la IA nunca pone precios.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Campo etiqueta="Tu sector habitual" className="sm:col-span-2">
                        <select className="pia-input" value={a.sector} onChange={e => setA({ ...a, sector: e.target.value })}>
                            {sectores.map(s => <option key={s.id} value={s.id}>{s.icono} {s.nombre}</option>)}
                        </select>
                    </Campo>
                    <Campo etiqueta="Tu hora de mano de obra (€/h)" ayuda="Se aplica a las horas de tu gente (montaje, soldadura, ajuste…), no a las máquinas.">
                        <input className="pia-input" inputMode="decimal" value={a.manoObra || ''} placeholder="Ej.: 32" onChange={e => setA({ ...a, manoObra: n(e.target.value) })} />
                    </Campo>
                    <Campo etiqueta="Margen por defecto (%)">
                        <input className="pia-input" inputMode="decimal" value={a.margen ?? ''} onChange={e => setA({ ...a, margen: n(e.target.value) })} />
                    </Campo>
                    <Campo etiqueta="Barras y tubos que compras (mm)">
                        <input className="pia-input" inputMode="numeric" value={a.largoBarra || ''} onChange={e => setA({ ...a, largoBarra: n(e.target.value) })} />
                    </Campo>
                    <Campo etiqueta="Formato de chapa (mm)">
                        <div className="flex items-center gap-2">
                            <input className="pia-input" inputMode="numeric" value={a.chapaA || ''} onChange={e => setA({ ...a, chapaA: n(e.target.value) })} />×
                            <input className="pia-input" inputMode="numeric" value={a.chapaB || ''} onChange={e => setA({ ...a, chapaB: n(e.target.value) })} />
                        </div>
                    </Campo>
                    <Campo etiqueta="Cómo ve el cliente el presupuesto" className="sm:col-span-2">
                        <select className="pia-input" value={a.formato} onChange={e => setA({ ...a, formato: e.target.value as 'unico' | 'desglosado' })}>
                            <option value="unico">Una sola línea con el total (recomendado)</option>
                            <option value="desglosado">Desglosado partida a partida</option>
                        </select>
                    </Campo>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                        <input type="checkbox" checked={a.usarMercado !== false} onChange={e => setA({ ...a, usarMercado: e.target.checked })} />
                        Si no tengo precio propio de un material, usar el precio de mercado del día
                    </label>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <Boton tipo="fantasma" onClick={() => cerrar()}>Cancelar</Boton>
                    <Boton tipo="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
                </div>
            </div>
        </div>
    )
}

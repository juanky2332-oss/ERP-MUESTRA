import { Landmark, TriangleAlert, CircleAlert, CheckCircle2 } from 'lucide-react'
import { getContexto } from '@/lib/auth'
import { tienePermiso } from '@/lib/permisos'
import { formatCurrency, cn } from '@/lib/utils'
import { hoyISO } from '@/lib/cobros/vencimientos'
import { EmptyState } from '@/components/ui/empty-state'
import { avisosFiscales, claveAviso, fechaES, periodoFiscal, periodosSeleccionables, ultimoTrimestreCerrado, vencimientos } from '@/lib/fiscal/calendario'
import { carpetaRaiz } from '@/lib/fiscal/libros'
import { clavesEntregadas, getConfigFiscal, librosDelPeriodo, nombreEmpresa } from '@/lib/fiscal/servidor'
import { AvisoFiscalBanner, textoDias } from '@/components/fiscal/aviso-fiscal'
import { ExportarPaquete } from '@/components/fiscal/exportar-paquete'
import { BotonEntregado, ConfigFiscalForm, SelectorPeriodo } from '@/components/fiscal/controles'

export const dynamic = 'force-dynamic'

export default async function FiscalPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
    const ctx = await getContexto()
    if (!tienePermiso(ctx.rol, 'fiscal')) {
        return <EmptyState icon={Landmark} title="Sin acceso" description="Tu rol no tiene acceso a la información fiscal." />
    }
    const hoy = hoyISO()
    const sp = await searchParams
    const [entregados, { cfg }] = await Promise.all([clavesEntregadas(ctx), getConfigFiscal(ctx)])
    const avisos = avisosFiscales(cfg, hoy, entregados)

    // Periodo: el pedido, o el del primer aviso, o el último trimestre cerrado
    const elegido = sp.periodo && periodoFiscal(sp.periodo) ? sp.periodo : null
    const { libros, periodo: p, empresa } = await librosDelPeriodo(ctx, elegido || avisos[0]?.periodo || ultimoTrimestreCerrado(hoy))

    const proximos = vencimientos(cfg, hoy, 370).slice(0, 14)
    const opciones = periodosSeleccionables(hoy).map(x => ({ clave: x.clave, etiqueta: x.etiqueta }))
    if (!opciones.some(o => o.clave === p.clave)) opciones.unshift({ clave: p.clave, etiqueta: p.etiqueta })
    const [{ data: exportaciones }, { data: entregas }] = await Promise.all([
        ctx.supabase.from('fiscal_exportaciones').select('id, periodo, destino, num_emitidas, num_recibidas, num_archivos, anomalias, usuario_nombre, created_at, totales').order('created_at', { ascending: false }).limit(8),
        ctx.supabase.from('fiscal_entregas').select('clave, periodo, entregado_at, usuario_nombre').order('entregado_at', { ascending: false }).limit(8),
    ])
    const t = libros.totales
    const errores = libros.anomalias.filter(a => a.nivel === 'error')
    const revisar = libros.anomalias.filter(a => a.nivel !== 'error')

    return (
        <div className="space-y-6 animate-in fade-in duration-300 pb-16">
            <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">Fiscal y asesor</h1>
                <p className="text-muted-foreground mt-1">Calendario de impuestos de la AEAT y facturas del periodo listas para tu asesor: ordenadas, numeradas y con su resumen.</p>
            </div>

            {avisos.length > 0 && <div className="space-y-3">{avisos.map(a => <AvisoFiscalBanner key={a.clave} aviso={a} enlace={a.periodo !== p.clave} />)}</div>}

            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_400px]">
                <div className="space-y-6 min-w-0">
                    <SelectorPeriodo actual={p.clave} opciones={opciones} />

                    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                        <Kpi t="Facturado (base)" v={formatCurrency(t.emitidas.base)} n={`${t.emitidas.num} emitida(s)${t.emitidas.anuladas ? `, ${t.emitidas.anuladas} anulada(s)` : ''}`} />
                        <Kpi t="Gastos (base)" v={formatCurrency(t.recibidas.base)} n={`${t.recibidas.num} recibida(s)`} />
                        <Kpi t="IVA repercutido − soportado" v={formatCurrency(libros.modelo303.resultado)} n={libros.modelo303.resultado >= 0 ? 'a ingresar (orientativo)' : 'a compensar (orientativo)'} fuerte />
                        <Kpi t="Retenciones practicadas" v={formatCurrency(t.recibidas.retencion)} n={`111: ${formatCurrency(libros.retenciones.m111.retencion)} · 115: ${formatCurrency(libros.retenciones.m115.retencion)}`} />
                    </div>
                    {libros.modelo130 && libros.modelo130.length > 0 && (() => { const u = libros.modelo130[libros.modelo130.length - 1]; return (
                        <p className="text-sm rounded-xl border bg-card px-4 py-3">Modelo 130 orientativo (acumulado del año): rendimiento {formatCurrency(u.rendimiento)} × 20 % = {formatCurrency(u.veintePorCiento)} − pagos anteriores {formatCurrency(u.pagosAnteriores)} → <b>{formatCurrency(u.resultado)}</b></p>
                    ) })()}

                    <ExportarPaquete periodo={p.clave} etiqueta={p.etiqueta} raiz={carpetaRaiz(nombreEmpresa(empresa), p)}
                        emitidas={libros.emitidas.length} recibidas={libros.recibidas.length} sinDocumento={t.recibidas.sinDocumento} anomalias={libros.anomalias.length} />

                    <section className="rounded-2xl border bg-card p-5 space-y-3">
                        <h2 className="text-lg font-black tracking-tight">Revisión antes de entregar</h2>
                        {libros.anomalias.length === 0
                            ? <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />Todo correcto: numeración sin huecos, NIF presentes, documentos adjuntos e importes cuadrados.</p>
                            : <ul className="space-y-2">
                                {[...errores, ...revisar].map((a, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm">
                                        {a.nivel === 'error' ? <CircleAlert className="h-4 w-4 mt-0.5 shrink-0 text-rose-600" /> : <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />}
                                        <span>{a.texto}</span>
                                    </li>
                                ))}
                            </ul>}
                    </section>

                    <Libro titulo={`Facturas emitidas (${libros.emitidas.length})`} cabecera={['Nº', 'Factura', 'Fecha', 'Cliente', 'NIF', 'Base', 'IVA', 'Total']}
                        filas={libros.emitidas.map(e => ({ k: e.id, apagada: !e.computa, celdas: [String(e.orden).padStart(3, '0'), e.numero + (e.estado === 'anulada' ? ' (anulada)' : ''), fechaES(e.fecha), e.cliente, e.nif || '—', formatCurrency(e.base), `${formatCurrency(e.cuota)} · ${e.tipoIva}%`, formatCurrency(e.total)] }))}
                        pie={['', '', '', '', 'Total', formatCurrency(t.emitidas.base), formatCurrency(t.emitidas.cuota), formatCurrency(t.emitidas.total)]} />
                    <Libro titulo={`Facturas recibidas (${libros.recibidas.length})`} cabecera={['Reg.', 'Fecha', 'Proveedor', 'Nº factura', 'Base', 'IVA', 'Total', 'PDF']}
                        filas={libros.recibidas.map(r => ({ k: r.id, celdas: [String(r.orden).padStart(3, '0'), fechaES(r.fecha), r.proveedor + (r.nif ? ` · ${r.nif}` : ''), r.numeroProveedor || `S/N (${r.numeroInterno})`, formatCurrency(r.base), formatCurrency(r.cuota), formatCurrency(r.total), r.tieneDocumento ? '✓' : 'falta'] }))}
                        pie={['', '', '', 'Total', formatCurrency(t.recibidas.base), formatCurrency(t.recibidas.cuota), formatCurrency(t.recibidas.total), '']} />
                </div>

                <aside className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-1 content-start min-w-0">
                    <section className="rounded-2xl border bg-card p-5">
                        <h2 className="text-lg font-black tracking-tight mb-3">Próximos plazos</h2>
                        {proximos.length === 0 ? <p className="text-sm text-muted-foreground">No hay modelos activados.</p> : (
                            <ul className="divide-y">
                                {proximos.map(v => {
                                    const hecho = entregados.has(claveAviso(v.periodo, v.fin))
                                    return (
                                        <li key={`${v.modelo}-${v.periodo}`} className="py-2.5 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold">{v.nombre.split(' · ')[0]} <span className="font-normal text-muted-foreground">· {v.nombre.split(' · ')[1]}</span></p>
                                                <p className="text-xs text-muted-foreground">{v.etiquetaPeriodo}{v.finDomiciliacion ? ` · domiciliado hasta ${fechaES(v.finDomiciliacion)}` : ''}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-bold tabular-nums">{fechaES(v.fin)}</p>
                                                <p className={cn('text-xs font-semibold', hecho ? 'text-emerald-600' : v.diasRestantes <= 7 ? 'text-rose-600' : v.diasRestantes <= 30 ? 'text-amber-600' : 'text-muted-foreground')}>{hecho ? 'entregado' : textoDias(v.diasRestantes)}</p>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-3">Plazos de la AEAT en vía voluntaria; si el último día es sábado, domingo o festivo nacional pasa al siguiente hábil. No incluye festivos autonómicos ni locales.</p>
                    </section>

                    <section className="rounded-2xl border bg-card p-5">
                        <h2 className="text-lg font-black tracking-tight mb-3">Configuración fiscal</h2>
                        <ConfigFiscalForm inicial={cfg} puedeEditar={tienePermiso(ctx.rol, 'ajustes')} />
                    </section>

                    <section className="rounded-2xl border bg-card p-5 space-y-3">
                        <h2 className="text-lg font-black tracking-tight">Historial</h2>
                        {(exportaciones || []).length === 0 && (entregas || []).length === 0 && <p className="text-sm text-muted-foreground">Aún no se ha generado ningún paquete.</p>}
                        {(entregas || []).map((e: any) => (
                            <div key={e.clave} className="flex items-center justify-between gap-2 text-sm">
                                <span className="min-w-0">✅ <b>{periodoFiscal(e.periodo)?.etiqueta || e.periodo}</b> entregado el {fechaES(String(e.entregado_at).slice(0, 10))}{e.usuario_nombre ? ` por ${e.usuario_nombre}` : ''}</span>
                                <BotonEntregado clave={e.clave} periodo={e.periodo} entregado />
                            </div>
                        ))}
                        {(exportaciones || []).map((x: any) => (
                            <p key={x.id} className="text-xs text-muted-foreground">
                                📦 {x.periodo} · {new Date(x.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })} · {x.usuario_nombre} · {x.destino === 'carpeta' ? 'carpeta' : 'ZIP'} · {x.num_emitidas} emitidas, {x.num_recibidas} recibidas, {x.num_archivos} archivos{x.anomalias ? ` · ${x.anomalias} avisos` : ''}
                            </p>
                        ))}
                    </section>
                </aside>
            </div>
        </div>
    )
}

function Kpi({ t, v, n, fuerte }: { t: string; v: string; n?: string; fuerte?: boolean }) {
    return (
        <div className={cn('rounded-2xl border bg-card p-4 min-w-0', fuerte && 'ring-1 ring-primary/30')}>
            <p className="text-xs font-bold text-muted-foreground">{t}</p>
            <p className="text-lg md:text-xl font-black tabular-nums mt-1 truncate">{v}</p>
            {n && <p className="text-[11px] text-muted-foreground mt-0.5">{n}</p>}
        </div>
    )
}

function Libro({ titulo, cabecera, filas, pie }: { titulo: string; cabecera: string[]; filas: { k: string; celdas: string[]; apagada?: boolean }[]; pie: string[] }) {
    return (
        <section className="rounded-2xl border bg-card overflow-hidden">
            <h2 className="text-base font-black tracking-tight px-5 pt-4 pb-2">{titulo}</h2>
            {filas.length === 0 ? <p className="px-5 pb-4 text-sm text-muted-foreground">Ninguna en este periodo.</p> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{cabecera.map((c, i) => <th key={i} className={cn('px-3 py-2 text-left font-bold whitespace-nowrap', i >= cabecera.length - 3 && 'text-right')}>{c}</th>)}</tr></thead>
                        <tbody className="divide-y">
                            {filas.map(f => <tr key={f.k} className={cn(f.apagada && 'text-muted-foreground line-through decoration-1')}>{f.celdas.map((c, i) => <td key={i} className={cn('px-3 py-2', i >= f.celdas.length - 3 ? 'text-right tabular-nums whitespace-nowrap' : i < 3 ? 'whitespace-nowrap' : '', c === 'falta' && 'text-rose-600 font-bold')}>{c}</td>)}</tr>)}
                        </tbody>
                        <tfoot className="bg-muted/30 font-bold"><tr>{pie.map((c, i) => <td key={i} className={cn('px-3 py-2', i >= pie.length - 3 && 'text-right tabular-nums whitespace-nowrap')}>{c}</td>)}</tr></tfoot>
                    </table>
                </div>
            )}
        </section>
    )
}

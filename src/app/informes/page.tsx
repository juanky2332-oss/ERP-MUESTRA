import Link from 'next/link'
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react'
import { getContexto } from '@/lib/auth'
import { tienePermiso } from '@/lib/permisos'
import { formatCurrency, cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { informeEmpresa } from '@/lib/informes/servidor'
import { variacion, fechaCorta, type Informe } from '@/lib/informes/calcular'
import { FiltrosInformes, ExportarCSV } from '@/components/informes/filtros'

export const dynamic = 'force-dynamic'

const VISTAS = [
    { v: 'resumen', l: 'Resumen' },
    { v: 'ventas', l: 'Ventas' },
    { v: 'cobros', l: 'Cobros y deuda' },
    { v: 'gastos', l: 'Gastos' },
    { v: 'iva', l: 'IVA' },
    { v: 'presupuestos', l: 'Presupuestos' },
    { v: 'albaranes', l: 'Albaranes' },
]

type SP = Record<string, string | undefined>

export default async function InformesPage({ searchParams }: { searchParams: Promise<SP> }) {
    const ctx = await getContexto()
    if (!tienePermiso(ctx.rol, 'economico')) {
        return <EmptyState icon={BarChart3} title="Sin acceso" description="Tu rol no tiene acceso a los informes económicos." />
    }
    const sp = await searchParams
    const vista = VISTAS.some(v => v.v === sp.vista) ? sp.vista! : 'resumen'
    const [{ hoy, actual: a, anterior: b }, { data: contactos }] = await Promise.all([
        informeEmpresa(ctx, { preset: sp.preset, mes: sp.mes, desde: sp.desde, hasta: sp.hasta, cliente: sp.cliente }),
        ctx.supabase.from('contactos').select('id, razon_social').order('razon_social').limit(2000),
    ])
    const clientes: { id: string; nombre: string }[] = (contactos || []).filter((c: any) => c.razon_social).map((c: any) => ({ id: c.id, nombre: c.razon_social }))
    const nombreCliente = sp.cliente ? clientes.find(c => c.id === sp.cliente)?.nombre : null
    const enlace = (v: string) => { const q = new URLSearchParams(Object.entries(sp).filter(([, x]) => x) as [string, string][]); q.set('vista', v); return `/informes?${q.toString()}` }
    const archivo = (s: string) => `${s}_${a.periodo.desde}_${a.periodo.hasta}`

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">Informes</h1>
                <p className="text-muted-foreground mt-1">{a.periodo.etiqueta} <span className="text-xs">({fechaCorta(a.periodo.desde)} – {fechaCorta(a.periodo.hasta)})</span>{nombreCliente ? <> · cliente <b>{nombreCliente}</b></> : null} · comparado con {b.periodo.etiqueta}. Importes sin IVA salvo que se indique.</p>
            </div>

            <FiltrosInformes clientes={clientes} hoy={hoy} />

            <nav className="flex gap-1 overflow-x-auto border-b print:hidden">
                {VISTAS.map(v => (
                    <Link key={v.v} href={enlace(v.v)} className={cn('px-3 py-2 text-sm font-bold whitespace-nowrap border-b-2 -mb-px', vista === v.v ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{v.l}</Link>
                ))}
            </nav>

            {vista === 'resumen' && <Resumen a={a} b={b} enlace={enlace} archivo={archivo} />}
            {vista === 'ventas' && <Ventas a={a} archivo={archivo} />}
            {vista === 'cobros' && <Cobros a={a} archivo={archivo} />}
            {vista === 'gastos' && <Gastos a={a} archivo={archivo} cliente={!!sp.cliente} />}
            {vista === 'iva' && <Iva a={a} archivo={archivo} />}
            {vista === 'presupuestos' && <Presupuestos a={a} b={b} archivo={archivo} />}
            {vista === 'albaranes' && <Albaranes a={a} archivo={archivo} />}
        </div>
    )
}

function Kpi({ t, v, antes, moneda = true, sufijo = '', invertir = false, nota }: { t: string; v: number | null; antes?: number | null; moneda?: boolean; sufijo?: string; invertir?: boolean; nota?: string }) {
    const d = v != null && antes != null ? variacion(v, antes) : null
    const bueno = d == null ? null : invertir ? d <= 0 : d >= 0
    return (
        <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs font-bold text-muted-foreground">{t}</p>
            <p className="text-xl md:text-2xl font-black tabular-nums mt-1">{v == null ? '—' : moneda ? formatCurrency(v) : `${v.toLocaleString('es-ES')}${sufijo}`}</p>
            {d != null && d !== 0 && (
                <p className={cn('text-xs font-bold mt-0.5 flex items-center gap-1', bueno ? 'text-emerald-600' : 'text-rose-600')}>
                    {d > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{d > 0 ? '+' : ''}{d.toLocaleString('es-ES')}% <span className="font-medium text-muted-foreground">vs anterior</span>
                </p>
            )}
            {nota && <p className="text-[11px] text-muted-foreground mt-0.5">{nota}</p>}
        </div>
    )
}

function Caja({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
    return (
        <div className="rounded-2xl border bg-card p-4 break-inside-avoid">
            <div className="flex items-center justify-between mb-3 gap-2"><p className="text-sm font-extrabold">{titulo}</p>{accion}</div>
            {children}
        </div>
    )
}

function Barras({ datos, max }: { datos: { clave: string; importe: number; num?: number }[]; max?: number }) {
    if (!datos.length) return <p className="text-sm text-muted-foreground">Sin datos en este periodo.</p>
    const tope = max ?? (datos[0]?.importe || 1)
    const total = datos.reduce((s, x) => s + x.importe, 0)
    return (
        <div className="space-y-2">
            {datos.map(x => (
                <div key={x.clave}>
                    <div className="flex justify-between text-sm gap-2"><span className="truncate">{x.clave}</span><span className="font-bold tabular-nums whitespace-nowrap">{formatCurrency(x.importe)} <span className="text-xs text-muted-foreground font-medium">{total ? Math.round((x.importe / total) * 100) : 0}%</span></span></div>
                    <div className="h-1.5 bg-muted rounded-full mt-1"><div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.max(1, (x.importe / (tope || 1)) * 100)}%` }} /></div>
                </div>
            ))}
        </div>
    )
}

function Tabla({ cols, filas, alinear }: { cols: string[]; filas: React.ReactNode[][]; alinear?: ('l' | 'r')[] }) {
    if (!filas.length) return <p className="text-sm text-muted-foreground">Sin datos en este periodo.</p>
    return (
        <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground"><tr>{cols.map((c, i) => <th key={c} className={cn('p-2 font-bold', (alinear?.[i] || (i ? 'r' : 'l')) === 'r' ? 'text-right' : 'text-left')}>{c}</th>)}</tr></thead>
                <tbody className="divide-y">{filas.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j} className={cn('p-2 tabular-nums', (alinear?.[j] || (j ? 'r' : 'l')) === 'r' ? 'text-right' : 'text-left', j === 0 && 'font-semibold')}>{c}</td>)}</tr>)}</tbody>
            </table>
        </div>
    )
}

function Grafico({ a }: { a: Informe }) {
    const pts = a.serie.puntos
    const max = Math.max(1, ...pts.map(p => Math.max(p.facturado, p.cobrado, p.gastos)))
    return (
        <Caja titulo={a.serie.porDia ? 'Evolución diaria' : 'Evolución mensual'}>
            <div className="flex gap-4 text-xs font-semibold mb-3">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Facturado</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Cobrado</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Gastos</span>
            </div>
            <div className="flex items-end gap-1 h-52 overflow-x-auto">
                {pts.map(m => (
                    <div key={m.clave} className={cn('flex flex-col items-center gap-1 flex-1', a.serie.porDia ? 'min-w-[16px]' : 'min-w-[40px]')}>
                        <div className="flex items-end gap-px h-44 w-full justify-center">
                            <div className="w-full max-w-[10px] rounded-t bg-primary" style={{ height: `${(m.facturado / max) * 100}%` }} title={`Facturado ${formatCurrency(m.facturado)}`} />
                            <div className="w-full max-w-[10px] rounded-t bg-emerald-500" style={{ height: `${(m.cobrado / max) * 100}%` }} title={`Cobrado ${formatCurrency(m.cobrado)}`} />
                            <div className="w-full max-w-[10px] rounded-t bg-rose-400" style={{ height: `${(m.gastos / max) * 100}%` }} title={`Gastos ${formatCurrency(m.gastos)}`} />
                        </div>
                        <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{m.etiqueta}</span>
                    </div>
                ))}
            </div>
        </Caja>
    )
}

function Resumen({ a, b, enlace, archivo }: { a: Informe; b: Informe; enlace: (v: string) => string; archivo: (s: string) => string }) {
    const k = a.kpis, kb = b.kpis
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi t="Facturado" v={k.facturadoBase} antes={kb.facturadoBase} nota={`${k.numFacturas} facturas · ${formatCurrency(k.facturadoTotal)} con IVA`} />
                <Kpi t="Cobrado" v={k.cobrado} antes={kb.cobrado} />
                <Kpi t="Gastos" v={k.gastosBase} antes={kb.gastosBase} invertir />
                <Kpi t="Resultado (facturado − gastos)" v={k.resultado} antes={kb.resultado} nota={k.margen != null ? `Margen ${k.margen.toLocaleString('es-ES')}%` : undefined} />
                <Kpi t="Pendiente de cobro (hoy)" v={k.pendienteCobro} nota="Toda la deuda viva de clientes" />
                <Kpi t="Vencido sin cobrar (hoy)" v={k.vencido} />
                <Kpi t="Ticket medio por factura" v={k.ticketMedio} antes={kb.ticketMedio} />
                <Kpi t="Días medios de cobro" v={k.diasMedioCobro} antes={kb.diasMedioCobro} moneda={false} sufijo=" días" invertir />
            </div>
            <Grafico a={a} />
            <div className="grid lg:grid-cols-3 gap-4">
                <Caja titulo="Clientes con más facturación" accion={<Link href={enlace('ventas')} className="text-xs font-bold text-primary print:hidden">Ver todo</Link>}><Barras datos={a.ventasPorCliente.slice(0, 6)} /></Caja>
                <Caja titulo="Gastos por categoría" accion={<Link href={enlace('gastos')} className="text-xs font-bold text-primary print:hidden">Ver todo</Link>}><Barras datos={a.gastosPorCategoria.slice(0, 6)} /></Caja>
                <Caja titulo="Antigüedad de la deuda (hoy)" accion={<Link href={enlace('cobros')} className="text-xs font-bold text-primary print:hidden">Ver todo</Link>}>
                    <Barras datos={a.antiguedad.map(t => ({ clave: `${t.etiqueta} (${t.num})`, importe: t.importe }))} max={Math.max(...a.antiguedad.map(t => t.importe), 1)} />
                </Caja>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
                <Caja titulo="Presupuestos" accion={<Link href={enlace('presupuestos')} className="text-xs font-bold text-primary print:hidden">Ver todo</Link>}>
                    <p className="text-sm">{a.presupuestos.num} emitidos por {formatCurrency(a.presupuestos.importe)} · <b>{a.presupuestos.conversion ?? 0}% aceptados</b> · {a.presupuestos.abiertos} abiertos ({formatCurrency(a.presupuestos.importeAbierto)})</p>
                </Caja>
                <Caja titulo="Albaranes" accion={<Link href={enlace('albaranes')} className="text-xs font-bold text-primary print:hidden">Ver todo</Link>}>
                    <p className="text-sm">{a.albaranes.num} emitidos · <b>{a.albaranes.pendientesFacturar} sin facturar ({formatCurrency(a.albaranes.importePendienteFacturar)})</b> · {a.albaranes.sinFirma} sin firma</p>
                </Caja>
            </div>
            <Caja titulo="Detalle por periodo" accion={<ExportarCSV nombre={archivo('evolucion')} columnas={['Periodo', 'Facturado', 'Cobrado', 'Gastos', 'Resultado']} filas={a.serie.puntos.map(p => [p.clave, p.facturado, p.cobrado, p.gastos, p.resultado])} />}>
                <Tabla cols={['Periodo', 'Facturado', 'Cobrado', 'Gastos', 'Resultado']} filas={[...a.serie.puntos].reverse().filter(p => !a.serie.porDia || p.facturado || p.cobrado || p.gastos).map(p => [a.serie.porDia ? fechaCorta(p.clave) : p.etiqueta, formatCurrency(p.facturado), formatCurrency(p.cobrado), formatCurrency(p.gastos), <b key="r" className={p.resultado < 0 ? 'text-rose-600' : ''}>{formatCurrency(p.resultado)}</b>])} />
            </Caja>
        </div>
    )
}

function Ventas({ a, archivo }: { a: Informe; archivo: (s: string) => string }) {
    const total = a.kpis.facturadoBase || 1
    return (
        <div className="grid lg:grid-cols-2 gap-4">
            <Caja titulo={`Ventas por cliente (${a.ventasPorCliente.length})`} accion={<ExportarCSV nombre={archivo('ventas_por_cliente')} columnas={['Cliente', 'Facturas', 'Importe sin IVA', '% del total']} filas={a.ventasPorCliente.map(c => [c.clave, c.num, c.importe, Math.round((c.importe / total) * 1000) / 10])} />}>
                <Tabla cols={['Cliente', 'Facturas', 'Importe', '%']} filas={a.ventasPorCliente.map(c => [c.clave, c.num, formatCurrency(c.importe), `${Math.round((c.importe / total) * 100)}%`])} />
            </Caja>
            <Caja titulo="Lo más vendido (líneas de factura)" accion={<ExportarCSV nombre={archivo('ventas_por_concepto')} columnas={['Concepto', 'Líneas', 'Importe sin IVA']} filas={a.porConcepto.map(c => [c.clave, c.num, c.importe])} />}>
                <Barras datos={a.porConcepto} />
            </Caja>
        </div>
    )
}

function Cobros({ a, archivo }: { a: Informe; archivo: (s: string) => string }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {a.antiguedad.map(t => (
                    <div key={t.id} className="rounded-2xl border bg-card p-4">
                        <p className="text-xs font-bold text-muted-foreground">{t.etiqueta}</p>
                        <p className={cn('text-xl font-black tabular-nums mt-1', t.id !== 'al_dia' && t.importe > 0 && 'text-rose-600')}>{formatCurrency(t.importe)}</p>
                        <p className="text-[11px] text-muted-foreground">{t.num} facturas</p>
                    </div>
                ))}
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
                <Caja titulo="Quién debe más (hoy)"><Barras datos={a.deudores} /></Caja>
                <Caja titulo="Cobrado en el periodo por método"><Barras datos={a.cobrosPorMetodo} /></Caja>
            </div>
            <Caja titulo="Facturas pendientes de cobro" accion={<ExportarCSV nombre={archivo('pendientes_de_cobro')} columnas={['Factura', 'Cliente', 'Fecha', 'Vencimiento', 'Total', 'Pendiente']} filas={a.facturasPendientes.map(f => [f.numero, f.cliente, f.fecha, f.vencimiento, f.total, f.pendiente])} />}>
                <Tabla cols={['Factura', 'Cliente', 'Vence', 'Total', 'Pendiente']} alinear={['l', 'l', 'l', 'r', 'r']} filas={a.facturasPendientes.map(f => [
                    <Link key="n" href={`/facturas?q=${encodeURIComponent(f.numero)}`} className="text-primary">{f.numero}</Link>, f.cliente, f.vencimiento ? fechaCorta(f.vencimiento) : '—', formatCurrency(f.total), <b key="p">{formatCurrency(f.pendiente)}</b>,
                ])} />
            </Caja>
        </div>
    )
}

function Gastos({ a, archivo, cliente }: { a: Informe; archivo: (s: string) => string; cliente: boolean }) {
    if (cliente) return <p className="text-sm text-muted-foreground">Los gastos no van por cliente: quita el filtro de cliente para verlos.</p>
    return (
        <div className="grid lg:grid-cols-2 gap-4">
            <Caja titulo="Gastos por categoría" accion={<ExportarCSV nombre={archivo('gastos_por_categoria')} columnas={['Categoría', 'Nº', 'Base']} filas={a.gastosPorCategoria.map(c => [c.clave, c.num, c.importe])} />}><Barras datos={a.gastosPorCategoria} /></Caja>
            <Caja titulo="Gastos por proveedor" accion={<ExportarCSV nombre={archivo('gastos_por_proveedor')} columnas={['Proveedor', 'Nº', 'Base']} filas={a.gastosPorProveedor.map(c => [c.clave, c.num, c.importe])} />}>
                <Tabla cols={['Proveedor', 'Nº', 'Base']} filas={a.gastosPorProveedor.map(c => [c.clave, c.num, formatCurrency(c.importe)])} />
            </Caja>
        </div>
    )
}

function Iva({ a, archivo }: { a: Informe; archivo: (s: string) => string }) {
    return (
        <Caja titulo="IVA por trimestre" accion={<ExportarCSV nombre={archivo('iva')} columnas={['Trimestre', 'Base ventas', 'IVA repercutido', 'Base compras', 'IVA soportado', 'Resultado']} filas={a.ivaTrimestres.map(t => [t.trimestre, t.baseVentas, t.repercutido, t.baseCompras, t.soportado, t.resultado])} />}>
            <Tabla cols={['Trimestre', 'Base ventas', 'IVA repercutido', 'Base compras', 'IVA soportado', 'A ingresar / (compensar)']} filas={a.ivaTrimestres.map(t => [t.trimestre.replace('-', ' '), formatCurrency(t.baseVentas), formatCurrency(t.repercutido), formatCurrency(t.baseCompras), formatCurrency(t.soportado), <b key="r" className={t.resultado < 0 ? 'text-emerald-600' : ''}>{formatCurrency(t.resultado)}</b>])} />
            <p className="text-xs text-muted-foreground mt-3">Orientativo para preparar el modelo 303 con tu gestoría: sale de las facturas emitidas y de los gastos registrados en el ERP (no incluye operaciones que no estén aquí, prorratas ni regularizaciones).</p>
        </Caja>
    )
}

function Presupuestos({ a, b, archivo }: { a: Informe; b: Informe; archivo: (s: string) => string }) {
    const p = a.presupuestos
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi t="Emitidos" v={p.num} antes={b.presupuestos.num} moneda={false} nota={formatCurrency(p.importe)} />
                <Kpi t="Aceptados" v={p.aceptados} antes={b.presupuestos.aceptados} moneda={false} nota={formatCurrency(p.importeAceptado)} />
                <Kpi t="Tasa de aceptación" v={p.conversion} antes={b.presupuestos.conversion} moneda={false} sufijo="%" />
                <Kpi t="Abiertos" v={p.abiertos} moneda={false} nota={`${formatCurrency(p.importeAbierto)} · ${p.caducados} caducados`} />
            </div>
            <Caja titulo="Presupuestos abiertos (sin respuesta)" accion={<ExportarCSV nombre={archivo('presupuestos_abiertos')} columnas={['Presupuesto', 'Cliente', 'Fecha', 'Validez', 'Importe']} filas={p.abiertosLista.map(x => [x.numero, x.cliente, x.fecha, x.validez, x.importe])} />}>
                <Tabla cols={['Presupuesto', 'Cliente', 'Fecha', 'Válido hasta', 'Importe']} alinear={['l', 'l', 'l', 'l', 'r']} filas={p.abiertosLista.map(x => [
                    <Link key="n" href={`/presupuestos?q=${encodeURIComponent(x.numero)}`} className="text-primary">{x.numero}</Link>, x.cliente, fechaCorta(x.fecha), x.validez ? fechaCorta(x.validez) : '—', formatCurrency(x.importe),
                ])} />
            </Caja>
        </div>
    )
}

function Albaranes({ a, archivo }: { a: Informe; archivo: (s: string) => string }) {
    const x = a.albaranes
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi t="Albaranes emitidos" v={x.num} moneda={false} nota={formatCurrency(x.importe)} />
                <Kpi t="Sin facturar" v={x.importePendienteFacturar} nota={`${x.pendientesFacturar} albaranes`} />
                <Kpi t="Sin firma del cliente" v={x.sinFirma} moneda={false} nota="Súbela en Albaranes y partes firmados" />
            </div>
            <Caja titulo="Albaranes pendientes de facturar" accion={<ExportarCSV nombre={archivo('albaranes_sin_facturar')} columnas={['Albarán', 'Cliente', 'Fecha', 'Importe', 'Firmado']} filas={x.pendientesLista.map(y => [y.numero, y.cliente, y.fecha, y.importe, y.firmado ? 'Sí' : 'No'])} />}>
                <Tabla cols={['Albarán', 'Cliente', 'Fecha', 'Firmado', 'Importe']} alinear={['l', 'l', 'l', 'l', 'r']} filas={x.pendientesLista.map(y => [
                    <Link key="n" href={`/albaranes?q=${encodeURIComponent(y.numero)}`} className="text-primary">{y.numero}</Link>, y.cliente, fechaCorta(y.fecha), y.firmado ? '✔' : '—', formatCurrency(y.importe),
                ])} />
            </Caja>
        </div>
    )
}

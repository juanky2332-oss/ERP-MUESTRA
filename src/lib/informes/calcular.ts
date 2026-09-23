/**
 * Cálculo de informes del ERP (funciones puras: sin base de datos).
 * Lo usan la pantalla de Informes, el asistente El Maikel y Telegram,
 * para que las cifras sean idénticas en todas partes.
 */

export type Preset = 'este_mes' | 'mes_anterior' | 'trimestre' | 'trimestre_anterior' | 'este_ano' | 'ano_anterior' | 'ultimos_12' | 'mes' | 'personalizado'

export interface Periodo { desde: string; hasta: string; etiqueta: string; preset: Preset }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const finMes = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Resuelve el periodo del informe. `hoy` en YYYY-MM-DD (zona de Madrid). */
export function resolverPeriodo(p: { preset?: string; mes?: string; desde?: string; hasta?: string }, hoy: string): Periodo {
    const [Y, M] = hoy.split('-').map(Number)
    const y = Y, m = M - 1
    const preset = (p.preset || 'ultimos_12') as Preset
    switch (preset) {
        case 'este_mes': return { desde: iso(y, m, 1), hasta: iso(y, m, finMes(y, m)), etiqueta: `${cap(MESES[m])} ${y}`, preset }
        case 'mes_anterior': { const d = new Date(Date.UTC(y, m - 1, 1)); const yy = d.getUTCFullYear(), mm = d.getUTCMonth(); return { desde: iso(yy, mm, 1), hasta: iso(yy, mm, finMes(yy, mm)), etiqueta: `${cap(MESES[mm])} ${yy}`, preset } }
        case 'mes': {
            const [yy, mm] = (p.mes || hoy.slice(0, 7)).split('-').map(Number)
            return { desde: iso(yy, mm - 1, 1), hasta: iso(yy, mm - 1, finMes(yy, mm - 1)), etiqueta: `${cap(MESES[mm - 1])} ${yy}`, preset }
        }
        case 'trimestre': { const q = Math.floor(m / 3); return { desde: iso(y, q * 3, 1), hasta: iso(y, q * 3 + 2, finMes(y, q * 3 + 2)), etiqueta: `${q + 1}º trimestre ${y}`, preset } }
        case 'trimestre_anterior': { let q = Math.floor(m / 3) - 1, yy = y; if (q < 0) { q = 3; yy-- } return { desde: iso(yy, q * 3, 1), hasta: iso(yy, q * 3 + 2, finMes(yy, q * 3 + 2)), etiqueta: `${q + 1}º trimestre ${yy}`, preset } }
        case 'este_ano': return { desde: iso(y, 0, 1), hasta: iso(y, 11, 31), etiqueta: `Año ${y}`, preset }
        case 'ano_anterior': return { desde: iso(y - 1, 0, 1), hasta: iso(y - 1, 11, 31), etiqueta: `Año ${y - 1}`, preset }
        case 'personalizado': {
            const desde = /^\d{4}-\d{2}-\d{2}$/.test(p.desde || '') ? p.desde! : iso(y, m, 1)
            const hasta = /^\d{4}-\d{2}-\d{2}$/.test(p.hasta || '') ? p.hasta! : hoy
            const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde]
            return { desde: a, hasta: b, etiqueta: `Del ${fechaCorta(a)} al ${fechaCorta(b)}`, preset }
        }
        default: { const d = new Date(Date.UTC(y, m - 11, 1)); return { desde: iso(d.getUTCFullYear(), d.getUTCMonth(), 1), hasta: iso(y, m, finMes(y, m)), etiqueta: 'Últimos 12 meses', preset: 'ultimos_12' } }
    }
}

export function fechaCorta(f: string) { const [a, b, c] = f.slice(0, 10).split('-'); return `${c}/${b}/${a}` }

/** Mismo número de días justo antes (para comparar). */
export function periodoAnterior(p: Periodo): Periodo {
    const d = new Date(p.desde + 'T00:00:00Z'), h = new Date(p.hasta + 'T00:00:00Z')
    // Meses/trimestres/años completos: se compara con el bloque equivalente anterior
    const esMesCompleto = d.getUTCDate() === 1 && h.getUTCDate() === finMes(h.getUTCFullYear(), h.getUTCMonth())
    if (esMesCompleto) {
        const meses = (h.getUTCFullYear() - d.getUTCFullYear()) * 12 + h.getUTCMonth() - d.getUTCMonth() + 1
        const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - meses, 1))
        const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))
        const desde = ini.toISOString().slice(0, 10), hasta = fin.toISOString().slice(0, 10)
        return { desde, hasta, etiqueta: `${fechaCorta(desde)} – ${fechaCorta(hasta)}`, preset: 'personalizado' }
    }
    const dias = Math.round((h.getTime() - d.getTime()) / 86400000) + 1
    const fin = new Date(d.getTime() - 86400000), ini = new Date(fin.getTime() - (dias - 1) * 86400000)
    const desde = ini.toISOString().slice(0, 10), hasta = fin.toISOString().slice(0, 10)
    return { desde, hasta, etiqueta: `${fechaCorta(desde)} – ${fechaCorta(hasta)}`, preset: 'personalizado' }
}

const n = (v: any) => Number(v || 0)
const r2 = (v: number) => Math.round(v * 100) / 100
const enRango = (f: string | null | undefined, p: Periodo) => !!f && f.slice(0, 10) >= p.desde && f.slice(0, 10) <= p.hasta
const base = (d: any) => (d.base_imponible != null && d.base_imponible !== '' ? n(d.base_imponible) : n(d.total) - n(d.iva_importe))

export interface DatosInforme {
    facturas: any[]; cobros: any[]; gastos: any[]; presupuestos: any[]; albaranes: any[]
}

function agrupar<T>(lista: T[], clave: (x: T) => string, valor: (x: T) => number) {
    const m = new Map<string, { clave: string; importe: number; num: number }>()
    for (const x of lista) {
        const k = clave(x) || 'Sin clasificar'
        const e = m.get(k) || { clave: k, importe: 0, num: 0 }
        e.importe += valor(x); e.num++; m.set(k, e)
    }
    return [...m.values()].map(e => ({ ...e, importe: r2(e.importe) })).sort((a, b) => b.importe - a.importe)
}

/** Serie temporal: por día si el periodo es ≤ 45 días, si no por mes. */
function serie(p: Periodo, fs: any[], cs: any[], gs: any[]) {
    const dias = (new Date(p.hasta).getTime() - new Date(p.desde).getTime()) / 86400000 + 1
    const porDia = dias <= 45
    const cubos: { clave: string; etiqueta: string; facturado: number; cobrado: number; gastos: number }[] = []
    if (porDia) {
        for (let t = new Date(p.desde + 'T00:00:00Z'); t <= new Date(p.hasta + 'T00:00:00Z'); t = new Date(t.getTime() + 86400000)) {
            const k = t.toISOString().slice(0, 10)
            cubos.push({ clave: k, etiqueta: String(t.getUTCDate()), facturado: 0, cobrado: 0, gastos: 0 })
        }
    } else {
        let t = new Date(p.desde.slice(0, 7) + '-01T00:00:00Z')
        while (t.toISOString().slice(0, 7) <= p.hasta.slice(0, 7)) {
            cubos.push({ clave: t.toISOString().slice(0, 7), etiqueta: `${MESES_CORTO[t.getUTCMonth()]} ${String(t.getUTCFullYear()).slice(2)}`, facturado: 0, cobrado: 0, gastos: 0 })
            t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1))
        }
    }
    const idx = new Map(cubos.map((c, i) => [c.clave, i]))
    const k = (f: string) => (porDia ? f.slice(0, 10) : f.slice(0, 7))
    for (const f of fs) { const i = idx.get(k(f.fecha)); if (i != null) cubos[i].facturado += base(f) }
    for (const c of cs) { const i = idx.get(k(c.fecha)); if (i != null) cubos[i].cobrado += n(c.importe) }
    for (const g of gs) { const i = idx.get(k(g.fecha)); if (i != null) cubos[i].gastos += base(g) }
    return { porDia, puntos: cubos.map(c => ({ ...c, facturado: r2(c.facturado), cobrado: r2(c.cobrado), gastos: r2(c.gastos), resultado: r2(c.facturado - c.gastos) })) }
}

const trimestreDe = (f: string) => `${f.slice(0, 4)}-T${Math.floor((Number(f.slice(5, 7)) - 1) / 3) + 1}`

/**
 * Calcula el informe completo del periodo. `todo` son los datos cargados
 * (pueden venir de más fechas: se filtra aquí). `hoy` para vencimientos.
 */
export function calcularInforme(todo: DatosInforme, p: Periodo, hoy: string, opts: { cliente?: string | null } = {}) {
    const deCliente = (x: any) => !opts.cliente || x.cliente_id === opts.cliente || x.cliente_razon_social === opts.cliente
    const facturasTodas = todo.facturas.filter(f => !f.anulada && deCliente(f))
    const facturas = facturasTodas.filter(f => enRango(f.fecha, p))
    const idsFac = new Set(facturasTodas.map(f => f.id))
    const cobros = todo.cobros.filter(c => (c.estado || 'confirmado') === 'confirmado' && enRango(c.fecha, p) && (!opts.cliente || idsFac.has(c.factura_id)))
    const gastos = opts.cliente ? [] : todo.gastos.filter(g => enRango(g.fecha, p))
    const presupuestos = todo.presupuestos.filter(x => enRango(x.fecha, p) && deCliente(x))
    const albaranes = todo.albaranes.filter(x => enRango(x.fecha, p) && deCliente(x))

    const facturadoBase = facturas.reduce((a, f) => a + base(f), 0)
    const facturadoTotal = facturas.reduce((a, f) => a + n(f.total), 0)
    const cobrado = cobros.reduce((a, c) => a + n(c.importe), 0)
    const gastosBase = gastos.reduce((a, g) => a + base(g), 0)
    const gastosTotal = gastos.reduce((a, g) => a + n(g.total), 0)

    // Deuda viva a hoy (independiente del periodo): antigüedad de saldos
    const pendientes = facturasTodas.map(f => ({ ...f, pendiente: r2(Math.max(0, n(f.total) - n(f.importe_cobrado))) })).filter(f => f.pendiente > 0.009 && f.estado_cobro !== 'pagada')
    const tramos = [
        { id: 'al_dia', etiqueta: 'Sin vencer', importe: 0, num: 0 },
        { id: '1_30', etiqueta: '1–30 días', importe: 0, num: 0 },
        { id: '31_60', etiqueta: '31–60 días', importe: 0, num: 0 },
        { id: '61_90', etiqueta: '61–90 días', importe: 0, num: 0 },
        { id: '90', etiqueta: 'Más de 90 días', importe: 0, num: 0 },
    ]
    for (const f of pendientes) {
        const venc = f.fecha_vencimiento || f.fecha
        const dias = Math.floor((new Date(hoy).getTime() - new Date(String(venc).slice(0, 10)).getTime()) / 86400000)
        const t = dias <= 0 ? 0 : dias <= 30 ? 1 : dias <= 60 ? 2 : dias <= 90 ? 3 : 4
        tramos[t].importe += f.pendiente; tramos[t].num++
    }
    tramos.forEach(t => { t.importe = r2(t.importe) })
    const pendienteTotal = r2(pendientes.reduce((a, f) => a + f.pendiente, 0))
    const vencido = r2(tramos.slice(1).reduce((a, t) => a + t.importe, 0))

    // Días medios de cobro de las facturas cobradas del periodo
    const fechaFac = new Map(facturasTodas.map(f => [f.id, f.fecha]))
    const plazos = cobros.map(c => fechaFac.get(c.factura_id) ? (new Date(c.fecha).getTime() - new Date(fechaFac.get(c.factura_id)).getTime()) / 86400000 : null).filter((x): x is number => x != null && x >= 0)
    const diasMedioCobro = plazos.length ? Math.round(plazos.reduce((a, b) => a + b, 0) / plazos.length) : null

    // Ventas por concepto (líneas de factura)
    const lineas = facturas.flatMap(f => (Array.isArray(f.lineas) ? f.lineas : []).map((l: any) => ({ d: String(l.descripcion || '').split('\n')[0].trim().slice(0, 80), imp: n(l.cantidad) * n(l.precio_unitario), cant: n(l.cantidad) })))
    const porConcepto = agrupar(lineas, l => l.d, l => l.imp).slice(0, 15)

    // IVA por trimestre
    const ivaMap = new Map<string, { trimestre: string; repercutido: number; soportado: number; baseVentas: number; baseCompras: number }>()
    const iva = (k: string) => ivaMap.get(k) || ivaMap.set(k, { trimestre: k, repercutido: 0, soportado: 0, baseVentas: 0, baseCompras: 0 }).get(k)!
    for (const f of facturas) { const e = iva(trimestreDe(f.fecha)); e.repercutido += n(f.iva_importe); e.baseVentas += base(f) }
    for (const g of gastos) { const e = iva(trimestreDe(g.fecha)); e.soportado += n(g.iva_importe); e.baseCompras += base(g) }
    const ivaTrimestres = [...ivaMap.values()].sort((a, b) => a.trimestre.localeCompare(b.trimestre)).map(e => ({ ...e, repercutido: r2(e.repercutido), soportado: r2(e.soportado), baseVentas: r2(e.baseVentas), baseCompras: r2(e.baseCompras), resultado: r2(e.repercutido - e.soportado) }))

    // Presupuestos: conversión
    const aceptado = (x: any) => x.aceptado === true || (x.statuses || []).includes('traspasado')
    const rechazado = (x: any) => x.rechazado === true
    const presAceptados = presupuestos.filter(aceptado), presRechazados = presupuestos.filter(rechazado)
    const presAbiertos = presupuestos.filter(x => !aceptado(x) && !rechazado(x))
    const presCaducados = presAbiertos.filter(x => x.fecha_validez && x.fecha_validez < hoy)

    // Albaranes: pendientes de facturar y firma
    const albFacturado = (a: any) => !!a.factura_id || (a.statuses || []).includes('traspasado')
    const albPendFacturar = albaranes.filter(a => !albFacturado(a))

    return {
        periodo: p,
        kpis: {
            facturadoBase: r2(facturadoBase), facturadoTotal: r2(facturadoTotal), numFacturas: facturas.length,
            ticketMedio: facturas.length ? r2(facturadoBase / facturas.length) : 0,
            cobrado: r2(cobrado), gastosBase: r2(gastosBase), gastosTotal: r2(gastosTotal),
            resultado: r2(facturadoBase - gastosBase),
            margen: facturadoBase ? Math.round(((facturadoBase - gastosBase) / facturadoBase) * 1000) / 10 : null,
            pendienteCobro: pendienteTotal, vencido, diasMedioCobro,
            ivaRepercutido: r2(facturas.reduce((a, f) => a + n(f.iva_importe), 0)),
            ivaSoportado: r2(gastos.reduce((a, g) => a + n(g.iva_importe), 0)),
        },
        serie: serie(p, facturas, cobros, gastos),
        ventasPorCliente: agrupar(facturas, f => f.cliente_razon_social, f => base(f)),
        porConcepto,
        cobrosPorMetodo: agrupar(cobros, c => c.metodo || 'Sin indicar', c => n(c.importe)),
        antiguedad: tramos,
        deudores: agrupar(pendientes, f => f.cliente_razon_social, f => f.pendiente).slice(0, 15),
        facturasPendientes: pendientes.sort((a, b) => String(a.fecha_vencimiento || a.fecha).localeCompare(String(b.fecha_vencimiento || b.fecha))).slice(0, 50)
            .map(f => ({ id: f.id, numero: f.numero, cliente: f.cliente_razon_social, fecha: f.fecha, vencimiento: f.fecha_vencimiento, total: n(f.total), pendiente: f.pendiente })),
        gastosPorCategoria: agrupar(gastos, g => g.categoria, g => base(g)),
        gastosPorProveedor: agrupar(gastos, g => g.proveedor, g => base(g)).slice(0, 15),
        ivaTrimestres,
        presupuestos: {
            num: presupuestos.length, importe: r2(presupuestos.reduce((a, x) => a + base(x), 0)),
            aceptados: presAceptados.length, importeAceptado: r2(presAceptados.reduce((a, x) => a + base(x), 0)),
            rechazados: presRechazados.length, abiertos: presAbiertos.length, importeAbierto: r2(presAbiertos.reduce((a, x) => a + base(x), 0)),
            caducados: presCaducados.length,
            conversion: presupuestos.length ? Math.round((presAceptados.length / presupuestos.length) * 1000) / 10 : null,
            abiertosLista: presAbiertos.slice(0, 30).map(x => ({ id: x.id, numero: x.numero, cliente: x.cliente_razon_social, fecha: x.fecha, validez: x.fecha_validez, importe: base(x) })),
        },
        albaranes: {
            num: albaranes.length, importe: r2(albaranes.reduce((a, x) => a + base(x), 0)),
            pendientesFacturar: albPendFacturar.length, importePendienteFacturar: r2(albPendFacturar.reduce((a, x) => a + base(x), 0)),
            sinFirma: albaranes.filter(a => !a.firmado_at).length,
            pendientesLista: albPendFacturar.slice(0, 30).map(x => ({ id: x.id, numero: x.numero, cliente: x.cliente_razon_social, fecha: x.fecha, importe: base(x), firmado: !!x.firmado_at })),
        },
    }
}

export type Informe = ReturnType<typeof calcularInforme>

/** Variación en % entre dos cifras (null si no tiene sentido). */
export function variacion(actual: number, anterior: number): number | null {
    if (!anterior) return actual ? null : 0
    return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10
}

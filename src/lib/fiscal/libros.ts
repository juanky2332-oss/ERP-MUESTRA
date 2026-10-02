/**
 * Libros registro de IVA y paquete para el asesor (funciones puras).
 *
 * - Libro de facturas expedidas (art. 63 RIVA, RD 1624/1992): número y serie,
 *   fecha, destinatario y NIF, base imponible, tipo, cuota y total.
 * - Libro de facturas recibidas (art. 64 RIVA): se numeran CORRELATIVAMENTE
 *   por orden de fecha (nº de registro), con proveedor, NIF, base, tipo, cuota.
 * - Requisitos de la factura completa: art. 6 RD 1619/2012 (Reglamento de
 *   facturación). La deducción del IVA soportado exige factura completa con
 *   NIF del proveedor (arts. 97 y 99 LIVA).
 * - Cálculos de 303/111/115/130/347 ORIENTATIVOS: los cierra el asesor.
 *
 * La misma función alimenta la pantalla, el PDF resumen, el Excel y la
 * estructura de carpetas: los números de orden coinciden en todas partes.
 */
import { periodoFiscal, type PeriodoFiscal, type Regimen } from './calendario.ts'

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
const enRango = (f: any, desde: string, hasta: string) => { const s = String(f || '').slice(0, 10); return !!s && s >= desde && s <= hasta }
const fecha10 = (f: any) => String(f || '').slice(0, 10)

/** Nombre válido para archivo/carpeta en Windows, macOS y ZIP. */
export function nombreSeguro(s: string, max = 80, final = true): string {
    const corto = String(s || '')
        .normalize('NFC')
        .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
        .trim()
    // Windows no admite nombres que acaben en punto o espacio: solo importa al final del nombre completo.
    return (final ? corto.replace(/[. ]+$/g, '') : corto) || 'SIN NOMBRE'
}

const pad3 = (i: number) => String(i).padStart(3, '0')
const nifLimpio = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** FAC-01-2026 → { serie: 'FAC', secuencia: 1, anio: 2026 } */
export function analizarNumero(numero: string): { serie: string; secuencia: number; anio: number } | null {
    const m = /^(.*?)[-/ ]?(\d+)[-/](\d{4})$/.exec(String(numero || '').trim())
    if (!m) return null
    return { serie: (m[1] || '').replace(/[-/ ]+$/, '') || 'GENERAL', secuencia: parseInt(m[2], 10), anio: parseInt(m[3], 10) }
}

/** "G-01-2026 / F-2026-123" → interno y nº del proveedor ("S/N" = sin número). */
export function numerosGasto(numero: string): { interno: string; proveedor: string } {
    const s = String(numero || '')
    const i = s.indexOf(' / ')
    if (i < 0) return { interno: s, proveedor: '' }
    const prov = s.slice(i + 3).trim()
    return { interno: s.slice(0, i).trim(), proveedor: /^s\/?n$/i.test(prov) ? '' : prov }
}

const baseDe = (d: any) => d.base_imponible != null && d.base_imponible !== '' ? n(d.base_imponible)
    : d.subtotal != null && d.subtotal !== '' ? n(d.subtotal) : n(d.total) - n(d.iva_importe)

export const TIPOS_IVA_VIGENTES = [0, 4, 5, 10, 21]
const PROVEEDOR_SIN_IDENTIFICAR = /^(varios|revisar|pendiente|proveedor pendiente.*|sin proveedor)$/i

export interface Emitida {
    orden: number
    id: string
    numero: string
    serie: string
    fecha: string
    cliente: string
    nif: string
    base: number
    tipoIva: number
    cuota: number
    total: number
    estado: 'emitida' | 'anulada' | 'rectificativa'
    /** Las anuladas se listan (la numeración no puede tener huecos) pero no suman. */
    computa: boolean
    archivo: string
}

export interface Recibida {
    orden: number
    id: string
    numeroInterno: string
    numeroProveedor: string
    fecha: string
    proveedor: string
    nif: string
    concepto: string
    categoria: string
    base: number
    tipoIva: number
    cuota: number
    tipoRetencion: number
    retencion: number
    total: number
    modeloRetencion: '111' | '115' | null
    tieneDocumento: boolean
    documento: string | null
    /** Nombre del PDF en la carpeta (null si no hay documento original). */
    archivo: string | null
}

export interface Anomalia { nivel: 'error' | 'aviso'; texto: string; ref?: string }

export interface Tercero { clave: string; nombre: string; nif: string; num: number; base: number; cuota: number; retencion: number; total: number }

export interface Datos {
    /** Facturas emitidas del 1 de enero del año del periodo hasta su fin (para huecos y acumulados). */
    facturas: any[]
    /** Gastos (facturas recibidas) del 1 de enero del año del periodo hasta su fin. */
    gastos: any[]
}

function agrupar<T>(lista: T[], clave: (x: T) => { clave: string; nombre: string; nif: string }, valores: (x: T) => { base: number; cuota: number; retencion: number; total: number }): Tercero[] {
    const m = new Map<string, Tercero>()
    for (const x of lista) {
        const k = clave(x)
        const v = valores(x)
        const e = m.get(k.clave) || { clave: k.clave, nombre: k.nombre, nif: k.nif, num: 0, base: 0, cuota: 0, retencion: 0, total: 0 }
        e.num++; e.base += v.base; e.cuota += v.cuota; e.retencion += v.retencion; e.total += v.total
        if (!e.nif && k.nif) e.nif = k.nif
        m.set(k.clave, e)
    }
    return [...m.values()].map(e => ({ ...e, base: r2(e.base), cuota: r2(e.cuota), retencion: r2(e.retencion), total: r2(e.total) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

const claveTercero = (nombre: string, nif: string) => (nif ? nif : 'SN:' + nombre.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, ''))

/** Carpeta de un cliente/proveedor: "EMPRESA A (B11111111)". */
export const carpetaTercero = (nombre: string, nif: string) => nombreSeguro(nif ? `${nombre} (${nif})` : nombre, 70)

function aEmitidas(facturas: any[]): Emitida[] {
    const orden = [...facturas].sort((a, b) => fecha10(a.fecha).localeCompare(fecha10(b.fecha))
        || ((analizarNumero(a.numero)?.secuencia ?? 0) - (analizarNumero(b.numero)?.secuencia ?? 0))
        || String(a.numero).localeCompare(String(b.numero)))
    return orden.map((f, i) => {
        const anulada = !!f.anulada
        const rect = !!f.rectifica_factura_id || n(f.total) < 0
        const cliente = String(f.cliente_razon_social || 'SIN CLIENTE').trim()
        const numero = String(f.numero || 'SIN-NUMERO')
        const fecha = fecha10(f.fecha)
        return {
            orden: i + 1,
            id: f.id,
            numero,
            serie: f.serie || analizarNumero(numero)?.serie || '',
            fecha,
            cliente,
            nif: nifLimpio(f.cliente_cif),
            base: r2(baseDe(f)),
            tipoIva: n(f.iva_porcentaje),
            cuota: r2(n(f.iva_importe)),
            total: r2(n(f.total)),
            estado: anulada ? 'anulada' : rect ? 'rectificativa' : 'emitida',
            computa: !anulada,
            archivo: `${pad3(i + 1)}_${fecha}_${nombreSeguro(numero, 30, false)}_${nombreSeguro(cliente, 50, false)}${anulada ? '_ANULADA' : ''}.pdf`,
        }
    })
}

function aRecibidas(gastos: any[]): Recibida[] {
    const orden = [...gastos].sort((a, b) => fecha10(a.fecha).localeCompare(fecha10(b.fecha)) || String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.numero).localeCompare(String(b.numero)))
    return orden.map((g, i) => {
        const nums = numerosGasto(g.numero)
        const proveedor = String(g.proveedor || 'SIN PROVEEDOR').trim()
        const categoria = String(g.categoria || '').trim()
        const retencion = r2(n(g.retencion_importe))
        const documento = g.archivo_url || g.factura_url || g.url_archivo || null
        const fecha = fecha10(g.fecha)
        return {
            orden: i + 1,
            id: g.id,
            numeroInterno: nums.interno,
            numeroProveedor: nums.proveedor,
            fecha,
            proveedor,
            nif: nifLimpio(g.proveedor_cif),
            concepto: String(g.concepto || g.descripcion || '').trim(),
            categoria,
            base: r2(baseDe(g)),
            tipoIva: n(g.iva_porcentaje),
            cuota: r2(n(g.iva_importe)),
            tipoRetencion: n(g.retencion_porcentaje),
            retencion,
            total: r2(n(g.total)),
            modeloRetencion: retencion > 0 ? (/alquiler|arrendamiento/i.test(categoria) ? '115' : '111') : null,
            tieneDocumento: !!documento,
            documento,
            archivo: documento ? `${pad3(i + 1)}_${fecha}_${nombreSeguro(proveedor, 50, false)}_${nombreSeguro(nums.proveedor || nums.interno || 'SN', 30)}.pdf` : null,
        }
    })
}

function huecosYOrden(facturasAnio: any[], hasta: string): Anomalia[] {
    const out: Anomalia[] = []
    const series = new Map<string, { seq: number; fecha: string; numero: string }[]>()
    for (const f of facturasAnio) {
        if (fecha10(f.fecha) > hasta) continue
        const a = analizarNumero(f.numero)
        if (!a) { out.push({ nivel: 'aviso', texto: `La factura «${f.numero}» no sigue el formato de numeración SERIE-NÚMERO-AÑO: revisa que la serie sea correlativa.`, ref: f.numero }); continue }
        const k = `${a.serie}|${a.anio}`
        if (!series.has(k)) series.set(k, [])
        series.get(k)!.push({ seq: a.secuencia, fecha: fecha10(f.fecha), numero: f.numero })
    }
    for (const [k, lista] of series) {
        const [serie, anio] = k.split('|')
        const usados = new Set(lista.map(x => x.seq))
        const max = Math.max(...lista.map(x => x.seq))
        const faltan: number[] = []
        for (let i = 1; i <= max; i++) if (!usados.has(i)) faltan.push(i)
        if (faltan.length) {
            out.push({ nivel: 'error', texto: `Huecos en la numeración de la serie ${serie} de ${anio}: falta${faltan.length > 1 ? 'n' : ''} el nº ${faltan.slice(0, 20).join(', ')}${faltan.length > 20 ? '…' : ''}. La numeración debe ser correlativa (art. 6.1.a RD 1619/2012); si una factura se anuló, debe constar como anulada o rectificada, no desaparecer.` })
        }
        const contados = new Map<number, number>()
        for (const x of lista) contados.set(x.seq, (contados.get(x.seq) || 0) + 1)
        const repetidos = [...contados].filter(([, c]) => c > 1).map(([s]) => s)
        if (repetidos.length) out.push({ nivel: 'error', texto: `Números repetidos en la serie ${serie} de ${anio}: ${repetidos.join(', ')}.` })
        const ord = [...lista].sort((a, b) => a.seq - b.seq)
        for (let i = 1; i < ord.length; i++) {
            if (ord[i].fecha < ord[i - 1].fecha) {
                out.push({ nivel: 'aviso', texto: `${ord[i].numero} (${ord[i].fecha}) tiene fecha anterior a ${ord[i - 1].numero} (${ord[i - 1].fecha}): dentro de una serie, a mayor número no puede corresponder una fecha anterior.`, ref: ord[i].numero })
            }
        }
    }
    return out
}

function anomaliasEmitidas(emitidas: Emitida[]): Anomalia[] {
    const out: Anomalia[] = []
    for (const e of emitidas) {
        if (!e.computa) continue
        if (!e.nif) out.push({ nivel: 'error', texto: `${e.numero} (${e.cliente}) no tiene NIF del cliente: una factura completa debe incluirlo (art. 6.1.d RD 1619/2012).`, ref: e.numero })
        if (Math.abs(r2(e.base + e.cuota) - e.total) > 0.02) out.push({ nivel: 'aviso', texto: `${e.numero}: base (${e.base}) + IVA (${e.cuota}) no cuadra con el total (${e.total}).`, ref: e.numero })
        if (!TIPOS_IVA_VIGENTES.includes(e.tipoIva)) out.push({ nivel: 'aviso', texto: `${e.numero}: tipo de IVA ${e.tipoIva} % no habitual (vigentes: 21, 10, 5, 4 y 0 %).`, ref: e.numero })
        if (e.tipoIva === 0 && e.base > 0) out.push({ nivel: 'aviso', texto: `${e.numero} va sin IVA: la factura debe indicar la causa de exención o inversión del sujeto pasivo (art. 6.1.j RD 1619/2012).`, ref: e.numero })
    }
    return out
}

function anomaliasRecibidas(recibidas: Recibida[]): Anomalia[] {
    const out: Anomalia[] = []
    const vistos = new Map<string, Recibida>()
    for (const r of recibidas) {
        const ref = r.numeroInterno || `#${r.orden}`
        if (PROVEEDOR_SIN_IDENTIFICAR.test(r.proveedor)) out.push({ nivel: 'error', texto: `${ref}: proveedor sin identificar («${r.proveedor}»).`, ref })
        if (!r.nif) out.push({ nivel: 'aviso', texto: `${ref} (${r.proveedor}) sin NIF del proveedor: sin él el IVA soportado (${r.cuota.toFixed(2)} €) puede no ser deducible (art. 97 LIVA).`, ref })
        if (!r.tieneDocumento) out.push({ nivel: 'aviso', texto: `${ref} (${r.proveedor}) no tiene la factura original adjunta en el ERP: pídela o súbela antes de entregarla.`, ref })
        if (!r.numeroProveedor) out.push({ nivel: 'aviso', texto: `${ref} (${r.proveedor}) sin el número de factura del proveedor.`, ref })
        const t1 = Math.abs(r2(r.base + r.cuota) - r.total), t2 = Math.abs(r2(r.base + r.cuota - r.retencion) - r.total)
        if (t1 > 0.02 && t2 > 0.02) out.push({ nivel: 'aviso', texto: `${ref}: base + IVA${r.retencion ? ' − retención' : ''} no cuadra con el total (${r.total}).`, ref })
        if (r.numeroProveedor) {
            const k = `${r.nif || r.proveedor.toUpperCase()}|${r.numeroProveedor.toUpperCase()}`
            const prev = vistos.get(k)
            if (prev) out.push({ nivel: 'error', texto: `Posible factura duplicada: ${prev.numeroInterno} y ${ref} son la misma factura ${r.numeroProveedor} de ${r.proveedor}.`, ref })
            else vistos.set(k, r)
        }
    }
    return out
}

/** Pagos fraccionados del 130 (autónomos, estimación directa) acumulados del año. ORIENTATIVO. */
function calcular130(facturasAnio: any[], gastosAnio: any[], anio: number, hastaTrimestre: number) {
    const pagos: { trimestre: number; ingresos: number; gastos: number; rendimiento: number; veintePorCiento: number; pagosAnteriores: number; resultado: number }[] = []
    let acumuladoPagado = 0
    for (let q = 1; q <= hastaTrimestre; q++) {
        const hasta = periodoFiscal(`${anio}-${q}T`)!.hasta
        const ingresos = r2(facturasAnio.filter(f => !f.anulada && fecha10(f.fecha) <= hasta).reduce((a, f) => a + baseDe(f), 0))
        const gastos = r2(gastosAnio.filter(g => fecha10(g.fecha) <= hasta).reduce((a, g) => a + baseDe(g), 0))
        const rendimiento = r2(ingresos - gastos)
        const veinte = r2(Math.max(0, rendimiento) * 0.2)
        const resultado = r2(Math.max(0, veinte - acumuladoPagado))
        pagos.push({ trimestre: q, ingresos, gastos, rendimiento, veintePorCiento: veinte, pagosAnteriores: r2(acumuladoPagado), resultado })
        acumuladoPagado += resultado
    }
    return pagos
}

export const UMBRAL_347 = 3005.06

/** Calcula todo lo del periodo. `datos` debe venir del 1/1 del año del periodo hasta su fin. */
export function calcularLibros(datos: Datos, periodo: PeriodoFiscal, opts: { regimen?: Regimen } = {}) {
    const { desde, hasta } = periodo
    const facturasAnio = datos.facturas.filter(f => enRango(f.fecha, `${periodo.anio}-01-01`, hasta))
    const gastosAnio = datos.gastos.filter(g => enRango(g.fecha, `${periodo.anio}-01-01`, hasta))
    const emitidas = aEmitidas(facturasAnio.filter(f => enRango(f.fecha, desde, hasta)))
    const recibidas = aRecibidas(gastosAnio.filter(g => enRango(g.fecha, desde, hasta)))
    const computan = emitidas.filter(e => e.computa)

    const suma = <T>(l: T[], f: (x: T) => number) => r2(l.reduce((a, x) => a + f(x), 0))
    const totales = {
        emitidas: { num: emitidas.length, anuladas: emitidas.length - computan.length, base: suma(computan, e => e.base), cuota: suma(computan, e => e.cuota), total: suma(computan, e => e.total) },
        recibidas: { num: recibidas.length, sinDocumento: recibidas.filter(r => !r.tieneDocumento).length, base: suma(recibidas, r => r.base), cuota: suma(recibidas, r => r.cuota), retencion: suma(recibidas, r => r.retencion), total: suma(recibidas, r => r.total) },
    }

    // Desglose por tipo de IVA (casillas del 303 por tipo)
    const porTipo = (l: { tipoIva: number; base: number; cuota: number }[]) => {
        const m = new Map<number, { tipo: number; base: number; cuota: number; num: number }>()
        for (const x of l) { const e = m.get(x.tipoIva) || { tipo: x.tipoIva, base: 0, cuota: 0, num: 0 }; e.base += x.base; e.cuota += x.cuota; e.num++; m.set(x.tipoIva, e) }
        return [...m.values()].map(e => ({ ...e, base: r2(e.base), cuota: r2(e.cuota) })).sort((a, b) => b.tipo - a.tipo)
    }
    const ivaPorTipo = { repercutido: porTipo(computan), soportado: porTipo(recibidas) }

    const modelo303 = {
        devengado: totales.emitidas.cuota,
        deducible: totales.recibidas.cuota,
        resultado: r2(totales.emitidas.cuota - totales.recibidas.cuota),
    }

    const ret = (m: '111' | '115') => { const l = recibidas.filter(r => r.modeloRetencion === m); return { num: l.length, perceptores: new Set(l.map(r => r.nif || r.proveedor)).size, base: suma(l, r => r.base), retencion: suma(l, r => r.retencion) } }
    const retenciones = { m111: ret('111'), m115: ret('115') }

    const porCliente = agrupar(computan, e => ({ clave: claveTercero(e.cliente, e.nif), nombre: e.cliente, nif: e.nif }), e => ({ base: e.base, cuota: e.cuota, retencion: 0, total: e.total }))
    const porProveedor = agrupar(recibidas, r => ({ clave: claveTercero(r.proveedor, r.nif), nombre: r.proveedor, nif: r.nif }), r => ({ base: r.base, cuota: r.cuota, retencion: r.retencion, total: r.total }))

    // Por mes
    const meses = new Map<string, { mes: string; baseVentas: number; ivaVentas: number; baseCompras: number; ivaCompras: number }>()
    const mes = (k: string) => meses.get(k) || meses.set(k, { mes: k, baseVentas: 0, ivaVentas: 0, baseCompras: 0, ivaCompras: 0 }).get(k)!
    for (const e of computan) { const m = mes(e.fecha.slice(0, 7)); m.baseVentas += e.base; m.ivaVentas += e.cuota }
    for (const r of recibidas) { const m = mes(r.fecha.slice(0, 7)); m.baseCompras += r.base; m.ivaCompras += r.cuota }
    const porMes = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map(m => ({ mes: m.mes, baseVentas: r2(m.baseVentas), ivaVentas: r2(m.ivaVentas), baseCompras: r2(m.baseCompras), ivaCompras: r2(m.ivaCompras) }))

    // 130 (autónomos)
    const modelo130 = opts.regimen === 'autonomo' && periodo.tipo !== 'mes'
        ? calcular130(facturasAnio, gastosAnio, periodo.anio, periodo.tipo === 'anual' ? 4 : Number(periodo.clave.slice(5, 6)))
        : null

    // 347 (solo en el resumen anual): IVA incluido, por trimestres; fuera las operaciones con retención (van en 190/180).
    let modelo347: { clientes: (Tercero & { trimestres: number[] })[]; proveedores: (Tercero & { trimestres: number[] })[] } | null = null
    if (periodo.tipo === 'anual') {
        const conTrimestres = <T extends { fecha: string; total: number }>(lista: T[], clave: (x: T) => { clave: string; nombre: string; nif: string }) => {
            const m = new Map<string, Tercero & { trimestres: number[] }>()
            for (const x of lista) {
                const k = clave(x)
                const e = m.get(k.clave) || { ...k, num: 0, base: 0, cuota: 0, retencion: 0, total: 0, trimestres: [0, 0, 0, 0] }
                e.num++; e.total += x.total
                e.trimestres[Math.floor((Number(x.fecha.slice(5, 7)) - 1) / 3)] += x.total
                m.set(k.clave, e)
            }
            return [...m.values()].map(e => ({ ...e, total: r2(e.total), trimestres: e.trimestres.map(r2) })).filter(e => Math.abs(e.total) > UMBRAL_347).sort((a, b) => b.total - a.total)
        }
        modelo347 = {
            clientes: conTrimestres(computan, e => ({ clave: claveTercero(e.cliente, e.nif), nombre: e.cliente, nif: e.nif })),
            proveedores: conTrimestres(recibidas.filter(r => !r.retencion), r => ({ clave: claveTercero(r.proveedor, r.nif), nombre: r.proveedor, nif: r.nif })),
        }
    }

    const anomalias: Anomalia[] = [
        ...huecosYOrden(facturasAnio, hasta),
        ...anomaliasEmitidas(emitidas),
        ...anomaliasRecibidas(recibidas),
        ...gastosAnio.filter(g => enRango(g.fecha, desde, hasta) && g.revisado === false).map(g => ({ nivel: 'aviso' as const, texto: `${numerosGasto(g.numero).interno || 'Gasto'} (${g.proveedor}) leído automáticamente y aún sin revisar: comprueba importes antes de entregarlo.`, ref: numerosGasto(g.numero).interno })),
    ]

    return { periodo, emitidas, recibidas, totales, ivaPorTipo, modelo303, retenciones, porCliente, porProveedor, porMes, modelo130, modelo347, anomalias }
}

export type Libros = ReturnType<typeof calcularLibros>

// ---------- Estructura de la carpeta para el asesor ----------

export type OrigenArchivo =
    | { tipo: 'emitida'; id: string }
    | { tipo: 'recibida'; id: string }
    | { tipo: 'resumen' }
    | { tipo: 'libros' }
    | { tipo: 'texto'; contenido: string }

export interface ArchivoPaquete { ruta: string; origen: OrigenArchivo }

export const CARPETAS = {
    emitidas: '01_FACTURAS_EMITIDAS',
    recibidas: '02_FACTURAS_RECIBIDAS',
    clientes: '03_POR_CLIENTE',
    proveedores: '04_POR_PROVEEDOR',
}

/** Nombre de la carpeta raíz del periodo: «EMPRESA X - Facturas 2026-3T (julio a septiembre)». */
export const carpetaRaiz = (empresa: string, p: PeriodoFiscal) => nombreSeguro(`${empresa} - Facturas ${p.carpeta}`, 120)

export function nombreResumen(p: PeriodoFiscal) { return `00_RESUMEN_${p.clave}.pdf` }
export function nombreLibros(p: PeriodoFiscal) { return `00_LIBROS_REGISTRO_${p.clave}.xlsx` }

/**
 * Todos los archivos del paquete con su ruta relativa a la carpeta raíz.
 * Cada factura aparece una vez por fecha y otra vez dentro de su cliente o
 * proveedor (mismo nombre y número de orden, para cruzarlas fácilmente).
 */
export function estructuraPaquete(libros: Libros, empresa: string, generado: string): ArchivoPaquete[] {
    const p = libros.periodo
    const out: ArchivoPaquete[] = [
        { ruta: nombreResumen(p), origen: { tipo: 'resumen' } },
        { ruta: nombreLibros(p), origen: { tipo: 'libros' } },
    ]
    for (const e of libros.emitidas) {
        out.push({ ruta: `${CARPETAS.emitidas}/${e.archivo}`, origen: { tipo: 'emitida', id: e.id } })
        out.push({ ruta: `${CARPETAS.clientes}/${carpetaTercero(e.cliente, e.nif)}/${e.archivo}`, origen: { tipo: 'emitida', id: e.id } })
    }
    for (const r of libros.recibidas) {
        if (!r.archivo) continue
        out.push({ ruta: `${CARPETAS.recibidas}/${r.archivo}`, origen: { tipo: 'recibida', id: r.id } })
        out.push({ ruta: `${CARPETAS.proveedores}/${carpetaTercero(r.proveedor, r.nif)}/${r.archivo}`, origen: { tipo: 'recibida', id: r.id } })
    }
    out.push({ ruta: 'LEEME.txt', origen: { tipo: 'texto', contenido: textoLeeme(libros, empresa, generado) } })
    return out
}

const eur = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export function textoLeeme(l: Libros, empresa: string, generado: string): string {
    const p = l.periodo
    const sinDoc = l.recibidas.filter(r => !r.tieneDocumento)
    const lineas = [
        `${empresa}`,
        `Documentación de facturas · ${p.etiqueta}`,
        `Del ${p.desde.split('-').reverse().join('/')} al ${p.hasta.split('-').reverse().join('/')} · generado el ${generado}`,
        '',
        'CONTENIDO',
        `  ${nombreResumen(p)}  Resumen completo: totales, IVA por tipo, libros registro, por cliente/proveedor y avisos.`,
        `  ${nombreLibros(p)}  Libros registro de facturas expedidas y recibidas en Excel (para importar).`,
        `  ${CARPETAS.emitidas}/  ${l.emitidas.length} facturas emitidas, numeradas por orden de fecha (001, 002…).`,
        `  ${CARPETAS.recibidas}/  ${l.recibidas.length - sinDoc.length} facturas recibidas; el número inicial es el nº de registro del libro de recibidas.`,
        `  ${CARPETAS.clientes}/  Las mismas facturas emitidas agrupadas por cliente.`,
        `  ${CARPETAS.proveedores}/  Las mismas facturas recibidas agrupadas por proveedor.`,
        '',
        'TOTALES',
        `  Emitidas:  base ${eur(l.totales.emitidas.base)} · IVA ${eur(l.totales.emitidas.cuota)} · total ${eur(l.totales.emitidas.total)}`,
        `  Recibidas: base ${eur(l.totales.recibidas.base)} · IVA ${eur(l.totales.recibidas.cuota)} · total ${eur(l.totales.recibidas.total)}`,
        `  IVA repercutido − soportado (orientativo): ${eur(l.modelo303.resultado)}`,
    ]
    if (sinDoc.length) {
        lineas.push('', `FACTURAS RECIBIDAS SIN DOCUMENTO ORIGINAL EN EL ERP (${sinDoc.length}) — figuran en los libros pero no hay PDF:`)
        for (const r of sinDoc) lineas.push(`  ${String(r.orden).padStart(3, '0')} · ${r.fecha} · ${r.proveedor} · ${r.numeroProveedor || r.numeroInterno} · ${eur(r.total)}`)
    }
    if (l.anomalias.length) {
        lineas.push('', `AVISOS A REVISAR (${l.anomalias.length}) — detalle en el PDF resumen.`)
    }
    lineas.push('', 'Las cifras de modelos son orientativas; la liquidación definitiva la realiza el asesor.')
    return lineas.join('\r\n')
}

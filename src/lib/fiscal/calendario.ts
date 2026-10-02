/**
 * Calendario fiscal (AEAT) del ERP — funciones puras, sin base de datos.
 * Lo usan la sección Fiscal, el aviso del Inicio y el cron de Telegram.
 *
 * Plazos de presentación en vía voluntaria (Orden HAC/1398/2003 y órdenes de
 * cada modelo; art. 71 RIVA para el IVA):
 *  - Trimestrales (303, 349, 130, 111, 115): del 1 al 20 de abril, julio y
 *    octubre. 4º trimestre: 303, 349 y 130 hasta el 30 de enero; 111 y 115
 *    hasta el 20 de enero.
 *  - Resúmenes anuales: 390 (1–30 enero), 190 y 180 (1–31 enero),
 *    347 (todo febrero).
 *  - Sociedades: 202 (1–20 de abril, octubre y diciembre) y 200 (25 días
 *    naturales tras los 6 meses del cierre: 1–25 de julio si el ejercicio
 *    coincide con el año natural).
 *  - Autónomos: Renta, modelo 100 (de abril al 30 de junio).
 * Si el último día cae en sábado, domingo o festivo nacional, el plazo se
 * traslada al primer día hábil siguiente (art. 30.5 Ley 39/2015, supletoria
 * en materia tributaria, disp. adic. 1ª).
 * Domiciliación bancaria: termina 5 días naturales antes (15 en lugar de 20)
 * y en la Renta el 25 de junio; se indica como nota.
 */

export type Regimen = 'sociedad' | 'autonomo'
export type IdModelo = '303' | '390' | '111' | '190' | '115' | '180' | '130' | '202' | '200' | '100' | '347' | '349'

export interface ConfigFiscal {
    regimen: Regimen
    /** Modelos que presenta la empresa (true/false). Los que no estén usan el valor por defecto del régimen. */
    modelos: Partial<Record<IdModelo, boolean>>
    /** Días antes del fin de plazo en los que empieza el aviso (por defecto 30). */
    dias_aviso: number
    /** Días que necesita el asesor: fecha recomendada de entrega = fin de plazo − margen. */
    dias_margen_asesor: number
}

export interface ModeloFiscal {
    id: IdModelo
    nombre: string
    descripcion: string
    regimenes: Regimen[]
    porDefecto: Record<Regimen, boolean>
    frecuencia: 'trimestral' | 'anual' | 'fraccionado'
}

export const MODELOS: ModeloFiscal[] = [
    { id: '303', nombre: 'Modelo 303 · IVA trimestral', descripcion: 'Autoliquidación del IVA repercutido menos el soportado deducible.', regimenes: ['sociedad', 'autonomo'], porDefecto: { sociedad: true, autonomo: true }, frecuencia: 'trimestral' },
    { id: '390', nombre: 'Modelo 390 · Resumen anual de IVA', descripcion: 'Resumen anual de los 303 del ejercicio.', regimenes: ['sociedad', 'autonomo'], porDefecto: { sociedad: true, autonomo: true }, frecuencia: 'anual' },
    { id: '111', nombre: 'Modelo 111 · Retenciones de trabajo y profesionales', descripcion: 'Solo si tienes trabajadores o pagas facturas de profesionales con retención de IRPF.', regimenes: ['sociedad', 'autonomo'], porDefecto: { sociedad: true, autonomo: false }, frecuencia: 'trimestral' },
    { id: '190', nombre: 'Modelo 190 · Resumen anual de retenciones', descripcion: 'Resumen anual del 111.', regimenes: ['sociedad', 'autonomo'], porDefecto: { sociedad: true, autonomo: false }, frecuencia: 'anual' },
    { id: '115', nombre: 'Modelo 115 · Retenciones de alquileres', descripcion: 'Solo si alquilas un local u oficina y retienes IRPF al arrendador.', regimenes: ['sociedad', 'autonomo'], porDefecto: { sociedad: false, autonomo: false }, frecuencia: 'trimestral' },
    { id: '180', nombre: 'Modelo 180 · Resumen anual de alquileres', descripcion: 'Resumen anual del 115.', regimenes: ['sociedad', 'autonomo'], porDefecto: { sociedad: false, autonomo: false }, frecuencia: 'anual' },
    { id: '130', nombre: 'Modelo 130 · Pago fraccionado de IRPF', descripcion: 'Autónomos en estimación directa (20 % del rendimiento acumulado). No obligatorio si el 70 % o más de tus ingresos ya llevan retención.', regimenes: ['autonomo'], porDefecto: { sociedad: false, autonomo: true }, frecuencia: 'trimestral' },
    { id: '100', nombre: 'Modelo 100 · Renta (IRPF anual)', descripcion: 'Declaración anual del autónomo.', regimenes: ['autonomo'], porDefecto: { sociedad: false, autonomo: true }, frecuencia: 'anual' },
    { id: '202', nombre: 'Modelo 202 · Pago fraccionado del Impuesto sobre Sociedades', descripcion: 'Obligatorio si la cuota del último Impuesto sobre Sociedades salió positiva.', regimenes: ['sociedad'], porDefecto: { sociedad: true, autonomo: false }, frecuencia: 'fraccionado' },
    { id: '200', nombre: 'Modelo 200 · Impuesto sobre Sociedades', descripcion: 'Declaración anual de la sociedad (ejercicio = año natural).', regimenes: ['sociedad'], porDefecto: { sociedad: true, autonomo: false }, frecuencia: 'anual' },
    { id: '347', nombre: 'Modelo 347 · Operaciones con terceros', descripcion: 'Clientes y proveedores con los que superas 3.005,06 € (IVA incluido) en el año.', regimenes: ['sociedad', 'autonomo'], porDefecto: { sociedad: true, autonomo: true }, frecuencia: 'anual' },
    { id: '349', nombre: 'Modelo 349 · Operaciones intracomunitarias', descripcion: 'Solo si compras o vendes a empresas de otros países de la UE.', regimenes: ['sociedad', 'autonomo'], porDefecto: { sociedad: false, autonomo: false }, frecuencia: 'trimestral' },
]

export const CONFIG_POR_DEFECTO: ConfigFiscal = { regimen: 'sociedad', modelos: {}, dias_aviso: 30, dias_margen_asesor: 10 }

/** Normaliza lo guardado en empresas.fiscal (puede venir vacío o incompleto). */
export function configFiscal(guardada?: Partial<ConfigFiscal> | null): ConfigFiscal {
    const g = guardada || {}
    const regimen: Regimen = g.regimen === 'autonomo' ? 'autonomo' : 'sociedad'
    const entero = (v: any, def: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : def }
    return {
        regimen,
        modelos: { ...(g.modelos || {}) },
        dias_aviso: entero(g.dias_aviso, CONFIG_POR_DEFECTO.dias_aviso, 1, 90),
        dias_margen_asesor: entero(g.dias_margen_asesor, CONFIG_POR_DEFECTO.dias_margen_asesor, 0, 30),
    }
}

export function modeloActivo(cfg: ConfigFiscal, id: IdModelo): boolean {
    const m = MODELOS.find(x => x.id === id)
    if (!m || !m.regimenes.includes(cfg.regimen)) return false
    return cfg.modelos[id] ?? m.porDefecto[cfg.regimen]
}

// ---------- Fechas ----------

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`
const finMes = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate()
const utc = (f: string) => new Date(f + 'T00:00:00Z')
const deUtc = (d: Date) => d.toISOString().slice(0, 10)
export const sumarDias = (f: string, n: number) => deUtc(new Date(utc(f).getTime() + n * 86400000))
export const diasEntre = (desde: string, hasta: string) => Math.round((utc(hasta).getTime() - utc(desde).getTime()) / 86400000)
export const fechaES = (f: string) => { const [a, b, c] = f.slice(0, 10).split('-'); return `${c}/${b}/${a}` }

/** Domingo de Pascua (algoritmo de Butcher/Meeus). */
function pascua(y: number): string {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
    return iso(y, mes, dia)
}

/** Festivos nacionales comunes a toda España (los autonómicos y locales no se tienen en cuenta). */
export function festivosNacionales(y: number): Set<string> {
    const fijos = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'].map(md => `${y}-${md}`)
    return new Set([...fijos, sumarDias(pascua(y), -2)]) // + Viernes Santo
}

export function esInhabil(f: string): boolean {
    const dia = utc(f).getUTCDay()
    return dia === 0 || dia === 6 || festivosNacionales(Number(f.slice(0, 4))).has(f)
}

/** Si el plazo acaba en inhábil, pasa al primer día hábil siguiente. */
export function ajustarAHabil(f: string): string {
    let x = f
    while (esInhabil(x)) x = sumarDias(x, 1)
    return x
}

// ---------- Periodos ----------

export type TipoPeriodo = 'trimestre' | 'anual' | 'mes'

export interface PeriodoFiscal {
    clave: string        // 2026-3T · 2026 · 2026-09
    tipo: TipoPeriodo
    anio: number
    desde: string
    hasta: string
    etiqueta: string     // 3er trimestre 2026 (julio a septiembre)
    carpeta: string      // 2026-3T (julio a septiembre)
}

const ORD = ['1er', '2º', '3er', '4º']

export function periodoFiscal(clave: string): PeriodoFiscal | null {
    let m = /^(\d{4})-([1-4])T$/.exec(clave)
    if (m) {
        const y = Number(m[1]), q = Number(m[2])
        const m1 = (q - 1) * 3 + 1, m3 = m1 + 2
        const rango = `${MESES[m1 - 1]} a ${MESES[m3 - 1]}`
        return { clave, tipo: 'trimestre', anio: y, desde: iso(y, m1, 1), hasta: iso(y, m3, finMes(y, m3)), etiqueta: `${ORD[q - 1]} trimestre ${y} (${rango})`, carpeta: `${y}-${q}T (${rango})` }
    }
    m = /^(\d{4})-(\d{2})$/.exec(clave)
    if (m) {
        const y = Number(m[1]), mm = Number(m[2])
        if (mm < 1 || mm > 12) return null
        return { clave, tipo: 'mes', anio: y, desde: iso(y, mm, 1), hasta: iso(y, mm, finMes(y, mm)), etiqueta: `${MESES[mm - 1].replace(/^./, c => c.toUpperCase())} ${y}`, carpeta: `${y}-${pad(mm)} (${MESES[mm - 1]})` }
    }
    m = /^(\d{4})$/.exec(clave)
    if (m) {
        const y = Number(m[1])
        return { clave, tipo: 'anual', anio: y, desde: iso(y, 1, 1), hasta: iso(y, 12, 31), etiqueta: `Ejercicio ${y} (año completo)`, carpeta: `${y} (año completo)` }
    }
    return null
}

export const trimestreDe = (f: string) => `${f.slice(0, 4)}-${Math.floor((Number(f.slice(5, 7)) - 1) / 3) + 1}T`

/** Trimestre ya cerrado más reciente (el que toca presentar). */
export function ultimoTrimestreCerrado(hoy: string): string {
    const y = Number(hoy.slice(0, 4)), q = Math.floor((Number(hoy.slice(5, 7)) - 1) / 3) + 1
    return q === 1 ? `${y - 1}-4T` : `${y}-${q - 1}T`
}

/** Periodos para el selector: trimestres y años de los últimos `anios` años. */
export function periodosSeleccionables(hoy: string, anios = 3): PeriodoFiscal[] {
    const y = Number(hoy.slice(0, 4))
    const out: PeriodoFiscal[] = []
    for (let a = y; a > y - anios; a--) {
        for (let q = 4; q >= 1; q--) { const p = periodoFiscal(`${a}-${q}T`)!; if (p.desde <= hoy) out.push(p) }
        out.push(periodoFiscal(String(a))!)
    }
    return out
}

// ---------- Vencimientos ----------

export interface Vencimiento {
    modelo: IdModelo
    nombre: string
    /** Periodo cuyas facturas hay que preparar. */
    periodo: string
    etiquetaPeriodo: string
    inicio: string
    /** Último día de plazo (ya ajustado a hábil). */
    fin: string
    /** Fin de plazo si se domicilia el pago (si aplica). */
    finDomiciliacion?: string
    /** Fecha recomendada para entregarle la documentación al asesor. */
    entregaAsesor: string
    diasRestantes: number
}

interface PlazoBruto { modelo: IdModelo; periodo: string; inicio: string; fin: string; domiciliacion?: number }

function plazosDelAnio(y: number): PlazoBruto[] {
    // Año y: plazos que se presentan DURANTE el año y.
    const out: PlazoBruto[] = []
    // 1T, 2T, 3T: 1–20 de abril, julio, octubre
    for (const [q, mes] of [[1, 4], [2, 7], [3, 10]] as const) {
        for (const mod of ['303', '349', '130', '111', '115'] as IdModelo[]) {
            out.push({ modelo: mod, periodo: `${y}-${q}T`, inicio: iso(y, mes, 1), fin: iso(y, mes, 20), domiciliacion: mod === '349' ? undefined : 5 })
        }
    }
    // 4T del año anterior: en enero
    for (const mod of ['303', '349', '130'] as IdModelo[]) out.push({ modelo: mod, periodo: `${y - 1}-4T`, inicio: iso(y, 1, 1), fin: iso(y, 1, 30), domiciliacion: mod === '349' ? undefined : 5 })
    for (const mod of ['111', '115'] as IdModelo[]) out.push({ modelo: mod, periodo: `${y - 1}-4T`, inicio: iso(y, 1, 1), fin: iso(y, 1, 20), domiciliacion: 5 })
    // Anuales del año anterior
    out.push({ modelo: '390', periodo: String(y - 1), inicio: iso(y, 1, 1), fin: iso(y, 1, 30) })
    out.push({ modelo: '190', periodo: String(y - 1), inicio: iso(y, 1, 1), fin: iso(y, 1, 31) })
    out.push({ modelo: '180', periodo: String(y - 1), inicio: iso(y, 1, 1), fin: iso(y, 1, 31) })
    out.push({ modelo: '347', periodo: String(y - 1), inicio: iso(y, 2, 1), fin: iso(y, 2, finMes(y, 2)) })
    out.push({ modelo: '200', periodo: String(y - 1), inicio: iso(y, 7, 1), fin: iso(y, 7, 25), domiciliacion: 5 })
    out.push({ modelo: '100', periodo: String(y - 1), inicio: iso(y, 4, 1), fin: iso(y, 6, 30), domiciliacion: 5 })
    // 202: pagos fraccionados del ejercicio en curso (acumulado a 31/3, 30/9, 30/11)
    out.push({ modelo: '202', periodo: `${y}-1T`, inicio: iso(y, 4, 1), fin: iso(y, 4, 20), domiciliacion: 5 })
    out.push({ modelo: '202', periodo: `${y}-3T`, inicio: iso(y, 10, 1), fin: iso(y, 10, 20), domiciliacion: 5 })
    out.push({ modelo: '202', periodo: `${y}-4T`, inicio: iso(y, 12, 1), fin: iso(y, 12, 20), domiciliacion: 5 })
    return out
}

const ETIQUETA_202: Record<string, string> = { '1T': '1er pago (enero a marzo)', '3T': '2º pago (enero a septiembre)', '4T': '3er pago (enero a noviembre)' }

/**
 * Vencimientos de la empresa entre `hoy` y `hoy + horizonte` (incluidos los
 * que vencen hoy), ordenados por fecha de fin.
 */
export function vencimientos(cfg: ConfigFiscal, hoy: string, horizonte = 400): Vencimiento[] {
    const y = Number(hoy.slice(0, 4))
    const limite = sumarDias(hoy, horizonte)
    const out: Vencimiento[] = []
    for (const anio of [y - 1, y, y + 1, y + 2]) {
        for (const p of plazosDelAnio(anio)) {
            if (!modeloActivo(cfg, p.modelo)) continue
            const fin = ajustarAHabil(p.fin)
            if (fin < hoy || fin > limite) continue
            const per = periodoFiscal(p.periodo)!
            const etiquetaPeriodo = p.modelo === '202' ? `${ETIQUETA_202[p.periodo.slice(5)]} ${per.anio}` : per.etiqueta
            // Las facturas a preparar para el 202 son las acumuladas del año: se exporta el trimestre igualmente.
            out.push({
                modelo: p.modelo,
                nombre: MODELOS.find(m => m.id === p.modelo)!.nombre,
                periodo: p.periodo,
                etiquetaPeriodo,
                inicio: p.inicio,
                fin,
                finDomiciliacion: p.domiciliacion ? ajustarAHabil(sumarDias(p.fin, -p.domiciliacion)) : undefined,
                entregaAsesor: sumarDias(fin, -cfg.dias_margen_asesor),
                diasRestantes: diasEntre(hoy, fin),
            })
        }
    }
    return out.sort((a, b) => a.fin.localeCompare(b.fin) || a.modelo.localeCompare(b.modelo))
}

export interface AvisoFiscal {
    /** Identifica el aviso: periodo + mes en que se presenta (p. ej. 2026-3T|2026-10). Se usa para «entregado al asesor». */
    clave: string
    periodo: string
    etiquetaPeriodo: string
    fin: string
    entregaAsesor: string
    diasRestantes: number
    modelos: IdModelo[]
    nivel: 'info' | 'pronto' | 'urgente'
}

export const claveAviso = (periodo: string, fin: string) => `${periodo}|${fin.slice(0, 7)}`

/**
 * Avisos de «preparar facturas»: uno por periodo y mes de presentación, con
 * plazo dentro de los próximos `dias_aviso` días, que todavía no se ha marcado
 * como entregado al asesor. Clave con el mes para que, por ejemplo, el 202 de
 * diciembre y el 303 del 4T de enero sean avisos distintos.
 */
export function avisosFiscales(cfg: ConfigFiscal, hoy: string, entregados: Set<string> = new Set()): AvisoFiscal[] {
    const mapa = new Map<string, AvisoFiscal>()
    for (const v of vencimientos(cfg, hoy, cfg.dias_aviso)) {
        const clave = claveAviso(v.periodo, v.fin)
        if (entregados.has(clave)) continue
        const a = mapa.get(clave)
        if (a) {
            a.modelos.push(v.modelo)
            if (v.modelo !== '202') a.etiquetaPeriodo = periodoFiscal(v.periodo)!.etiqueta
            if (v.fin < a.fin) { a.fin = v.fin; a.diasRestantes = v.diasRestantes; a.entregaAsesor = v.entregaAsesor }
        } else {
            mapa.set(clave, { clave, periodo: v.periodo, etiquetaPeriodo: v.modelo === '202' ? v.etiquetaPeriodo : periodoFiscal(v.periodo)!.etiqueta, fin: v.fin, entregaAsesor: v.entregaAsesor, diasRestantes: v.diasRestantes, modelos: [v.modelo], nivel: 'info' })
        }
    }
    return [...mapa.values()].map(a => ({ ...a, nivel: (a.diasRestantes <= 7 ? 'urgente' : a.diasRestantes <= 15 ? 'pronto' : 'info') as AvisoFiscal['nivel'] }))
        .sort((a, b) => a.fin.localeCompare(b.fin))
}

/** Días en los que Telegram recuerda el aviso (para no mandar 30 mensajes seguidos). */
export const DIAS_RECORDATORIO_TELEGRAM = [30, 20, 15, 10, 7, 5, 3, 2, 1, 0]

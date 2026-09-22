/**
 * Cálculo de vencimientos de facturas a partir de las condiciones de pago del
 * cliente. Sin dependencias (se testea con `npm test`).
 *
 * Todas las fechas se manejan como 'YYYY-MM-DD' en calendario local, sin horas,
 * para que nunca haya desfases por zona horaria.
 */

export type TipoCondicion = 'dias' | 'fin_mes' | 'dia_fijo' | 'inmediato' | 'manual' | 'sin_vencimiento'

export interface CondicionPago {
    tipo?: TipoCondicion | null
    /** 'dias': días desde emisión. 'fin_mes': días a sumar antes de ir a fin de mes. */
    dias?: number | null
    /** 'dia_fijo': día del mes en que se paga (1-31). */
    diaMes?: number | null
    /** 'dia_fijo': cuántos meses después de la emisión (1 = mes siguiente). */
    meses?: number | null
}

export const METODOS_PAGO = [
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'tarjeta', label: 'Tarjeta' },
    { value: 'bizum', label: 'Bizum' },
    { value: 'domiciliacion', label: 'Domiciliación' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'otro', label: 'Otro' },
] as const

export const TIPOS_CONDICION: { value: TipoCondicion; label: string }[] = [
    { value: 'dias', label: 'X días desde la fecha de factura' },
    { value: 'fin_mes', label: 'Fin de mes (opcionalmente tras X días)' },
    { value: 'dia_fijo', label: 'Día fijo del mes' },
    { value: 'inmediato', label: 'Pago inmediato' },
    { value: 'manual', label: 'Fecha manual en cada factura' },
    { value: 'sin_vencimiento', label: 'Sin vencimiento definido' },
]

export function etiquetaMetodo(m?: string | null): string {
    return METODOS_PAGO.find(x => x.value === m)?.label || (m ? m : 'Sin indicar')
}

function parse(fecha: string): { y: number; m: number; d: number } {
    const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
    if (!y || !m || !d) throw new Error(`Fecha no válida: ${fecha}`)
    return { y, m, d }
}

function fmt(y: number, m: number, d: number): string {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function diasDelMes(y: number, m: number): number {
    return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function sumarDias(fecha: string, dias: number): string {
    const { y, m, d } = parse(fecha)
    const t = new Date(Date.UTC(y, m - 1, d + dias))
    return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

function sumarMeses(y: number, m: number, meses: number): { y: number; m: number } {
    const total = (y * 12 + (m - 1)) + meses
    return { y: Math.floor(total / 12), m: (total % 12) + 1 }
}

/**
 * Devuelve la fecha de vencimiento 'YYYY-MM-DD', o null si la condición no
 * define vencimiento automático ('manual' o 'sin_vencimiento').
 */
export function calcularVencimiento(fechaEmision: string, cond: CondicionPago | null | undefined): string | null {
    const tipo = cond?.tipo || 'dias'
    const emision = fechaEmision.slice(0, 10)

    switch (tipo) {
        case 'inmediato':
            return emision
        case 'dias': {
            const dias = Math.max(0, Number(cond?.dias ?? 30))
            return sumarDias(emision, dias)
        }
        case 'fin_mes': {
            const base = sumarDias(emision, Math.max(0, Number(cond?.dias ?? 0)))
            const { y, m } = parse(base)
            return fmt(y, m, diasDelMes(y, m))
        }
        case 'dia_fijo': {
            const dia = Math.min(31, Math.max(1, Number(cond?.diaMes ?? 5)))
            const meses = Math.max(0, Number(cond?.meses ?? 1))
            const { y, m, d } = parse(emision)
            // meses = 0 → ese día de este mes si aún no ha pasado; si no, del siguiente.
            let destino = sumarMeses(y, m, meses)
            if (meses === 0 && d > dia) destino = sumarMeses(y, m, 1)
            return fmt(destino.y, destino.m, Math.min(dia, diasDelMes(destino.y, destino.m)))
        }
        case 'manual':
        case 'sin_vencimiento':
        default:
            return null
    }
}

/** Texto legible de una condición: "Transferencia a 60 días...", "Día 5 del mes siguiente"... */
export function describirCondicion(cond: CondicionPago | null | undefined, metodo?: string | null): string {
    const met = metodo ? etiquetaMetodo(metodo) : ''
    const tipo = cond?.tipo || 'dias'
    let txt: string
    switch (tipo) {
        case 'inmediato': return met ? `${met} · pago inmediato` : 'Pago inmediato'
        case 'dias': txt = `a ${cond?.dias ?? 30} días desde fecha de factura`; break
        case 'fin_mes': txt = cond?.dias ? `a ${cond.dias} días fin de mes` : 'fin de mes'; break
        case 'dia_fijo': {
            const meses = cond?.meses ?? 1
            txt = `día ${cond?.diaMes ?? 5} del ${meses === 1 ? 'mes siguiente' : meses === 0 ? 'mes' : `mes +${meses}`}`
            break
        }
        case 'manual': txt = 'vencimiento manual'; break
        default: txt = 'sin vencimiento definido'
    }
    return met ? `${met} ${txt}` : txt.charAt(0).toUpperCase() + txt.slice(1)
}

export function condicionDeCliente(c: any): CondicionPago {
    return {
        tipo: (c?.condicion_pago_activa === false ? 'dias' : c?.condicion_pago_tipo) || 'dias',
        dias: c?.condicion_pago_dias ?? 30,
        diaMes: c?.condicion_pago_dia_mes ?? null,
        meses: c?.condicion_pago_meses ?? 1,
    }
}

/** Desfase horario de Madrid en una fecha 'YYYY-MM-DD' ('+01:00' en invierno, '+02:00' en verano). */
export function offsetMadrid(fecha: string): string {
    const d = new Date(fecha.slice(0, 10) + 'T12:00:00Z')
    const partes = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(d)
    const h = Number(partes) - 12
    return `+0${h}:00`
}

/** Instantes de inicio y fin de un día en Madrid (ISO), para filtrar eventos por día. */
export function rangoDiaMadrid(fecha: string): { desde: string; hasta: string } {
    const off = offsetMadrid(fecha)
    return { desde: new Date(`${fecha}T00:00:00${off}`).toISOString(), hasta: new Date(`${fecha}T23:59:59${off}`).toISOString() }
}

/** Fecha de hoy en Madrid como 'YYYY-MM-DD'. */
export function hoyISO(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Días desde hoy hasta el vencimiento: positivo = faltan, negativo = vencida hace N días. */
export function diasHastaVencimiento(vencimiento: string, hoy: string = hoyISO()): number {
    const a = parse(hoy), b = parse(vencimiento)
    return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000)
}

export type EstadoCobroVisual = 'pagada' | 'parcial' | 'vencida' | 'vence_hoy' | 'pronto' | 'pendiente' | 'sin_vencimiento'

export interface InfoCobro {
    total: number
    cobrado: number
    pendiente: number
    estado: 'pendiente' | 'parcial' | 'pagada'
    visual: EstadoCobroVisual
    dias: number | null
    etiqueta: string
}

const redondear = (n: number) => Math.round(n * 100) / 100

/** Estado de cobro de una factura para mostrar en la interfaz. */
export function infoCobro(f: { total: any; importe_cobrado?: any; estado_cobro?: string | null; pagada?: boolean | null; fecha_vencimiento?: string | null }, hoy: string = hoyISO()): InfoCobro {
    const total = redondear(Number(f.total) || 0)
    let cobrado = redondear(Number(f.importe_cobrado) || 0)
    if (!f.estado_cobro && f.pagada) cobrado = total
    const pendiente = redondear(Math.max(0, total - cobrado))
    const estado: InfoCobro['estado'] = pendiente <= 0.005 && total > 0 ? 'pagada' : cobrado > 0 ? 'parcial' : 'pendiente'

    if (estado === 'pagada') return { total, cobrado, pendiente: 0, estado, visual: 'pagada', dias: null, etiqueta: 'Pagada' }

    if (!f.fecha_vencimiento) {
        return { total, cobrado, pendiente, estado, visual: estado === 'parcial' ? 'parcial' : 'sin_vencimiento', dias: null, etiqueta: estado === 'parcial' ? 'Parcialmente pagada' : 'Pendiente · sin vencimiento' }
    }

    const dias = diasHastaVencimiento(f.fecha_vencimiento, hoy)
    if (dias < 0) return { total, cobrado, pendiente, estado, visual: 'vencida', dias, etiqueta: `Vencida hace ${-dias} día${dias === -1 ? '' : 's'}` }
    if (dias === 0) return { total, cobrado, pendiente, estado, visual: 'vence_hoy', dias, etiqueta: 'Vence hoy' }
    if (dias <= 7) return { total, cobrado, pendiente, estado, visual: 'pronto', dias, etiqueta: `Vence en ${dias} día${dias === 1 ? '' : 's'}` }
    return { total, cobrado, pendiente, estado, visual: estado === 'parcial' ? 'parcial' : 'pendiente', dias, etiqueta: estado === 'parcial' ? `Parcial · vence en ${dias} días` : `Vence en ${dias} días` }
}

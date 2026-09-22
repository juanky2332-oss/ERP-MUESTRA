import 'server-only'
import type { Contexto } from '@/lib/auth'
import { ErrorPermiso } from '@/lib/auth'
import { tienePermiso } from '@/lib/permisos'
import { auditar } from '@/lib/auditoria'
import { infoCobro, hoyISO, sumarDias, etiquetaMetodo, type InfoCobro } from '@/lib/cobros/vencimientos'
import { formatCurrency } from '@/lib/utils'

export const CAMPOS_FACTURA_COBRO = 'id, numero, fecha, fecha_vencimiento, total, importe_cobrado, estado_cobro, pagada, statuses, cliente_id, cliente_razon_social, cliente_email, pedido_referencia, anulada, metodo_pago, forma_pago, last_reminder_at, reminder_count'

export interface FacturaCobro {
    id: string
    numero: string
    fecha: string
    fecha_vencimiento: string | null
    cliente_id: string | null
    cliente_razon_social: string
    cliente_email?: string | null
    last_reminder_at?: string | null
    reminder_count?: number | null
    metodo_pago?: string | null
    info: InfoCobro
}

export function conInfo(f: any, hoy = hoyISO()): FacturaCobro {
    return { ...f, info: infoCobro(f, hoy) }
}

export interface RegistroCobro {
    facturaId: string
    /** Importe a registrar. Si se omite, se cobra todo lo pendiente. */
    importe?: number | null
    fecha?: string | null
    metodo?: string | null
    referencia?: string | null
    nota?: string | null
    justificantePath?: string | null
    idempotencyKey?: string | null
}

export interface ResultadoCobro {
    estado: 'confirmado' | 'propuesto'
    duplicado: boolean
    factura: FacturaCobro
    importe: number
    cobroId?: string
}

/**
 * Registra un cobro de una factura (total o parcial).
 * - Propietario/administrador/finanzas: queda CONFIRMADO y la factura se
 *   actualiza al momento (el trigger recalcula cobrado/pendiente/estado).
 * - Otros roles con escritura: queda como PROPUESTO para que administración
 *   lo confirme. Nunca marca la factura como pagada.
 * - idempotencyKey evita cobros duplicados (doble clic, reintento de Telegram).
 */
export async function registrarCobro(ctx: Contexto, r: RegistroCobro): Promise<ResultadoCobro> {
    if (ctx.rol === 'lectura') throw new ErrorPermiso('Tu rol es de solo lectura: no puedes registrar cobros.')
    const puedeConfirmar = tienePermiso(ctx.rol, 'cobros')

    const { data: f, error } = await ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).eq('id', r.facturaId).maybeSingle()
    if (error || !f) throw new Error('No se encuentra la factura.')
    if (f.anulada) throw new Error('La factura está anulada.')

    const antes = infoCobro(f)

    if (r.idempotencyKey) {
        const { data: previo } = await ctx.supabase.from('cobros').select('id, importe, estado').eq('idempotency_key', r.idempotencyKey).maybeSingle()
        if (previo) {
            const { data: fAct } = await ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).eq('id', r.facturaId).maybeSingle()
            return { estado: previo.estado, duplicado: true, factura: conInfo(fAct || f), importe: Number(previo.importe), cobroId: previo.id }
        }
    }

    if (antes.estado === 'pagada') throw new Error(`La factura ${f.numero} ya está pagada por completo.`)

    const importe = Math.round(Number(r.importe ?? antes.pendiente) * 100) / 100
    if (!(importe > 0)) throw new Error('El importe debe ser mayor que 0.')
    if (importe > antes.pendiente + 0.01) {
        throw new Error(`El importe (${formatCurrency(importe)}) supera lo pendiente de la factura (${formatCurrency(antes.pendiente)}).`)
    }

    const estado = puedeConfirmar ? 'confirmado' : 'propuesto'
    const { data: cobro, error: insErr } = await ctx.supabase.from('cobros').insert({
        empresa_id: ctx.empresaId,
        factura_id: f.id,
        cliente_id: f.cliente_id,
        importe,
        fecha: (r.fecha || hoyISO()).slice(0, 10),
        metodo: r.metodo || null,
        referencia: r.referencia || null,
        nota: r.nota || null,
        justificante_path: r.justificantePath || null,
        origen: ctx.origen === 'telegram' ? 'telegram' : 'app',
        estado,
        usuario_id: ctx.userId,
        usuario_nombre: ctx.nombre,
        idempotency_key: r.idempotencyKey || null,
    }).select('id').single()

    if (insErr) {
        if (insErr.code === '23505') {
            const { data: fAct } = await ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).eq('id', f.id).maybeSingle()
            return { estado, duplicado: true, factura: conInfo(fAct || f), importe }
        }
        throw new Error('No se pudo registrar el cobro: ' + insErr.message)
    }

    const { data: despues } = await ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).eq('id', f.id).maybeSingle()
    const facturaFinal = conInfo(despues || f)

    await auditar(ctx, estado === 'confirmado' ? 'cobro_registrado' : 'cobro_propuesto', { tipo: 'factura', id: f.id, ref: f.numero }, {
        importe, metodo: r.metodo || null, fecha: r.fecha || hoyISO(), nota: r.nota || null,
        justificante: r.justificantePath || null, pendiente_antes: antes.pendiente, pendiente_despues: facturaFinal.info.pendiente,
        estado_resultante: facturaFinal.info.estado,
    })

    if (r.metodo && !f.metodo_pago) {
        await ctx.supabase.from('facturas').update({ metodo_pago: r.metodo }).eq('id', f.id)
    }

    return { estado, duplicado: false, factura: facturaFinal, importe, cobroId: cobro.id }
}

/** Confirma un cobro propuesto por un rol sin permisos económicos. */
export async function confirmarCobroPropuesto(ctx: Contexto, cobroId: string) {
    if (!tienePermiso(ctx.rol, 'cobros')) throw new ErrorPermiso('No tienes permiso para confirmar cobros.')
    const { data: c } = await ctx.supabase.from('cobros').select('id, factura_id, importe, estado').eq('id', cobroId).maybeSingle()
    if (!c) throw new Error('Cobro no encontrado.')
    if (c.estado !== 'propuesto') return
    await ctx.supabase.from('cobros').update({ estado: 'confirmado', nota: null }).eq('id', cobroId)
    await auditar(ctx, 'cobro_confirmado', { tipo: 'cobro', id: cobroId }, { factura_id: c.factura_id, importe: c.importe })
}

/** Anula un cobro (error al registrarlo). La factura se recalcula sola. */
export async function anularCobro(ctx: Contexto, cobroId: string, motivo?: string) {
    if (!tienePermiso(ctx.rol, 'cobros')) throw new ErrorPermiso('No tienes permiso para anular cobros.')
    const { data: c } = await ctx.supabase.from('cobros').select('id, factura_id, importe').eq('id', cobroId).maybeSingle()
    if (!c) throw new Error('Cobro no encontrado.')
    await ctx.supabase.from('cobros').update({ estado: 'anulado', nota: motivo ? `Anulado: ${motivo}` : 'Anulado' }).eq('id', cobroId)
    await auditar(ctx, 'cobro_anulado', { tipo: 'cobro', id: cobroId }, { factura_id: c.factura_id, importe: c.importe, motivo })
}

export interface ResumenCobros {
    hoy: string
    pendienteTotal: number
    vencidoTotal: number
    vencidas: FacturaCobro[]
    venceHoy: FacturaCobro[]
    proximas: FacturaCobro[]   // vencen en los próximos 30 días (sin hoy)
    parciales: FacturaCobro[]
    sinVencimiento: FacturaCobro[]
    pendientes: FacturaCobro[] // todas las no pagadas
    venceEstaSemana: number
    cobradoEsteMes: number
    facturadoEsteMes: number
    cobrosPropuestos: number
}

/** Foto completa de cobros y vencimientos de la empresa (dashboard, avisos, Telegram). */
export async function resumenCobros(ctx: Pick<Contexto, 'supabase'>): Promise<ResumenCobros> {
    const hoy = hoyISO()
    const inicioMes = hoy.slice(0, 8) + '01'

    const [{ data: facturas }, { data: cobrosMes }, { data: facturasMes }, { count: propuestos }] = await Promise.all([
        ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).neq('estado_cobro', 'pagada').or('anulada.is.null,anulada.eq.false').limit(2000),
        ctx.supabase.from('cobros').select('importe').eq('estado', 'confirmado').gte('fecha', inicioMes).neq('origen', 'importacion'),
        ctx.supabase.from('facturas').select('total').gte('fecha', inicioMes).or('anulada.is.null,anulada.eq.false'),
        ctx.supabase.from('cobros').select('id', { count: 'exact', head: true }).eq('estado', 'propuesto'),
    ])

    const pendientes: FacturaCobro[] = (facturas || []).map((f: any) => conInfo(f, hoy)).filter((f: FacturaCobro) => f.info.estado !== 'pagada')
    const vencidas = pendientes.filter(f => f.info.visual === 'vencida').sort((a, b) => (a.info.dias ?? 0) - (b.info.dias ?? 0))
    const venceHoy = pendientes.filter(f => f.info.visual === 'vence_hoy')
    const proximas = pendientes.filter(f => f.info.dias !== null && f.info.dias > 0 && f.info.dias <= 30).sort((a, b) => (a.info.dias ?? 0) - (b.info.dias ?? 0))
    const finSemana = sumarDias(hoy, 7)

    return {
        hoy,
        pendienteTotal: redondear(pendientes.reduce((a, f) => a + f.info.pendiente, 0)),
        vencidoTotal: redondear(vencidas.reduce((a, f) => a + f.info.pendiente, 0)),
        vencidas,
        venceHoy,
        proximas,
        parciales: pendientes.filter(f => f.info.estado === 'parcial'),
        sinVencimiento: pendientes.filter(f => !f.fecha_vencimiento),
        pendientes,
        venceEstaSemana: pendientes.filter(f => f.fecha_vencimiento && f.fecha_vencimiento >= hoy && f.fecha_vencimiento <= finSemana).length,
        cobradoEsteMes: redondear((cobrosMes || []).reduce((a: number, c: any) => a + Number(c.importe || 0), 0)),
        facturadoEsteMes: redondear((facturasMes || []).reduce((a: number, f: any) => a + Number(f.total || 0), 0)),
        cobrosPropuestos: propuestos || 0,
    }
}

const redondear = (n: number) => Math.round(n * 100) / 100

function formatFecha(iso?: string | null) {
    if (!iso) return 'sin fecha'
    const [y, m, d] = iso.slice(0, 10).split('-')
    return `${d}/${m}/${y}`
}

/** Rellena la plantilla de reclamación de la empresa con los datos de la factura. */
export async function borradorReclamacion(ctx: Contexto, facturaId: string) {
    const { data: f } = await ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).eq('id', facturaId).maybeSingle()
    if (!f) throw new Error('No se encuentra la factura.')
    const { data: empresa } = await ctx.supabase.from('empresas').select('*').eq('id', ctx.empresaId).maybeSingle()
    const { data: cliente } = f.cliente_id
        ? await ctx.supabase.from('contactos').select('razon_social, persona_contacto, email, email_facturacion').eq('id', f.cliente_id).maybeSingle()
        : { data: null }

    const info = infoCobro(f)
    const vars: Record<string, string> = {
        numero_factura: f.numero,
        nombre_cliente: cliente?.persona_contacto || f.cliente_razon_social,
        razon_social_cliente: f.cliente_razon_social,
        importe_pendiente: formatCurrency(info.pendiente),
        importe_total: formatCurrency(info.total),
        fecha_vencimiento: formatFecha(f.fecha_vencimiento),
        fecha_factura: formatFecha(f.fecha),
        dias_retraso: info.dias !== null && info.dias < 0 ? String(-info.dias) : '0',
        nombre_empresa: empresa?.nombre || 'Administración',
    }
    const rellenar = (t: string) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)

    const asunto = rellenar(empresa?.plantilla_reclamacion_asunto || 'Recordatorio de pago – Factura {numero_factura}')
    const cuerpo = rellenar(empresa?.plantilla_reclamacion_cuerpo || 'Hola {nombre_cliente},\n\nTe recordamos que la factura {numero_factura}, por importe de {importe_pendiente}, tenía fecha de vencimiento el {fecha_vencimiento}.\n\nGracias,\n\n{nombre_empresa}')

    return {
        factura: conInfo(f),
        asunto,
        cuerpo,
        destinatarios: [] as string[],
        clienteEmail: cliente?.email_facturacion || cliente?.email || f.cliente_email || null,
    }
}

export function lineaFactura(f: FacturaCobro): string {
    return `${f.numero} · ${f.cliente_razon_social} · ${formatCurrency(f.info.pendiente)} · ${f.info.etiqueta}`
}

export { etiquetaMetodo }

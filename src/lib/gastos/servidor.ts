import 'server-only'
import type { Contexto } from '@/lib/auth'
import { assertPermiso } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { getNextSequenceNumber } from '@/lib/sequences'
import { PROVEEDOR_PENDIENTE } from '@/lib/expense-supplier'

export { CATEGORIAS_GASTO } from '@/lib/gastos/categorias'

const normNombre = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '')

/**
 * Enlaza un gasto con su ficha de proveedor: busca por CIF y, si no, por
 * nombre; si no existe la crea. Devuelve null si el proveedor está sin
 * identificar (no se crean fichas basura tipo "REVISAR").
 */
export async function vincularProveedor(ctx: Contexto, nombre?: string | null, cif?: string | null): Promise<string | null> {
    const n = (nombre || '').trim()
    if (!n || n === PROVEEDOR_PENDIENTE || n.toUpperCase() === 'VARIOS') return null
    const c = (cif || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

    if (c) {
        const { data } = await ctx.supabase.from('proveedores').select('id').eq('cif', c).maybeSingle()
        if (data) return data.id
    }
    const { data: candidatos } = await ctx.supabase.from('proveedores').select('id, razon_social').ilike('razon_social', `%${n.slice(0, 40)}%`).limit(20)
    const exacto = (candidatos || []).find((p: any) => normNombre(p.razon_social) === normNombre(n))
    if (exacto) return exacto.id

    if (ctx.rol === 'lectura') return null
    const { data: nuevo } = await ctx.supabase.from('proveedores').insert({ empresa_id: ctx.empresaId, razon_social: n, cif: c || null }).select('id').single()
    return nuevo?.id || null
}

export interface DatosGasto {
    fecha?: string | null
    proveedor?: string | null
    proveedor_cif?: string | null
    proveedor_id?: string | null
    concepto?: string | null
    descripcion?: string | null
    categoria?: string | null
    numero?: string | null
    base_imponible?: number | null
    iva_porcentaje?: number | null
    iva_importe?: number | null
    total?: number | null
    archivo_url?: string | null
    cliente_id?: string | null
    notas?: string | null
    ocr_data?: any
    origen?: 'app' | 'telegram' | 'ia'
    revisado?: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Crea un gasto (validando importes) con número interno G-XX-AAAA y auditoría. */
export async function crearGasto(ctx: Contexto, d: DatosGasto) {
    assertPermiso(ctx, 'gastos')
    const base = r2(Number(d.base_imponible) || 0)
    const ivaPct = d.iva_porcentaje === null || d.iva_porcentaje === undefined ? null : Number(d.iva_porcentaje)
    let ivaImp = d.iva_importe === null || d.iva_importe === undefined ? null : r2(Number(d.iva_importe))
    let total = r2(Number(d.total) || 0)

    if (ivaImp === null && ivaPct !== null && base > 0) ivaImp = r2(base * ivaPct / 100)
    if (!total && base > 0) total = r2(base + (ivaImp || 0))
    if (!(total > 0)) throw new Error('El gasto necesita un importe total mayor que 0.')

    const proveedorId = d.proveedor_id || await vincularProveedor(ctx, d.proveedor, d.proveedor_cif)
    const seq = await getNextSequenceNumber('gasto', ctx.supabase)

    const payload = {
        empresa_id: ctx.empresaId,
        numero: `${seq} / ${d.numero || 'S/N'}`,
        fecha: (d.fecha || new Date().toISOString()).slice(0, 10),
        proveedor: d.proveedor || PROVEEDOR_PENDIENTE,
        proveedor_cif: d.proveedor_cif || '',
        proveedor_id: proveedorId,
        concepto: d.concepto || d.descripcion || null,
        descripcion: d.descripcion || d.concepto || null,
        categoria: d.categoria || null,
        base_imponible: base,
        iva_porcentaje: ivaPct ?? 21,
        iva_importe: ivaImp ?? 0,
        total,
        importe: total,
        factura_url: d.archivo_url || null,
        archivo_url: d.archivo_url || null,
        cliente_id: d.cliente_id || null,
        ocr_data: d.ocr_data || null,
        origen: d.origen || 'app',
        revisado: d.revisado ?? true,
    }

    const { data, error } = await ctx.supabase.from('gastos').insert(payload).select().single()
    if (error) throw new Error('No se pudo guardar el gasto: ' + error.message)

    await auditar(ctx, 'gasto_registrado', { tipo: 'gasto', id: data.id, ref: data.numero }, {
        proveedor: data.proveedor, total: data.total, categoria: data.categoria, origen: payload.origen, adjunto: !!d.archivo_url,
    })
    return data
}

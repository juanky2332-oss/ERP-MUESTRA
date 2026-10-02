import 'server-only'
import type { Contexto } from '@/lib/auth'
import { hoyISO } from '@/lib/cobros/vencimientos'
import { avisosFiscales, configFiscal, periodoFiscal, type AvisoFiscal, type ConfigFiscal, type PeriodoFiscal } from '@/lib/fiscal/calendario'
import { calcularLibros, type Libros } from '@/lib/fiscal/libros'

type Ctx = Pick<Contexto, 'supabase' | 'empresaId'>

const CAMPOS_FAC = 'id, numero, serie, fecha, cliente_id, cliente_razon_social, cliente_cif, base_imponible, subtotal, iva_porcentaje, iva_importe, total, anulada, motivo_anulacion, rectifica_factura_id, created_at'
const CAMPOS_GAS = 'id, numero, fecha, proveedor, proveedor_cif, proveedor_id, concepto, descripcion, categoria, base_imponible, iva_porcentaje, iva_importe, retencion_porcentaje, retencion_importe, total, archivo_url, factura_url, url_archivo, revisado, created_at'

async function paginado(q: () => any): Promise<any[]> {
    const out: any[] = []
    for (let i = 0; i < 50; i++) {
        const { data, error } = await q().range(i * 1000, i * 1000 + 999)
        if (error) throw new Error(error.message)
        out.push(...(data || []))
        if (!data || data.length < 1000) break
    }
    return out
}

export async function getConfigFiscal(ctx: Ctx): Promise<{ cfg: ConfigFiscal; empresa: any }> {
    const { data: empresa } = await ctx.supabase.from('empresas').select('id, nombre, nif, fiscal').eq('id', ctx.empresaId).maybeSingle()
    return { cfg: configFiscal(empresa?.fiscal), empresa }
}

export async function clavesEntregadas(ctx: Ctx): Promise<Set<string>> {
    const { data } = await ctx.supabase.from('fiscal_entregas').select('clave').order('entregado_at', { ascending: false }).limit(200)
    return new Set((data || []).map((x: any) => x.clave))
}

/** Avisos activos (menos de `dias_aviso` días y sin marcar como entregado). */
export async function avisosEmpresa(ctx: Ctx, hoy = hoyISO()): Promise<{ avisos: AvisoFiscal[]; cfg: ConfigFiscal }> {
    const [{ cfg }, entregados] = await Promise.all([getConfigFiscal(ctx), clavesEntregadas(ctx)])
    return { avisos: avisosFiscales(cfg, hoy, entregados), cfg }
}

/** Facturas y gastos desde el 1 de enero del año del periodo hasta su fin, y los libros calculados. */
export async function librosDelPeriodo(ctx: Ctx, clave: string): Promise<{ libros: Libros; periodo: PeriodoFiscal; empresa: any; cfg: ConfigFiscal }> {
    const periodo = periodoFiscal(clave)
    if (!periodo) throw new Error('Periodo no válido.')
    const desde = `${periodo.anio}-01-01`
    const [{ cfg, empresa }, facturas, gastos] = await Promise.all([
        getConfigFiscal(ctx),
        paginado(() => ctx.supabase.from('facturas').select(CAMPOS_FAC).gte('fecha', desde).lte('fecha', periodo.hasta).order('fecha').order('id')),
        paginado(() => ctx.supabase.from('gastos').select(CAMPOS_GAS).gte('fecha', desde).lte('fecha', periodo.hasta).order('fecha').order('id')),
    ])
    return { libros: calcularLibros({ facturas, gastos }, periodo, { regimen: cfg.regimen }), periodo, empresa, cfg }
}

export function nombreEmpresa(empresa: any) {
    return String(empresa?.nombre || 'EMPRESA').trim()
}

import 'server-only'
import type { Contexto } from '@/lib/auth'
import { hoyISO } from '@/lib/cobros/vencimientos'
import { calcularInforme, periodoAnterior, resolverPeriodo, type DatosInforme } from '@/lib/informes/calcular'

const CAMPOS_FAC = 'id, numero, fecha, fecha_vencimiento, cliente_id, cliente_razon_social, base_imponible, iva_importe, total, importe_cobrado, estado_cobro, anulada, lineas'

/** Carga lo necesario y calcula el informe del periodo (y el anterior para comparar). */
export async function informeEmpresa(ctx: Pick<Contexto, 'supabase'>, filtros: { preset?: string; mes?: string; desde?: string; hasta?: string; cliente?: string | null }) {
    const hoy = hoyISO()
    const periodo = resolverPeriodo(filtros, hoy)
    const anterior = periodoAnterior(periodo)
    const desde = anterior.desde, hasta = periodo.hasta
    const pag = async (q: () => any) => {
        // Paginado para no quedarse en las 1000 filas por defecto
        const out: any[] = []
        for (let i = 0; i < 20; i++) {
            const { data, error } = await q().range(i * 1000, i * 1000 + 999)
            if (error) throw new Error(error.message)
            out.push(...(data || []))
            if (!data || data.length < 1000) break
        }
        return out
    }
    const [facRango, facPend, cobros, gastos, presupuestos, albaranes] = await Promise.all([
        pag(() => ctx.supabase.from('facturas').select(CAMPOS_FAC).gte('fecha', desde).lte('fecha', hasta).order('fecha')),
        pag(() => ctx.supabase.from('facturas').select(CAMPOS_FAC).or('estado_cobro.is.null,estado_cobro.neq.pagada').order('fecha')),
        pag(() => ctx.supabase.from('cobros').select('factura_id, importe, fecha, metodo, estado').gte('fecha', desde).lte('fecha', hasta).order('fecha')),
        pag(() => ctx.supabase.from('gastos').select('fecha, proveedor, categoria, base_imponible, iva_importe, total').gte('fecha', desde).lte('fecha', hasta).order('fecha')),
        pag(() => ctx.supabase.from('presupuestos').select('id, numero, fecha, fecha_validez, cliente_id, cliente_razon_social, base_imponible, iva_importe, total, aceptado, rechazado, statuses').gte('fecha', desde).lte('fecha', hasta).order('fecha')),
        pag(() => ctx.supabase.from('albaranes').select('id, numero, fecha, cliente_id, cliente_razon_social, base_imponible, iva_importe, total, factura_id, statuses, firmado_at').gte('fecha', desde).lte('fecha', hasta).order('fecha')),
    ])
    const facturas = [...new Map([...facRango, ...facPend].map(f => [f.id, f])).values()]
    const datos: DatosInforme = { facturas, cobros, gastos, presupuestos, albaranes }
    const cliente = filtros.cliente || null
    return {
        hoy,
        actual: calcularInforme(datos, periodo, hoy, { cliente }),
        anterior: calcularInforme(datos, anterior, hoy, { cliente }),
    }
}

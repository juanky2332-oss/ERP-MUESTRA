'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { endOfMonth, format, startOfMonth } from 'date-fns'

export interface Gasto {
    id: string
    fecha: string
    numero: string
    referencia_pedido?: string
    proveedor: string
    proveedor_cif?: string
    descripcion: string
    base_imponible: number
    iva_porcentaje?: number
    iva_importe: number
    total: number
    factura_url?: string
    created_at: string
}

/** Total acumulado de un proveedor dentro del periodo filtrado. */
export interface ResumenProveedor {
    proveedor: string
    total: number
    base: number
    iva: number
    numGastos: number
}

/** Datos de alta de un gasto (los importes pueden venir como texto del formulario). */
export interface ExpenseInput {
    fecha: string
    numero?: string
    referencia_pedido?: string
    proveedor: string
    proveedor_cif?: string
    descripcion?: string
    base_imponible?: string | number
    iva_porcentaje?: string | number
    iva_importe?: string | number
    total?: string | number
}

/** Datos de edición de un gasto existente. */
export interface ExpenseUpdateInput extends Partial<ExpenseInput> {
    id: string
}

export interface ExpenseFilters {
    page?: number
    pageSize?: number
    search?: string
    /** Filtro global de mes ('0'..'11' o 'all') */
    month?: string
    /** Filtro global de año ('2026' o 'all') */
    year?: string
    /** Rango de fechas propio del módulo de gastos (yyyy-MM-dd). Tiene prioridad sobre mes/año. */
    fechaDesde?: string
    fechaHasta?: string
    /** Proveedor exacto por el que filtrar ('all' = todos) */
    proveedor?: string
    sortConfig?: { key: string, direction: 'asc' | 'desc' } | null
}

/** Nº de filas por lote al recorrer la tabla para calcular totales. */
const CHUNK = 1000

/**
 * Calcula el rango de fechas efectivo.
 *
 * Se devuelven cadenas 'yyyy-MM-dd' (no ISO con hora) porque la columna
 * 'fecha' es de tipo DATE: usar toISOString() convierte a UTC y, con horario
 * español, desplazaba el rango un día hacia atrás incluyendo gastos del mes
 * anterior.
 */
function getDateRange(filters: ExpenseFilters): { start?: string, end?: string } {
    const { fechaDesde, fechaHasta, month = 'all', year = 'all' } = filters

    // El rango manual manda sobre el selector global de mes/año.
    if (fechaDesde || fechaHasta) {
        return { start: fechaDesde || undefined, end: fechaHasta || undefined }
    }

    const currentYear = year === 'all' ? undefined : Number(year)
    const currentMonth = month === 'all' ? undefined : Number(month)

    if (currentYear && currentMonth !== undefined && !Number.isNaN(currentMonth)) {
        const d = new Date(currentYear, currentMonth, 1)
        return {
            start: format(startOfMonth(d), 'yyyy-MM-dd'),
            end: format(endOfMonth(d), 'yyyy-MM-dd'),
        }
    }

    if (currentYear) {
        return {
            start: `${currentYear}-01-01`,
            end: `${currentYear}-12-31`,
        }
    }

    return {}
}

/**
 * Interfaz mínima de una consulta de Supabase filtrable.
 * Evita depender de los tipos internos de PostgrestFilterBuilder.
 */
interface ConsultaFiltrable<T> {
    gte(column: string, value: string): T
    lte(column: string, value: string): T
    or(filters: string): T
}

/** Aplica los filtros comunes (fecha + búsqueda) a una consulta de gastos. */
function applyCommonFilters<T extends ConsultaFiltrable<T>>(query: T, filters: ExpenseFilters): T {
    const { start, end } = getDateRange(filters)
    if (start) query = query.gte('fecha', start)
    if (end) query = query.lte('fecha', end)

    if (filters.search) {
        const s = filters.search.replace(/[,()]/g, ' ')
        query = query.or(
            `proveedor.ilike.%${s}%,numero.ilike.%${s}%,descripcion.ilike.%${s}%,referencia_pedido.ilike.%${s}%`
        )
    }
    return query
}

export function useExpenses(filters: ExpenseFilters = {}) {
    const {
        page = 1,
        pageSize = 10,
        proveedor = 'all',
        sortConfig = null,
    } = filters

    const queryClient = useQueryClient()

    const filterKey = [
        filters.search || '',
        filters.month || 'all',
        filters.year || 'all',
        filters.fechaDesde || '',
        filters.fechaHasta || '',
    ]

    // --- 1. Listado paginado (aplica TODOS los filtros, incluido proveedor) ---
    const { data, isLoading } = useQuery({
        queryKey: ['gastos', 'lista', page, pageSize, proveedor, sortConfig, ...filterKey],
        queryFn: async () => {
            let query = applyCommonFilters(
                supabase.from('gastos').select('*', { count: 'exact' }),
                filters
            )

            if (proveedor && proveedor !== 'all') {
                query = query.eq('proveedor', proveedor)
            }

            if (sortConfig) {
                query = query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' })
            } else {
                query = query.order('fecha', { ascending: false })
            }

            const from = (page - 1) * pageSize
            const { data: pageData, count, error } = await query.range(from, from + pageSize - 1)
            if (error) throw error

            return { items: (pageData || []) as Gasto[], totalCount: count || 0 }
        }
    })

    // --- 2. Agregados por proveedor (mismo periodo, SIN filtrar por proveedor) ---
    // Se recorre la tabla por lotes para no toparse con el límite de filas de
    // PostgREST y que los totales sean siempre exactos.
    const { data: agregados, isLoading: isLoadingStats } = useQuery({
        queryKey: ['gastos', 'agregados', ...filterKey],
        queryFn: async () => {
            type FilaAgregada = Pick<Gasto, 'proveedor' | 'total' | 'base_imponible' | 'iva_importe'>
            const filas: FilaAgregada[] = []

            for (let offset = 0; ; offset += CHUNK) {
                const query = applyCommonFilters(
                    supabase.from('gastos').select('proveedor,total,base_imponible,iva_importe'),
                    filters
                ).order('fecha', { ascending: false }).range(offset, offset + CHUNK - 1)

                const { data: lote, error } = await query
                if (error) throw error
                if (!lote || lote.length === 0) break

                filas.push(...(lote as unknown as FilaAgregada[]))
                if (lote.length < CHUNK) break
            }

            const mapa = new Map<string, ResumenProveedor>()
            let totalGastos = 0
            let totalBase = 0
            let totalIva = 0

            for (const fila of filas) {
                const nombre = (fila.proveedor || 'Sin proveedor').trim()
                const total = Number(fila.total) || 0
                const base = Number(fila.base_imponible) || 0
                const iva = Number(fila.iva_importe) || 0

                totalGastos += total
                totalBase += base
                totalIva += iva

                const actual = mapa.get(nombre) || { proveedor: nombre, total: 0, base: 0, iva: 0, numGastos: 0 }
                actual.total += total
                actual.base += base
                actual.iva += iva
                actual.numGastos += 1
                mapa.set(nombre, actual)
            }

            const porProveedor = Array.from(mapa.values()).sort((a, b) => b.total - a.total)

            return {
                stats: { totalGastos, totalBase, totalIva, numGastos: filas.length },
                porProveedor,
                proveedores: porProveedor.map(p => p.proveedor).sort((a, b) => a.localeCompare(b, 'es')),
            }
        }
    })

    const gastos = data?.items || []
    const totalCount = data?.totalCount || 0
    const stats = agregados?.stats || { totalGastos: 0, totalBase: 0, totalIva: 0, numGastos: 0 }
    const porProveedor = agregados?.porProveedor || []
    const proveedores = agregados?.proveedores || []

    /** Total del proveedor seleccionado (o del conjunto si no hay filtro). */
    const totalProveedorSeleccionado = proveedor && proveedor !== 'all'
        ? (porProveedor.find(p => p.proveedor === proveedor)?.total || 0)
        : stats.totalGastos

    const invalidar = () => queryClient.invalidateQueries({ queryKey: ['gastos'] })

    // --- Mutaciones ---
    const numerico = (v: unknown) => {
        if (v === '' || v === null || v === undefined) return 0
        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
        return Number.isFinite(n) ? n : 0
    }

    const updateExpense = useMutation({
        mutationFn: async (data: ExpenseUpdateInput) => {
            const { id, ...resto } = data
            if (!id) throw new Error('Falta el identificador del gasto')

            const payload: Record<string, unknown> = {
                ...resto,
                base_imponible: numerico(resto.base_imponible),
                iva_importe: numerico(resto.iva_importe),
                total: numerico(resto.total),
            }

            if (resto.iva_porcentaje !== undefined) {
                payload.iva_porcentaje = numerico(resto.iva_porcentaje)
            }
            // 'descripcion' y 'concepto' conviven en la tabla: se mantienen
            // sincronizadas para que la ficha y el listado muestren lo mismo.
            if (resto.descripcion !== undefined) {
                payload.concepto = resto.descripcion
            }
            if (resto.referencia_pedido !== undefined) {
                payload.referencia = resto.referencia_pedido
            }

            // La tabla 'gastos' no tiene las mismas columnas en todas las
            // instalaciones. Se lee la fila y sólo se envían las columnas que
            // existen de verdad: así una columna que falte (por ejemplo
            // 'referencia_pedido' o 'iva_porcentaje') no tumba toda la edición.
            const { data: filaActual, error: errorLectura } = await supabase
                .from('gastos')
                .select('*')
                .eq('id', id)
                .single()

            if (errorLectura) throw errorLectura
            if (!filaActual) throw new Error('El gasto ya no existe')

            const columnasReales = new Set(Object.keys(filaActual))
            const payloadFinal: Record<string, unknown> = {}
            const descartadas: string[] = []

            for (const [columna, valor] of Object.entries(payload)) {
                if (columnasReales.has(columna)) payloadFinal[columna] = valor
                else descartadas.push(columna)
            }

            if (Object.keys(payloadFinal).length === 0) {
                throw new Error('Ninguno de los campos editados existe en la tabla de gastos')
            }

            const { data: actualizadas, error } = await supabase
                .from('gastos')
                .update(payloadFinal)
                .eq('id', id)
                .select('id')

            if (error) throw error

            // Un update que no afecta a ninguna fila no da error en PostgREST:
            // suele ser una política RLS que no permite UPDATE sobre gastos.
            if (!actualizadas || actualizadas.length === 0) {
                throw new Error(
                    'La base de datos no ha aplicado el cambio (0 filas). Revisa los permisos (RLS) de UPDATE en la tabla gastos.'
                )
            }

            return { descartadas }
        },
        onSuccess: (resultado) => {
            invalidar()
            toast.success('Gasto actualizado')
            if (resultado?.descartadas.length) {
                toast.warning(
                    `Estos campos no existen en la base de datos y no se han guardado: ${resultado.descartadas.join(', ')}. Ejecuta la migración SQL de gastos.`
                )
            }
        },
        onError: (error: Error) => {
            toast.error('Error al actualizar: ' + error.message)
        }
    })

    const createExpense = useMutation({
        mutationFn: async (data: ExpenseInput) => {
            const payload = {
                ...data,
                base_imponible: numerico(data.base_imponible),
                iva_importe: numerico(data.iva_importe),
                total: numerico(data.total),
            }
            const { error } = await supabase.from('gastos').insert(payload)
            if (error) throw error
        },
        onSuccess: () => {
            invalidar()
            toast.success('Gasto creado')
        },
        onError: (error: Error) => {
            toast.error('Error: ' + error.message)
        }
    })

    const deleteExpense = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('gastos').delete().eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            invalidar()
            toast.success('Gasto eliminado')
        },
        onError: (error: Error) => {
            toast.error('Error: ' + error.message)
        }
    })

    return {
        gastos,
        totalCount,
        stats,
        porProveedor,
        proveedores,
        totalProveedorSeleccionado,
        isLoading,
        isLoadingStats,
        updateExpense,
        createExpense,
        deleteExpense
    }
}

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Presupuesto } from '@/types'
import { toast } from 'sonner'
import { endOfMonth, startOfMonth } from 'date-fns'

export function useBudgets({
    page = 1,
    pageSize = 10,
    search = '',
    filter = 'all',
    month = 'all',
    year = 'all',
    sortConfig = null
}: {
    page?: number,
    pageSize?: number,
    search?: string,
    filter?: string,
    month?: string,
    year?: string,
    sortConfig?: { key: string, direction: 'asc' | 'desc' } | null
} = {}) {
    const queryClient = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['budgets', page, pageSize, search, filter, month, year, sortConfig],
        queryFn: async () => {
            // Helper to get date range
            const getDateRange = () => {
                let start: string | undefined
                let end: string | undefined

                const currentYear = year === 'all' ? undefined : Number(year)
                const currentMonth = month === 'all' ? undefined : Number(month)

                if (currentYear && currentMonth !== undefined) {
                    const d = new Date(currentYear, currentMonth, 1)
                    start = d.toISOString()
                    end = endOfMonth(d).toISOString()
                } else if (currentYear) {
                    const d = new Date(currentYear, 0, 1)
                    start = d.toISOString()
                    end = new Date(currentYear, 11, 31, 23, 59, 59).toISOString()
                }
                return { start, end }
            }

            const { start, end } = getDateRange()

            // 1. Fetch Counters efficiently (filtered by Date only)
            const fetchCounters = async () => {
                let q = supabase.from('presupuestos').select('statuses, es_enviado, estado_vida', { count: 'exact', head: false })
                if (start && end) {
                    q = q.gte('fecha', start).lte('fecha', end)
                }
                const { data: allRows } = await q
                if (!allRows) return { all: 0, pendiente: 0, traspasado: 0, enviado: 0 }

                // Using 'statuses' array for robust counting
                // Pendiente: Contains 'pendiente'
                // Traspasado: Contains 'traspasado'
                // Enviado: Contains 'enviado' (independent)
                return {
                    all: allRows.length,
                    pendiente: allRows.filter(r => r.statuses?.includes('pendiente')).length,
                    traspasado: allRows.filter(r => r.statuses?.includes('traspasado')).length,
                    enviado: allRows.filter(r => r.statuses?.includes('enviado')).length
                }
            }
            const counters = await fetchCounters()

            // 2. Main Data Query
            let query = supabase.from('presupuestos').select('*', { count: 'exact' })

            // Apply Date Filter
            if (start && end) {
                query = query.gte('fecha', start).lte('fecha', end)
            }

            // Apply Status Filter (Strict: Array containment)
            if (filter !== 'all') {
                if (filter === 'PENDIENTE') {
                    query = query.contains('statuses', ['pendiente'])
                } else if (filter === 'TRASPASADO') {
                    query = query.contains('statuses', ['traspasado'])
                } else if (filter === 'ENVIADO') {
                    query = query.contains('statuses', ['enviado'])
                }
            }

            // Apply Search
            if (search) {
                query = query.or(`numero.ilike.%${search}%,cliente_razon_social.ilike.%${search}%,pedido_referencia.ilike.%${search}%,cliente_cif.ilike.%${search}%`)
            }

            // Apply Sort
            if (sortConfig) {
                query = query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' })
            } else {
                query = query.order('created_at', { ascending: false })
            }

            const from = (page - 1) * pageSize
            const to = from + pageSize - 1

            const { data: pageData, count, error } = await query.range(from, to)
            if (error) throw error

            // 3. Stats (Total Ofertado vs Aceptado) - Respecting Date Filter
            let statsQuery = supabase.from('presupuestos').select('total, statuses')
            if (start && end) {
                statsQuery = statsQuery.gte('fecha', start).lte('fecha', end)
            }
            const { data: statsData } = await statsQuery

            const totalOfertado = statsData?.reduce((acc, curr) => acc + (curr.total || 0), 0) || 0
            const totalAceptado = statsData?.filter(r => r.statuses?.includes('traspasado')).reduce((acc, curr) => acc + (curr.total || 0), 0) || 0

            return {
                budgets: pageData as Presupuesto[],
                totalCount: count || 0,
                counters,
                stats: {
                    totalOfertado,
                    totalAceptado
                }
            }
        }
    })

    const budgets = data?.budgets || []
    const totalCount = data?.totalCount || 0
    const stats = data?.stats || { totalOfertado: 0, totalAceptado: 0 }
    const counters = data?.counters || { all: 0, pendiente: 0, traspasado: 0, enviado: 0 }

    // Fetch single budget
    const getBudget = async (id: string) => {
        const { data, error } = await supabase
            .from('presupuestos')
            .select('*')
            .eq('id', id)
            .single()
        if (error) throw error
        return data as Presupuesto
    }

    const createBudget = useMutation({
        mutationFn: async (newBudget: Partial<Presupuesto>) => {
            // 1. Get next number
            const { data: counter, error: counterError } = await supabase
                .from('contadores')
                .select('ultimo_numero')
                .eq('tipo', 'presupuesto')
                .single()

            if (counterError && counterError.code !== 'PGRST116') {
                throw counterError
            }

            const nextNum = (counter?.ultimo_numero || 0) + 1
            const year = new Date().getFullYear()
            const formattedNum = `P-${year}-${nextNum.toString().padStart(3, '0')}`

            const payload = {
                ...newBudget,
                numero: formattedNum,
                fecha: newBudget.fecha || new Date().toISOString()
            }

            // 2. Insert Budget
            const { data, error } = await supabase
                .from('presupuestos')
                .insert(payload)
                .select()
                .single()

            if (error) throw error

            // 3. Update counter
            await supabase.from('contadores').upsert({
                tipo: 'presupuesto',
                anio: year,
                ultimo_numero: nextNum
            })

            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budgets'] })
            toast.success('Presupuesto creado correctamente')
        },
        onError: (error: any) => {
            toast.error('Error al crear presupuesto: ' + error.message)
        }
    })

    const updateBudget = useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Presupuesto> & { id: string }) => {
            const { data, error } = await supabase
                .from('presupuestos')
                .update(updates)
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budgets'] })
            toast.success('Presupuesto actualizado')
        },
        onError: (error: any) => {
            toast.error('Error: ' + error.message)
        }
    })

    return {
        budgets,
        totalCount,
        stats,
        counters,
        isLoading,
        getBudget,
        createBudget,
        updateBudget
    }
}

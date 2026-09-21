'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Factura } from '@/types'
import { toast } from 'sonner'
import { endOfMonth, startOfMonth } from 'date-fns'

export function useInvoices({
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
        queryKey: ['facturas', page, pageSize, search, filter, month, year, sortConfig],
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
                let q = supabase.from('facturas').select('statuses, es_enviado, estado_vida', { count: 'exact', head: false })

                if (start && end) {
                    q = q.gte('fecha', start).lte('fecha', end)
                }
                const { data: allRows } = await q
                if (!allRows) return { all: 0, pendiente: 0, pagada: 0, enviado: 0 }

                return {
                    all: allRows.length,
                    pendiente: allRows.filter(r => r.statuses?.includes('pendiente')).length,
                    pagada: allRows.filter(r => r.statuses?.includes('pagada')).length,
                    enviado: allRows.filter(r => r.statuses?.includes('enviado')).length
                }
            }
            const counters = await fetchCounters()

            // 2. Main Data Query
            let query = supabase.from('facturas').select('*', { count: 'exact' })

            // Apply Date Filter
            if (start && end) {
                query = query.gte('fecha', start).lte('fecha', end)
            }

            // Apply Status Filter (Strict)
            if (filter !== 'all') {
                if (filter === 'PENDIENTE') {
                    query = query.contains('statuses', ['pendiente'])
                } else if (filter === 'PAGADA') {
                    query = query.contains('statuses', ['pagada'])
                } else if (filter === 'ENVIADA') {
                    query = query.contains('statuses', ['enviado'])
                }
            }

            // Apply Search
            if (search) {
                query = query.or(`numero.ilike.%${search}%,cliente_razon_social.ilike.%${search}%,cliente_cif.ilike.%${search}%`)
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

            // 3. Stats (Total Facturado, Total Cobrado) - Respecting Date Filter
            let statsQuery = supabase.from('facturas').select('total, statuses')

            if (start && end) {
                statsQuery = statsQuery.gte('fecha', start).lte('fecha', end)
            }
            const { data: statsData } = await statsQuery

            const totalFacturado = statsData?.reduce((acc, curr) => acc + (curr.total || 0), 0) || 0
            const totalCobrado = statsData?.filter(r => r.statuses?.includes('pagada')).reduce((acc, curr) => acc + (curr.total || 0), 0) || 0

            return {
                items: pageData as Factura[],
                totalCount: count || 0,
                counters,
                stats: {
                    totalFacturado,
                    totalCobrado
                }
            }
        }
    })

    const facturas = data?.items || []
    const totalCount = data?.totalCount || 0
    const stats = data?.stats || { totalFacturado: 0, totalCobrado: 0 }
    const counters = data?.counters || { all: 0, pendiente: 0, pagada: 0, enviado: 0 }

    // Fetch single
    const getInvoice = async (id: string) => {
        const { data, error } = await supabase
            .from('facturas')
            .select('*')
            .eq('id', id)
            .single()
        if (error) throw error
        return data as Factura
    }

    const updateInvoice = useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Factura> & { id: string }) => {
            const { updateDocument } = await import('@/actions/documents')
            const result = await updateDocument(id, updates, 'factura')
            if (!result.success) throw result.error
            return result
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['facturas'] })
            toast.success('Factura actualizada')
        },
        onError: (error: any) => {
            toast.error('Error: ' + error.message)
        }
    })


    return {
        facturas,
        totalCount,
        stats,
        counters,
        isLoading,
        getInvoice,
        updateInvoice
    }
}

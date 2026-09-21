'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Albaran } from '@/types'
import { toast } from 'sonner'
import { endOfMonth, startOfMonth } from 'date-fns'

export function useSignedDeliveryNotes({
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
        queryKey: ['albaranes_firmados', page, pageSize, search, filter, month, year, sortConfig],
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
                let q = supabase.from('albaranes').select('estado_vida, es_enviado', { count: 'exact', head: false })
                    .not('documento_firmado_url', 'is', null) // Only signed albaranes

                if (start && end) {
                    q = q.gte('fecha', start).lte('fecha', end)
                }
                const { data: allRows } = await q
                if (!allRows) return { all: 0, firmado: 0, enviado: 0 }

                return {
                    all: allRows.length,
                    // Firmado = Pendiente (Life Cycle) + Signed (implicit)
                    firmado: allRows.filter(r => r.estado_vida === 'Pendiente').length,
                    enviado: allRows.filter(r => r.es_enviado).length
                }
            }
            const counters = await fetchCounters()

            // 2. Main Data Query
            let query = supabase.from('albaranes').select('*', { count: 'exact' })
                .not('documento_firmado_url', 'is', null) // Only signed albaranes

            // Apply Date Filter
            if (start && end) {
                query = query.gte('fecha', start).lte('fecha', end)
            }

            // Apply Status Filter (Strict)
            if (filter !== 'all') {
                if (filter === 'FIRMADO') {
                    // "Firmado" state implicitly means "Active/Pendiente" in this context
                    query = query.eq('estado_vida', 'Pendiente')
                } else if (filter === 'ENVIADO') {
                    query = query.eq('es_enviado', true)
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
                query = query.order('fecha', { ascending: false })
            }

            const from = (page - 1) * pageSize
            const to = from + pageSize - 1

            const { data: pageData, count, error } = await query.range(from, to)
            if (error) throw error

            // 3. Stats (Total Firmado) - Respecting Date Filter
            let statsQuery = supabase.from('albaranes').select('total')
                .not('documento_firmado_url', 'is', null)

            if (start && end) {
                statsQuery = statsQuery.gte('fecha', start).lte('fecha', end)
            }
            const { data: statsData } = await statsQuery

            const totalSigned = statsData?.reduce((acc, curr) => acc + (curr.total || 0), 0) || 0

            return {
                items: (pageData || []) as Albaran[],
                totalCount: count || 0,
                counters,
                stats: {
                    totalSigned
                }
            }
        }
    })

    const albaranes = data?.items || []
    const totalCount = data?.totalCount || 0
    const stats = data?.stats || { totalSigned: 0 }
    const counters = data?.counters || { all: 0, firmado: 0, enviado: 0 }

    // Mutations
    const updateSignedDeliveryNote = useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Albaran> & { id: string }) => {
            const { data, error } = await supabase
                .from('albaranes')
                .update(updates)
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['albaranes_firmados'] })
            toast.success('Albarán actualizado')
        },
        onError: (error: any) => {
            toast.error('Error: ' + error.message)
        }
    })


    return {
        albaranes,
        totalCount,
        stats,
        counters,
        isLoading,
        updateSignedDeliveryNote
    }
}

'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useNextDocumentNumber(type: 'presupuesto' | 'albaran' | 'factura') {
    return useQuery({
        queryKey: ['next-number', type],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('contadores')
                .select('ultimo_numero')
                .eq('tipo', type)
                .single()

            if (error && error.code !== 'PGRST116') throw error

            const nextNum = (data?.ultimo_numero || 0) + 1
            const year = new Date().getFullYear()
            // P-2026-001 or A-2026-001 or F-2026-001
            const prefix = type === 'presupuesto' ? 'P' : type === 'albaran' ? 'A' : 'F'
            return `${prefix}-${year}-${nextNum.toString().padStart(3, '0')}`
        },
        // Don't refetch too aggressively to avoid jumping numbers if multiple users (optimistic for now)
        refetchOnWindowFocus: false
    })
}

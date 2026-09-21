'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { MaterialPrecio } from '@/types'

export function useMaterialPrices() {
    return useQuery({
        queryKey: ['material-prices'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('precios_materiales')
                .select('*')
                .order('material')

            if (error) throw error
            return data as MaterialPrecio[]
        }
    })
}

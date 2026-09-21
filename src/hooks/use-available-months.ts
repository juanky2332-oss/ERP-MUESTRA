
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

export function useAvailableMonths(table: string) {
    return useQuery({
        queryKey: ['available-months', table],
        queryFn: async () => {
            const dateCol = table === 'presupuestos' ? 'created_at' : 'fecha'

            // Limit to 1000 most recent for performance, or fetch all if manageable. 
            // Fetching just the date column is lightweight.
            const { data, error } = await supabase
                .from(table)
                .select(dateCol)
                .order(dateCol, { ascending: false })

            if (error) throw error

            const months = new Set<string>()
            data?.forEach((row: any) => {
                const dateVal = row[dateCol]
                if (dateVal) {
                    months.add(format(new Date(dateVal), 'yyyy-MM'))
                }
            })

            return Array.from(months)
        },
        staleTime: 1000 * 60 * 5 // Cache for 5 minutes
    })
}

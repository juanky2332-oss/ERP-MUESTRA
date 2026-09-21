import { createClient } from '@/lib/supabase/server'
import { supabase } from '@/lib/supabase'

export async function getNextSequenceNumber(type: 'presupuesto' | 'albaran' | 'factura' | 'gasto', customClient?: any): Promise<string> {
    const tableMap = {
        'presupuesto': 'presupuestos',
        'albaran': 'albaranes',
        'factura': 'facturas',
        'gasto': 'gastos'
    }
    const prefixMap = {
        'presupuesto': 'PREP',
        'albaran': 'ALB',
        'factura': 'FAC',
        'gasto': 'G'
    }
    const table = tableMap[type]
    const prefix = prefixMap[type]
    const year = new Date().getFullYear()
    const client = customClient || supabase

    // IMPORTANTE: sin .order() ni .limit() — el campo "numero" es texto,
    // ordenarlo alfabéticamente no sirve para comparar números.
    // Traemos TODOS los del año y calculamos el máximo nosotros mismos.
    const { data, error } = await client
        .from(table)
        .select('numero')
        .ilike('numero', `${prefix}-%-${year}%`)

    if (error) {
        console.error('Error fetching sequence:', error)
        throw new Error('Could not fetch sequence')
    }

    let maxSeq = 0
    if (data && data.length > 0) {
        const regex = new RegExp(`^${prefix}-(\\d+)-${year}`)
        data.forEach((row: any) => {
            const match = row.numero.match(regex)
            if (match) {
                const seq = parseInt(match[1], 10)
                if (seq > maxSeq) {
                    maxSeq = seq
                }
            }
        })
    }

    const nextNum = maxSeq + 1
    const paddedNum = nextNum.toString().padStart(2, '0')
    return `${prefix}-${paddedNum}-${year}`
}

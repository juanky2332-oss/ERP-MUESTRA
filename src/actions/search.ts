'use server'

import { createClient } from '@/lib/supabase/server'

export type SearchResult = {
    id: string
    type: 'presupuesto' | 'albaran' | 'factura' | 'gasto' | 'albaran_firmado'
    numero: string
    date: string
    client: string
    total: number
    url: string
    reference?: string
}

export async function searchGlobal(query: string): Promise<SearchResult[]> {
    if (!query || query.length < 2) return []

    const supabase = await createClient()
    const searchTerm = `%${query}%`

    // Parallel queries with Error Handling (Promise.allSettled)
    const resultsPromises = [
        supabase.from('presupuestos')
            .select('id, numero, fecha, cliente_razon_social, total, pedido_referencia')
            .or(`numero.ilike.${searchTerm},cliente_razon_social.ilike.${searchTerm},pedido_referencia.ilike.${searchTerm}`)
            .order('fecha', { ascending: false })
            .limit(5)
            .then(res => ({ type: 'presupuesto', ...res })),

        supabase.from('albaranes')
            .select('*')
            .or(`numero.ilike.${searchTerm},cliente_razon_social.ilike.${searchTerm},pedido_referencia.ilike.${searchTerm}`)
            .order('fecha', { ascending: false })
            .limit(5)
            .then(res => ({ type: 'albaran', ...res })),

        supabase.from('facturas')
            .select('id, numero, fecha, cliente_razon_social, total, pedido_referencia')
            .or(`numero.ilike.${searchTerm},cliente_razon_social.ilike.${searchTerm},pedido_referencia.ilike.${searchTerm}`)
            .order('fecha', { ascending: false })
            .limit(5)
            .then(res => ({ type: 'factura', ...res })),

        supabase.from('gastos')
            .select('id, fecha, proveedor, importe, concepto')
            .or(`proveedor.ilike.${searchTerm},concepto.ilike.${searchTerm}`)
            .order('fecha', { ascending: false })
            .limit(5)
            .then(res => ({ type: 'gasto', ...res }))
    ]

    const outcomes = await Promise.allSettled(resultsPromises)
    const results: SearchResult[] = []

    outcomes.forEach((outcome) => {
        if (outcome.status === 'fulfilled') {
            const { type, data, error } = outcome.value as any

            if (!error && data) {
                if (type === 'presupuesto') {
                    data.forEach((p: any) => results.push({
                        id: p.id,
                        type: 'presupuesto',
                        numero: p.numero,
                        date: p.fecha,
                        client: p.cliente_razon_social,
                        total: p.total,
                        url: `/presupuestos?search=${p.numero}`,
                        reference: p.pedido_referencia
                    }))
                } else if (type === 'albaran') {
                    data.forEach((a: any) => {
                        const isSigned = !!a.documento_firmado_url
                        results.push({
                            id: a.id,
                            type: isSigned ? 'albaran_firmado' : 'albaran',
                            numero: a.numero,
                            date: a.fecha,
                            client: a.cliente_razon_social,
                            total: a.total,
                            url: isSigned ? `/albaranes-firmados?search=${a.numero}` : `/albaranes?search=${a.numero}`,
                            reference: a.pedido_referencia
                        })
                    })
                } else if (type === 'factura') {
                    data.forEach((f: any) => results.push({
                        id: f.id,
                        type: 'factura',
                        numero: f.numero,
                        date: f.fecha,
                        client: f.cliente_razon_social,
                        total: f.total,
                        url: `/facturas?search=${f.numero}`,
                        reference: f.pedido_referencia
                    }))
                } else if (type === 'gasto') {
                    data.forEach((g: any) => results.push({
                        id: g.id,
                        type: 'gasto',
                        numero: 'GASTO',
                        date: g.fecha,
                        client: g.proveedor,
                        total: g.importe,
                        url: `/gastos?search=${g.proveedor}`
                    }))
                }
            } else if (error) {
                console.error(`Search Error in ${type}:`, error.message)
            }
        }
    })

    return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15)
}

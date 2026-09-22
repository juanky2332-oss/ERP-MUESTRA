import 'server-only'
import { startOfMonth, endOfMonth, subMonths } from "date-fns"

/**
 * Herramientas de CONSULTA del asistente (solo lectura). Reciben el cliente
 * de Supabase del usuario, así que RLS limita todo a su empresa.
 */

export function getDateRange(period: string, year?: number, month?: number, date_from?: string, date_to?: string) {
    const now = new Date()
    let start: Date, end: Date

    if (period === 'custom_range' && date_from && date_to) {
        start = new Date(date_from + 'T00:00:00')
        end = new Date(date_to + 'T23:59:59')
    } else if (period === 'this_month') {
        start = startOfMonth(now)
        end = endOfMonth(now)
    } else if (period === 'last_month') {
        const lastMonth = subMonths(now, 1)
        start = startOfMonth(lastMonth)
        end = endOfMonth(lastMonth)
    } else if (period === 'custom_month' && year && month) {
        const customDate = new Date(year, month - 1, 1)
        start = startOfMonth(customDate)
        end = endOfMonth(customDate)
    } else if (period === 'this_year') {
        start = new Date(now.getFullYear(), 0, 1)
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
    } else {
        start = new Date(2000, 0, 1)
        end = now
    }
    return { start, end }
}

export const formatEuro = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)

export async function ejecutarLectura(supabase: any, name: string, args: any): Promise<any> {
    // 1. GET ALL DOCUMENTS (FACTURAS, PRESUPUESTOS, ALBARANES)
    if (name === 'get_all_documents') {
        const docType = args.document_type || 'all'
        const limit = args.limit || 200
        const period = args.period || 'all_time'
        const { start, end } = getDateRange(period, args.year, args.month, args.date_from, args.date_to)
        let allDocs: any[] = []

        const applyFilters = (query: any) => {
            if (args.client_name) query = query.ilike('cliente_razon_social', `%${args.client_name}%`)
            if (args.status) query = query.eq('estado', args.status)
            if (period !== 'all_time') query = query.gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
            return query
        }

        if (docType === 'factura' || docType === 'all') {
            let query = supabase.from('facturas').select('*').order('fecha', { ascending: false }).limit(limit)
            query = applyFilters(query)
            if (args.paid_only === true) query = query.or('pagada.eq.true,statuses.cs.{"pagada"}')
            const { data } = await query
            allDocs.push(...(data || []).map((d: any) => ({ ...d, type: 'FACTURA' })))
        }
        if (docType === 'presupuesto' || docType === 'all') {
            let query = supabase.from('presupuestos').select('*').order('fecha', { ascending: false }).limit(limit)
            const { data } = await applyFilters(query)
            allDocs.push(...(data || []).map((d: any) => ({ ...d, type: 'PRESUPUESTO' })))
        }
        if (docType === 'albaran' || docType === 'all') {
            let query = supabase.from('albaranes').select('*').order('fecha', { ascending: false }).limit(limit)
            const { data } = await applyFilters(query)
            allDocs.push(...(data || []).map((d: any) => ({ ...d, type: 'ALBARAN' })))
        }

        const finalDocs = allDocs.slice(0, limit)
        const totalImporte = finalDocs.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0)
        const facturasDocs = finalDocs.filter(d => d.type === 'FACTURA')
        const pagadas = facturasDocs.filter(d => d.pagada === true || (Array.isArray(d.statuses) && d.statuses.includes('pagada')))
        const pendientes = facturasDocs.filter(d => !d.pagada && !(Array.isArray(d.statuses) && d.statuses.includes('pagada')))

        return {
            filtros_aplicados: {
                cliente: args.client_name || 'todos', periodo: period,
                date_from: args.date_from || null, date_to: args.date_to || null,
                solo_pagadas: args.paid_only === true, estado: args.status || null
            },
            total_importe_exacto_calculado_por_sistema: formatEuro(totalImporte),
            numero_de_documentos: finalDocs.length,
            desglose_facturas: facturasDocs.length > 0 ? {
                total_facturas: facturasDocs.length,
                pagadas: pagadas.length,
                importe_pagadas: formatEuro(pagadas.reduce((acc, d) => acc + (Number(d.total) || 0), 0)),
                pendientes: pendientes.length,
                importe_pendientes: formatEuro(pendientes.reduce((acc, d) => acc + (Number(d.total) || 0), 0))
            } : null,
            documents: finalDocs
        }
    }

    // 2. GET FINANCIAL SUMMARY
    if (name === 'get_financial_summary') {
        const period = args.period || 'this_month'
        const { start, end } = getDateRange(period, args.year, args.month, args.date_from, args.date_to)

        const { data: facturas } = await supabase.from('facturas').select('total, estado, pagada, statuses').gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
        const { data: gastos } = await supabase.from('gastos').select('total, base_imponible, iva_importe').gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
        const { data: presupuestos } = await supabase.from('presupuestos').select('total').gte('fecha', start.toISOString()).lte('fecha', end.toISOString())

        const totalFacturado = facturas?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
        const cobrado = facturas?.filter((f: any) => f.statuses?.includes('pagada') || f.pagada === true).reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
        const pendiente = totalFacturado - cobrado
        const totalGastos = gastos?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || (Number(curr.base_imponible || 0) + Number(curr.iva_importe || 0)) || 0), 0) || 0
        const totalPresupuestos = presupuestos?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0

        return {
            period, date_from: args.date_from || start.toISOString().split('T')[0], date_to: args.date_to || end.toISOString().split('T')[0],
            total_facturado: formatEuro(totalFacturado), cobrado: formatEuro(cobrado), pendiente_cobro: formatEuro(pendiente),
            total_gastos: formatEuro(totalGastos), beneficio_neto: formatEuro(cobrado - totalGastos),
            presupuestos_emitidos: formatEuro(totalPresupuestos),
            num_facturas: facturas?.length || 0, num_presupuestos: presupuestos?.length || 0, num_gastos: gastos?.length || 0
        }
    }

    // 3. GET CLIENT INFORMATION
    if (name === 'get_client_information') {
        const clientName = args.client_name
        let contacto: any = null
        try {
            const { data: c } = await supabase.from('contactos').select('*').ilike('razon_social', `%${clientName}%`).limit(1).single()
            contacto = c
        } catch { }

        const [{ data: facturas }, { data: presupuestos }, { data: albaranes }, { data: albFirmados }, { data: gastos }, { data: emails }] = await Promise.all([
            supabase.from('facturas').select('id, numero, fecha, total, estado, pagada, statuses, pedido_referencia').ilike('cliente_razon_social', `%${clientName}%`).order('fecha', { ascending: false }).limit(50),
            supabase.from('presupuestos').select('id, numero, fecha, total, estado, pedido_referencia').ilike('cliente_razon_social', `%${clientName}%`).order('fecha', { ascending: false }).limit(10),
            supabase.from('albaranes').select('id, numero, fecha, total, estado, pedido_referencia').ilike('cliente_razon_social', `%${clientName}%`).order('fecha', { ascending: false }).limit(10),
            supabase.from('albaranes').select('id, numero, fecha, total, estado_vida, pedido_referencia').ilike('cliente_razon_social', `%${clientName}%`).not('documento_firmado_url', 'is', null).order('fecha', { ascending: false }).limit(10),
            supabase.from('gastos').select('id, numero, fecha, total, proveedor, descripcion').ilike('proveedor', `%${clientName}%`).order('fecha', { ascending: false }).limit(5),
            supabase.from('notificaciones_historial').select('*').or(`destinatario.ilike.%${clientName}%,asunto.ilike.%${clientName}%`).order('created_at', { ascending: false }).limit(5)
        ] as any)

        const totalFacturado = facturas?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
        const totalCobrado = facturas?.filter((f: any) => f.pagada === true || (Array.isArray(f.statuses) && f.statuses.includes('pagada'))).reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
        const totalPendiente = totalFacturado - totalCobrado

        return {
            contact_info: contacto || null,
            resumen_financiero: {
                total_facturado: formatEuro(totalFacturado), total_cobrado: formatEuro(totalCobrado), total_pendiente: formatEuro(totalPendiente),
                num_facturas_pagadas: facturas?.filter((f: any) => f.pagada === true || (Array.isArray(f.statuses) && f.statuses.includes('pagada'))).length || 0,
                num_facturas_pendientes: facturas?.filter((f: any) => !f.pagada && !(Array.isArray(f.statuses) && f.statuses.includes('pagada'))).length || 0
            },
            num_facturas: facturas?.length || 0, num_presupuestos: presupuestos?.length || 0, num_albaranes: albaranes?.length || 0,
            num_albaranes_firmados: (albFirmados as any[])?.length || 0,
            recent_invoices: facturas?.slice(0, 10) || [], recent_budgets: presupuestos?.slice(0, 5) || [],
            recent_albaranes: albaranes?.slice(0, 5) || [], recent_albaranes_firmados: albFirmados?.slice(0, 5) || [], recent_emails: emails || []
        }
    }

    // 4. GET CONTACTS
    if (name === 'get_contacts') {
        let query = supabase.from('contactos').select('*').order('razon_social', { ascending: true })
        if (args.search) query = query.or(`razon_social.ilike.%${args.search}%,email.ilike.%${args.search}%,cif.ilike.%${args.search}%,telefono.ilike.%${args.search}%`)
        query = query.limit(args.limit || 20)
        const { data } = await query
        return { total: data?.length || 0, contacts: data || [] }
    }

    // 5. GET GASTOS
    if (name === 'get_gastos') {
        const period = args.period || 'all_time'
        const { start, end } = getDateRange(period, args.year, args.month, args.date_from, args.date_to)
        let query = supabase.from('gastos').select('*').order('fecha', { ascending: false })
        if (period !== 'all_time') query = query.gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
        if (args.proveedor) query = query.ilike('proveedor', `%${args.proveedor}%`)
        if (args.search) query = query.or(`proveedor.ilike.%${args.search}%,descripcion.ilike.%${args.search}%,numero.ilike.%${args.search}%`)
        query = query.limit(args.limit || 200)
        const { data } = await query
        const totalGastos = data?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
        return { total_gastos_exacto_calculado_por_sistema: formatEuro(totalGastos), num_gastos: data?.length || 0, gastos: data || [] }
    }

    // 6. GET ALBARANES FIRMADOS
    if (name === 'get_albaranes_firmados') {
        let query = supabase.from('albaranes').select('*').not('documento_firmado_url', 'is', null).order('fecha', { ascending: false })
        if (args.client_name) query = query.ilike('cliente_razon_social', `%${args.client_name}%`)
        if (args.status) query = query.eq('estado_vida', args.status)
        if (args.period && args.period !== 'all_time') {
            const { start, end } = getDateRange(args.period, args.year, args.month, args.date_from, args.date_to)
            query = query.gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
        }
        query = query.limit(args.limit || 200)
        const { data, error } = await query
        if (error) return { error: 'Error: ' + error.message }
        const totalAmount = data?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
        return { total_importe_exacto_calculado_por_sistema: formatEuro(totalAmount), num_albaranes_firmados: data?.length || 0, albaranes_firmados: data || [] }
    }

    // 7. GET EMAIL HISTORY
    if (name === 'get_email_history') {
        let query = supabase.from('notificaciones_historial').select('*').order('created_at', { ascending: false })
        if (args.client_name) query = query.or(`destinatario.ilike.%${args.client_name}%,asunto.ilike.%${args.client_name}%`)
        if (args.document_type) query = query.eq('tipo_documento', args.document_type)
        query = query.limit(args.limit || 10)
        const { data } = await query
        return { total_emails: data?.length || 0, emails: data || [] }
    }

    // 8. GET PENDING ITEMS
    if (name === 'get_pending_items') {
        const { data: unpaid } = await supabase.from('facturas').select('id, numero, fecha, fecha_vencimiento, cliente_razon_social, total, importe_cobrado, estado_cobro').neq('estado_cobro', 'pagada').or('anulada.is.null,anulada.eq.false')
        const lista = (unpaid || []).map((f: any) => ({ ...f, pendiente: Math.round((Number(f.total) - Number(f.importe_cobrado || 0)) * 100) / 100 }))
        return {
            unpaid_invoices: lista,
            total_unpaid_amount_exacto: formatEuro(lista.reduce((acc: number, f: any) => acc + f.pendiente, 0))
        }
    }

    // 9. SEARCH DOCUMENTS
    if (name === 'search_documents') {
        const query = args.query
        const [{ data: facturas }, { data: presupuestos }, { data: albaranes }, { data: gastos }, { data: contactos }, albFirmadosResult] = await Promise.all([
            supabase.from('facturas').select('*').or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
            supabase.from('presupuestos').select('*').or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
            supabase.from('albaranes').select('*').or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
            supabase.from('gastos').select('*').or(`numero.ilike.%${query}%,proveedor.ilike.%${query}%,descripcion.ilike.%${query}%,referencia_pedido.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
            supabase.from('contactos').select('*').or(`razon_social.ilike.%${query}%,email.ilike.%${query}%,cif.ilike.%${query}%,telefono.ilike.%${query}%`).limit(10),
            supabase.from('albaranes').select('*').not('documento_firmado_url', 'is', null).or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10)
        ] as any)

        return {
            totales_exactos_calculados_por_sistema: {
                facturas: formatEuro(facturas?.reduce((a: number, c: any) => a + (Number(c.total) || 0), 0) || 0),
                presupuestos: formatEuro(presupuestos?.reduce((a: number, c: any) => a + (Number(c.total) || 0), 0) || 0),
                albaranes: formatEuro(albaranes?.reduce((a: number, c: any) => a + (Number(c.total) || 0), 0) || 0),
                gastos: formatEuro(gastos?.reduce((a: number, c: any) => a + (Number(c.total) || 0), 0) || 0)
            },
            facturas: facturas || [], presupuestos: presupuestos || [], albaranes: albaranes || [], gastos: gastos || [],
            contactos: contactos || [], albaranes_firmados: albFirmadosResult?.data || []
        }
    }

    return undefined
}

import { format, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCurrency } from '@/lib/utils'
import { OWN_COMPANY } from '@/lib/company'

const HELP_TEXT = `<b>Comandos rápidos</b>
/cliente NOMBRE — buscar un cliente
/factura NUMERO — estado de una factura
/presupuesto NUMERO — estado de un presupuesto
/resumen — resumen económico del mes
/ayuda — esta ayuda

También puedes escribirme cualquier pregunta en lenguaje normal
("¿cuánto le hemos cobrado a Empresa A?", "hazme un presupuesto para...")
y te responderé con los datos reales del ERP.`

export async function handleCommand(supabase: any, text: string): Promise<string> {
    const [cmdRaw, ...rest] = text.trim().split(/\s+/)
    const cmd = cmdRaw.toLowerCase()
    const arg = rest.join(' ').trim()

    if (cmd === '/start') {
        return `Hola 👋 Soy el bot de ${OWN_COMPANY.nombre}. Tu cuenta ya está vinculada.\n\n${HELP_TEXT}`
    }

    if (cmd === '/ayuda' || cmd === '/help') {
        return HELP_TEXT
    }

    if (cmd === '/resumen') {
        return handleResumen(supabase)
    }

    if (cmd === '/factura') {
        return handleFactura(supabase, arg)
    }

    if (cmd === '/presupuesto') {
        return handlePresupuesto(supabase, arg)
    }

    if (cmd === '/cliente') {
        return handleCliente(supabase, arg)
    }

    return `No he entendido ese comando. Escribe /ayuda para ver lo que puedo hacer.`
}

async function handleResumen(supabase: any): Promise<string> {
    const today = new Date()
    const start = startOfMonth(today).toISOString()
    const end = endOfMonth(today).toISOString()

    const [{ data: facturasMes }, { data: pendientes }, { data: presupuestosPend }] = await Promise.all([
        supabase.from('facturas').select('total, pagada, fecha_pago, created_at').gte('created_at', start).lte('created_at', end),
        supabase.from('facturas').select('total, fecha_vencimiento').eq('pagada', false),
        supabase.from('presupuestos').select('total, aceptado, rechazado, statuses').eq('aceptado', false).eq('rechazado', false),
    ])

    // Un presupuesto ya 'traspasado' (convertido en albarán) ya no cuenta
    // como pendiente de decisión, aunque nadie marcara aceptado/rechazado.
    const presupuestosRealmentePendientes = (presupuestosPend || []).filter((p: any) => !(p.statuses || []).includes('traspasado'))

    const facturado = (facturasMes || []).reduce((a: number, f: any) => a + Number(f.total), 0)
    const cobrado = (facturasMes || []).filter((f: any) => f.pagada).reduce((a: number, f: any) => a + Number(f.total), 0)
    const pendienteTotal = (pendientes || []).reduce((a: number, f: any) => a + Number(f.total), 0)
    const vencido = (pendientes || []).filter((f: any) => f.fecha_vencimiento && new Date(f.fecha_vencimiento) < today).reduce((a: number, f: any) => a + Number(f.total), 0)
    const presupuestosTotal = presupuestosRealmentePendientes.reduce((a: number, p: any) => a + Number(p.total), 0)

    return `📊 <b>Resumen de ${format(today, 'MMMM yyyy', { locale: es })}</b>
Facturado: ${formatCurrency(facturado)}
Cobrado: ${formatCurrency(cobrado)}
Pendiente de cobro: ${formatCurrency(pendienteTotal)}
Vencido: ${formatCurrency(vencido)}
Presupuestos por decidir: ${presupuestosRealmentePendientes.length} (${formatCurrency(presupuestosTotal)})`
}

async function handleFactura(supabase: any, numero: string): Promise<string> {
    if (!numero) return 'Indica el número: /factura FAC-01-2026'

    const { data } = await supabase.from('facturas').select('*').ilike('numero', `%${numero}%`).limit(1).maybeSingle()
    if (!data) return `No encuentro ninguna factura que coincida con "${numero}".`

    const vencida = !data.pagada && data.fecha_vencimiento && new Date(data.fecha_vencimiento) < new Date()
    const estado = data.pagada ? '✅ Pagada' : vencida ? '🔴 Vencida' : '🟡 Pendiente'

    return `🧾 <b>${data.numero}</b>
Cliente: ${data.cliente_razon_social}
Total: ${formatCurrency(Number(data.total))}
Estado: ${estado}${data.fecha_vencimiento ? `\nVencimiento: ${format(new Date(data.fecha_vencimiento), "d MMM yyyy", { locale: es })}` : ''}`
}

async function handlePresupuesto(supabase: any, numero: string): Promise<string> {
    if (!numero) return 'Indica el número: /presupuesto PREP-01-2026'

    const { data } = await supabase.from('presupuestos').select('*').ilike('numero', `%${numero}%`).limit(1).maybeSingle()
    if (!data) return `No encuentro ningún presupuesto que coincida con "${numero}".`

    const estado = data.aceptado ? '✅ Aceptado' : data.rechazado ? '❌ Rechazado' : '🟡 Pendiente de decisión'

    return `📄 <b>${data.numero}</b>
Cliente: ${data.cliente_razon_social}
Total: ${formatCurrency(Number(data.total))}
Estado: ${estado}`
}

async function handleCliente(supabase: any, nombre: string): Promise<string> {
    if (!nombre) return 'Indica un nombre: /cliente Empresa A'

    const { data } = await supabase.from('contactos').select('*').ilike('razon_social', `%${nombre}%`).limit(5)
    if (!data || data.length === 0) return `No encuentro ningún cliente que coincida con "${nombre}".`

    if (data.length > 1) {
        return `Encontré ${data.length} coincidencias:\n${data.map((c: any) => `• ${c.razon_social}`).join('\n')}\n\nEscribe el nombre completo para ver el detalle.`
    }

    const c = data[0]
    const [{ data: tarifa }, { data: facturasPend }] = await Promise.all([
        supabase.from('client_rate_cards').select('*').eq('cliente_id', c.id).eq('active', true).maybeSingle(),
        supabase.from('facturas').select('total').eq('cliente_id', c.id).eq('pagada', false),
    ])

    const pendienteTotal = (facturasPend || []).reduce((a: number, f: any) => a + Number(f.total), 0)

    return `👤 <b>${c.razon_social}</b>
${c.telefono ? `Tel: ${c.telefono}\n` : ''}${c.email ? `Email: ${c.email}\n` : ''}Tarifa: ${tarifa ? `${Number(tarifa.hourly_rate).toFixed(2)} €/h (propia)` : 'tarifa por defecto de empresa'}
Facturas pendientes: ${(facturasPend || []).length} (${formatCurrency(pendienteTotal)})`
}

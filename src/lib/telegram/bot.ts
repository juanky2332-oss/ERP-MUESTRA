import { format, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCurrency } from '@/lib/utils'
import { OWN_COMPANY } from '@/lib/company'

const HELP_TEXT = `<b>Comandos disponibles</b>
/hoy — intervenciones de hoy
/partes — partes de trabajo abiertos
/cliente NOMBRE — buscar un cliente
/factura NUMERO — estado de una factura
/presupuesto NUMERO — estado de un presupuesto
/resumen — resumen económico del mes
/ayuda — esta ayuda`

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

    if (cmd === '/hoy') {
        return handleHoy(supabase)
    }

    if (cmd === '/partes') {
        return handlePartes(supabase)
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

async function handleHoy(supabase: any): Promise<string> {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
        .from('work_orders')
        .select('numero, cliente_razon_social, status, tecnico_nombre')
        .eq('service_date', today)
        .order('created_at')

    if (!data || data.length === 0) return '📅 No hay partes de trabajo programados para hoy.'

    const lines = data.map((w: any) => `• <b>${w.numero}</b> — ${w.cliente_razon_social} (${w.status}${w.tecnico_nombre ? `, ${w.tecnico_nombre}` : ''})`)
    return `📅 <b>Hoy tienes ${data.length} parte(s):</b>\n${lines.join('\n')}`
}

async function handlePartes(supabase: any): Promise<string> {
    const { data } = await supabase
        .from('work_orders')
        .select('numero, cliente_razon_social, status')
        .not('status', 'in', '(convertido,cancelado)')
        .order('created_at', { ascending: false })
        .limit(10)

    if (!data || data.length === 0) return '✅ No tienes partes de trabajo abiertos.'

    const lines = data.map((w: any) => `• <b>${w.numero}</b> — ${w.cliente_razon_social} (${w.status})`)
    return `🔧 <b>Partes abiertos (${data.length}):</b>\n${lines.join('\n')}`
}

async function handleResumen(supabase: any): Promise<string> {
    const today = new Date()
    const start = startOfMonth(today).toISOString()
    const end = endOfMonth(today).toISOString()

    const [{ data: facturasMes }, { data: pendientes }, { data: presupuestosPend }, { data: partesAbiertos }] = await Promise.all([
        supabase.from('facturas').select('total, pagada, fecha_pago, created_at').gte('created_at', start).lte('created_at', end),
        supabase.from('facturas').select('total, fecha_vencimiento').eq('pagada', false),
        supabase.from('presupuestos').select('total').eq('aceptado', false).eq('rechazado', false),
        supabase.from('work_orders').select('id').not('status', 'in', '(convertido,cancelado)'),
    ])

    const facturado = (facturasMes || []).reduce((a: number, f: any) => a + Number(f.total), 0)
    const cobrado = (facturasMes || []).filter((f: any) => f.pagada).reduce((a: number, f: any) => a + Number(f.total), 0)
    const pendienteTotal = (pendientes || []).reduce((a: number, f: any) => a + Number(f.total), 0)
    const vencido = (pendientes || []).filter((f: any) => f.fecha_vencimiento && new Date(f.fecha_vencimiento) < today).reduce((a: number, f: any) => a + Number(f.total), 0)
    const presupuestosTotal = (presupuestosPend || []).reduce((a: number, p: any) => a + Number(p.total), 0)

    return `📊 <b>Resumen de ${format(today, 'MMMM yyyy', { locale: es })}</b>
Facturado: ${formatCurrency(facturado)}
Cobrado: ${formatCurrency(cobrado)}
Pendiente de cobro: ${formatCurrency(pendienteTotal)}
Vencido: ${formatCurrency(vencido)}
Presupuestos por decidir: ${(presupuestosPend || []).length} (${formatCurrency(presupuestosTotal)})
Partes abiertos: ${(partesAbiertos || []).length}`
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

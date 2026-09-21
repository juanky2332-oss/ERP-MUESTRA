import { OpenAI } from "openai"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { startOfMonth, endOfMonth, subMonths } from "date-fns"

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

// Schema Definition for Chatbot Context
const DB_SCHEMA = `
CRITICAL: DATABASE STRUCTURE (READ CAREFULLY)

1. TABLE 'facturas'
   - Columns: id, numero (string), fecha (date), cliente_id, cliente_razon_social, cliente_email, total (number), estado ('PENDIENTE','PAGADA','ENVIADA'), pagada (bool), enviada (bool), statuses (array text e.g. ['pagada','enviado']), pedido_referencia, descripcion, base_imponible, iva_porcentaje, iva_importe, created_at.

2. TABLE 'presupuestos'
   - Columns: id, numero, fecha, cliente_id, cliente_razon_social, total, estado ('borrador','enviado','aceptado'), pedido_referencia, descripcion, base_imponible, iva_porcentaje, statuses (array), created_at.

3. TABLE 'albaranes'
   - Columns: id, numero, fecha, cliente_id, cliente_razon_social, total, estado ('pendiente','facturado'), pedido_referencia, descripcion, base_imponible, statuses (array), documento_firmado_url, es_enviado, created_at.

4. TABLE 'albaranes' — also contains albaranes firmados (signed) when 'documento_firmado_url' is NOT null.
   - Columns: id, numero, fecha, cliente_id, cliente_razon_social, total, estado, pedido_referencia, descripcion, base_imponible, statuses, documento_firmado_url (URL of the signed PDF, null if not signed), es_enviado (bool), estado_vida ('Pendiente','Traspasado'), created_at.
   - To get signed/firmados: filter WHERE documento_firmado_url IS NOT NULL

5. TABLE 'gastos'
   - Columns: id, fecha, numero, proveedor, referencia_pedido, descripcion, base_imponible, iva_importe, total, factura_url, created_at.

6. TABLE 'notificaciones_historial' (EMAIL LOGS)
   - Columns: id, destinatario, email_destinatario, tipo_documento, numero_documento, asunto, created_at.

7. TABLE 'contactos' (CLIENTS)
   - Columns: id, razon_social, email, telefono, cif, direccion, ciudad, codigo_postal, provincia, notas, total_facturado.
`

const tools = [
    {
        type: "function",
        function: {
            name: "get_all_documents",
            description: "Obtener una lista de documentos (facturas, presupuestos, albaranes). Úsalo también cuando pregunten por totales de un mes específico de estos documentos. Soporta rangos de fecha personalizados con date_from y date_to.",
            parameters: {
                type: "object",
                properties: {
                    document_type: { type: "string", enum: ["all", "factura", "presupuesto", "albaran"] },
                    client_name: { type: "string", description: "Filtrar por nombre de cliente" },
                    status: { type: "string", description: "Filtrar por estado exacto (ej: 'PENDIENTE', 'PAGADA', 'ENVIADA')" },
                    paid_only: { type: "boolean", description: "Si true, devuelve SOLO facturas cobradas/pagadas (pagada=true O statuses contiene 'pagada'). Úsalo cuando pregunten por 'cobrado', 'pagado', 'facturación cobrada'." },
                    period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time", "custom_month", "custom_range"], description: "Filtrar por fecha. Usar 'custom_range' cuando se especifiquen fechas exactas con date_from y date_to." },
                    year: { type: "number", description: "Año si period='custom_month'" },
                    month: { type: "number", description: "Mes si period='custom_month'" },
                    date_from: { type: "string", description: "Fecha de inicio en formato YYYY-MM-DD para rango personalizado (custom_range)" },
                    date_to: { type: "string", description: "Fecha de fin en formato YYYY-MM-DD para rango personalizado (custom_range)" },
                    limit: { type: "number", description: "Número de resultados (max 200, default 200 para obtener todos y calcular totales exactos)" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_financial_summary",
            description: "Obtener resumen financiero general (total facturado, cobrado, pendiente, gastos, beneficios). Soporta rangos personalizados con date_from y date_to.",
            parameters: {
                type: "object",
                properties: {
                    period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time", "custom_month", "custom_range"] },
                    year: { type: "number" },
                    month: { type: "number" },
                    date_from: { type: "string", description: "Fecha inicio YYYY-MM-DD" },
                    date_to: { type: "string", description: "Fecha fin YYYY-MM-DD" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_client_information",
            description: "Obtener información completa de un cliente: facturas, presupuestos, albaranes, gastos, etc.",
            parameters: {
                type: "object",
                properties: {
                    client_name: { type: "string", description: "Nombre parcial o completo del cliente" }
                },
                required: ["client_name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_contacts",
            description: "Buscar contactos/clientes en la agenda.",
            parameters: {
                type: "object",
                properties: {
                    search: { type: "string" },
                    limit: { type: "number" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_gastos",
            description: "Obtener gastos/facturas de proveedores.",
            parameters: {
                type: "object",
                properties: {
                    period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time", "custom_month", "custom_range"] },
                    year: { type: "number" },
                    month: { type: "number" },
                    date_from: { type: "string", description: "Fecha inicio YYYY-MM-DD" },
                    date_to: { type: "string", description: "Fecha fin YYYY-MM-DD" },
                    proveedor: { type: "string" },
                    search: { type: "string" },
                    limit: { type: "number" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_albaranes_firmados",
            description: "Obtener albaranes firmados digitalizados.",
            parameters: {
                type: "object",
                properties: {
                    client_name: { type: "string" },
                    status: { type: "string", enum: ["Pendiente", "Traspasado"] },
                    period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time", "custom_month", "custom_range"] },
                    year: { type: "number" },
                    month: { type: "number" },
                    date_from: { type: "string", description: "Fecha inicio YYYY-MM-DD" },
                    date_to: { type: "string", description: "Fecha fin YYYY-MM-DD" },
                    limit: { type: "number" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_email_history",
            description: "Consultar historial de correos enviados a clientes.",
            parameters: {
                type: "object",
                properties: {
                    client_name: { type: "string" },
                    document_type: { type: "string", enum: ["factura", "presupuesto", "albaran"] },
                    limit: { type: "number" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_pending_items",
            description: "Obtener elementos pendientes de acción.",
            parameters: {
                type: "object",
                properties: {
                    item_type: { type: "string", enum: ["all", "unpaid_invoices"] }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_documents",
            description: "Buscar por texto libre en todos los documentos.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string" }
                },
                required: ["query"]
            }
        }
    }
]

function getDateRange(period: string, year?: number, month?: number, date_from?: string, date_to?: string) {
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

const formatEuro = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)

export async function POST(req: Request) {
    try {
        const { messages, transcript } = await req.json()
        const supabase = await createClient()

        const processedMessages = transcript
            ? [...messages, { role: "user", content: transcript }]
            : messages

        const runner = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Eres el asistente inteligente del ERP de Empresa X.

════════════════════════════════════════════
🔴 LEY NÚMERO 1 — OBLIGATORIO SIEMPRE
════════════════════════════════════════════
ANTE CUALQUIER PREGUNTA SOBRE DATOS (facturas, importes, clientes, fechas, estados, totales, documentos):
→ PRIMERO llama al tool correspondiente.
→ LUEGO lee el resultado LITERALMENTE tal como viene de la base de datos.
→ SOLO ENTONCES responde.

PROHIBIDO responder sobre datos sin haber llamado al tool antes.
PROHIBIDO asumir, inferir o recordar datos de conversaciones anteriores.
PROHIBIDO inventar ningún número, fecha, estado o documento.

════════════════════════════════════════════
🔴 LEY NÚMERO 2 — LEE LOS DATOS EXACTOS
════════════════════════════════════════════
Cada documento en la base de datos tiene campos exactos. Léelos SIN interpretarlos:

▸ FECHA → usa el campo "fecha" exactamente como está. No la cambies.
▸ ESTADO → lee el campo "estado" tal cual: 'PENDIENTE', 'PAGADA', 'ENVIADA', etc.
▸ PAGADA → lee el campo booleano "pagada": true = cobrada, false = no cobrada.
▸ STATUSES → lee el array "statuses": si contiene 'pagada' = cobrada.
▸ TOTAL → usa el número exacto del campo "total". No redondees. No sumes tú.

Si una factura tiene fecha 2025-05-07, estado PENDIENTE y pagada=false:
→ ES PENDIENTE. No está cobrada. Punto.

Si una factura tiene pagada=true o statuses=['pagada']:
→ ESTÁ COBRADA. Punto.

NUNCA asumas que una factura está pagada porque "tiene fecha antigua" o "parece que sí".
NUNCA asumas que está pendiente porque "parece reciente".
LEE EL CAMPO. RESPONDE LO QUE DICE EL CAMPO.

════════════════════════════════════════════
🔴 LEY NÚMERO 3 — TOTALES EXACTOS DEL SISTEMA
════════════════════════════════════════════
NUNCA sumes tú mismo los importes.
USA SIEMPRE los campos que devuelve el sistema:
- "total_importe_exacto_calculado_por_sistema"
- "total_facturado", "cobrado", "total_gastos"
- "importe_pagadas", "importe_pendientes"

════════════════════════════════════════════
🔴 LEY NÚMERO 4 — NO CEDES ANTE EL USUARIO
════════════════════════════════════════════
Si el usuario dice "pero yo creo que son X€" y los datos dicen Y€:
→ Responde: "Según los datos exactos del sistema, el importe es Y€. No X€."
→ No cedas. No digas "puede que tengas razón". Los datos mandan.

Si el usuario insiste con una cifra incorrecta, repite los datos reales.

════════════════════════════════════════════
📌 CÓMO INTERPRETAR PREGUNTAS DE DATOS
════════════════════════════════════════════

"¿Cuánto hemos COBRADO de X?" / "facturación cobrada" / "lo que nos han PAGADO"
→ get_all_documents con client_name=X, document_type='factura', paid_only=true
→ Filtra SOLO facturas con pagada=true O statuses contiene 'pagada'
→ NUNCA incluir ENVIADAS o PENDIENTES

"¿Cuánto hemos FACTURADO a X?" / "facturas emitidas" / "total facturado"
→ get_all_documents con client_name=X, document_type='factura', SIN paid_only
→ Incluye TODAS las facturas

"¿Qué facturas tiene PENDIENTES X?" / "qué nos deben"
→ get_all_documents con client_name=X, status='PENDIENTE'
→ O get_pending_items

DIFERENCIA CRÍTICA: FACTURADO ≠ COBRADO ≠ ENVIADO
- ENVIADA = se mandó la factura, NO significa cobrada
- PAGADA = está cobrada
- PENDIENTE = no cobrada, no enviada aún

════════════════════════════════════════════
📅 FECHAS Y RANGOS PERSONALIZADOS
════════════════════════════════════════════
Cuando el usuario diga fechas concretas ("desde el 13/03", "entre enero y abril", "hasta hoy"):
→ period='custom_range', date_from='YYYY-MM-DD', date_to='YYYY-MM-DD'
→ "Hasta hoy" = ${new Date().toISOString().split('T')[0]}
→ "Desde X sin fecha fin" → date_to = ${new Date().toISOString().split('T')[0]}

Convierte siempre fechas en español a formato YYYY-MM-DD antes de llamar al tool.
Ejemplos: "13 de marzo" → "2025-03-13" | "07 de mayo" → "2025-05-07"

════════════════════════════════════════════
✅ HERRAMIENTAS DISPONIBLES
════════════════════════════════════════════
get_all_documents      → Facturas, presupuestos, albaranes (con filtros de fecha, cliente, estado, paid_only)
get_financial_summary  → Resumen financiero del período
get_client_information → Todo sobre un cliente
get_contacts           → Agenda de clientes
get_gastos             → Gastos y facturas de proveedores
get_albaranes_firmados → Albaranes con firma digital
get_email_history      → Historial de correos enviados
get_pending_items      → Elementos pendientes de acción
search_documents       → Búsqueda libre en todos los documentos

════════════════════════════════════════════
📋 FORMATO DE RESPUESTA
════════════════════════════════════════════
- MONEDA: Euros (€), cifra exacta del sistema, sin redondear.
- FECHAS: Formato español dd/mes/año al mostrar, YYYY-MM-DD al filtrar.
- IDIOMA: Castellano profesional.
- TOTALES: Muestra siempre qué filtros aplicaste (período, cliente, solo pagadas, etc.).
- Si no hay datos: "No se han encontrado registros con esos criterios."
- Emojis solo para estructura, no decorativos.

${DB_SCHEMA}

Fecha actual: ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
Fecha ISO: ${new Date().toISOString().split('T')[0]}`
                },
                ...processedMessages
            ],
            tools: tools as any,
            tool_choice: "required"
        })

        const message = runner.choices[0].message

        if (message.tool_calls) {
            const toolMessages = []

            for (const toolCall of message.tool_calls) {
                const args = JSON.parse((toolCall as any).function.arguments)
                let result: any = {}

                // 1. GET ALL DOCUMENTS (FACTURAS, PRESUPUESTOS, ALBARANES)
                if ((toolCall as any).function.name === 'get_all_documents') {
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

                        // Filtro de pagadas: si paid_only=true, solo facturas cobradas
                        if (args.paid_only === true) {
                            query = query.or('pagada.eq.true,statuses.cs.{"pagada"}')
                        }

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

                    // CÁLCULO EXACTO
                    const totalImporte = finalDocs.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0)

                    // Desglose por estado para transparencia
                    const facturasDocs = finalDocs.filter(d => d.type === 'FACTURA')
                    const pagadas = facturasDocs.filter(d => d.pagada === true || (Array.isArray(d.statuses) && d.statuses.includes('pagada')))
                    const pendientes = facturasDocs.filter(d => !d.pagada && !(Array.isArray(d.statuses) && d.statuses.includes('pagada')))

                    result = {
                        filtros_aplicados: {
                            cliente: args.client_name || 'todos',
                            periodo: period,
                            date_from: args.date_from || null,
                            date_to: args.date_to || null,
                            solo_pagadas: args.paid_only === true,
                            estado: args.status || null
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
                if ((toolCall as any).function.name === 'get_financial_summary') {
                    const period = args.period || 'this_month'
                    const { start, end } = getDateRange(period, args.year, args.month, args.date_from, args.date_to)

                    const { data: facturas } = await supabase.from('facturas').select('total, estado, pagada, statuses').gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
                    const { data: gastos } = await supabase.from('gastos').select('total, base_imponible, iva_importe').gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
                    const { data: presupuestos } = await supabase.from('presupuestos').select('total').gte('fecha', start.toISOString()).lte('fecha', end.toISOString())

                    const totalFacturado = facturas?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                    const cobrado = facturas?.filter((f: any) => f.statuses?.includes('pagada') || f.pagada === true).reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                    const pendiente = totalFacturado - cobrado
                    const totalGastos = gastos?.reduce((acc: number, curr: any) => {
                        return acc + (Number(curr.total) || (Number(curr.base_imponible || 0) + Number(curr.iva_importe || 0)) || 0)
                    }, 0) || 0
                    const totalPresupuestos = presupuestos?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0

                    result = {
                        period,
                        date_from: args.date_from || start.toISOString().split('T')[0],
                        date_to: args.date_to || end.toISOString().split('T')[0],
                        total_facturado: formatEuro(totalFacturado),
                        cobrado: formatEuro(cobrado),
                        pendiente_cobro: formatEuro(pendiente),
                        total_gastos: formatEuro(totalGastos),
                        beneficio_neto: formatEuro(cobrado - totalGastos),
                        presupuestos_emitidos: formatEuro(totalPresupuestos),
                        num_facturas: facturas?.length || 0,
                        num_presupuestos: presupuestos?.length || 0,
                        num_gastos: gastos?.length || 0
                    }
                }

                // 3. GET CLIENT INFORMATION
                if ((toolCall as any).function.name === 'get_client_information') {
                    const clientName = args.client_name
                    let contacto: any = null
                    try {
                        const { data: c } = await supabase.from('contactos').select('*').ilike('razon_social', `%${clientName}%`).limit(1).single()
                        contacto = c
                    } catch { }

                    const [
                        { data: facturas },
                        { data: presupuestos },
                        { data: albaranes },
                        { data: albFirmados },
                        { data: gastos },
                        { data: emails }
                    ] = await Promise.all([
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

                    result = {
                        contact_info: contacto || null,
                        resumen_financiero: {
                            total_facturado: formatEuro(totalFacturado),
                            total_cobrado: formatEuro(totalCobrado),
                            total_pendiente: formatEuro(totalPendiente),
                            num_facturas_pagadas: facturas?.filter((f: any) => f.pagada === true || (Array.isArray(f.statuses) && f.statuses.includes('pagada'))).length || 0,
                            num_facturas_pendientes: facturas?.filter((f: any) => !f.pagada && !(Array.isArray(f.statuses) && f.statuses.includes('pagada'))).length || 0
                        },
                        num_facturas: facturas?.length || 0,
                        num_presupuestos: presupuestos?.length || 0,
                        num_albaranes: albaranes?.length || 0,
                        num_albaranes_firmados: (albFirmados as any[])?.length || 0,
                        recent_invoices: facturas?.slice(0, 10) || [],
                        recent_budgets: presupuestos?.slice(0, 5) || [],
                        recent_albaranes: albaranes?.slice(0, 5) || [],
                        recent_albaranes_firmados: albFirmados?.slice(0, 5) || [],
                        recent_emails: emails || []
                    }
                }

                // 4. GET CONTACTS
                if ((toolCall as any).function.name === 'get_contacts') {
                    let query = supabase.from('contactos').select('*').order('razon_social', { ascending: true })
                    if (args.search) {
                        query = query.or(`razon_social.ilike.%${args.search}%,email.ilike.%${args.search}%,cif.ilike.%${args.search}%,telefono.ilike.%${args.search}%`)
                    }
                    query = query.limit(args.limit || 20)
                    const { data } = await query
                    result = { total: data?.length || 0, contacts: data || [] }
                }

                // 5. GET GASTOS
                if ((toolCall as any).function.name === 'get_gastos') {
                    const period = args.period || 'all_time'
                    const { start, end } = getDateRange(period, args.year, args.month, args.date_from, args.date_to)

                    let query = supabase.from('gastos').select('*').order('fecha', { ascending: false })
                    if (period !== 'all_time') query = query.gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
                    if (args.proveedor) query = query.ilike('proveedor', `%${args.proveedor}%`)
                    if (args.search) query = query.or(`proveedor.ilike.%${args.search}%,descripcion.ilike.%${args.search}%,numero.ilike.%${args.search}%`)
                    query = query.limit(args.limit || 200)

                    const { data } = await query
                    const totalGastos = data?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0

                    result = {
                        total_gastos_exacto_calculado_por_sistema: formatEuro(totalGastos),
                        num_gastos: data?.length || 0,
                        gastos: data || []
                    }
                }

                // 6. GET ALBARANES FIRMADOS
                if ((toolCall as any).function.name === 'get_albaranes_firmados') {
                    let query = supabase.from('albaranes').select('*').not('documento_firmado_url', 'is', null).order('fecha', { ascending: false })

                    if (args.client_name) query = query.ilike('cliente_razon_social', `%${args.client_name}%`)
                    if (args.status) query = query.eq('estado_vida', args.status)
                    if (args.period && args.period !== 'all_time') {
                        const { start, end } = getDateRange(args.period, args.year, args.month, args.date_from, args.date_to)
                        query = query.gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
                    }
                    query = query.limit(args.limit || 200)
                    const { data, error } = await query

                    if (error) {
                        result = { error: 'Error: ' + error.message }
                    } else {
                        const totalAmount = data?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                        result = {
                            total_importe_exacto_calculado_por_sistema: formatEuro(totalAmount),
                            num_albaranes_firmados: data?.length || 0,
                            albaranes_firmados: data || []
                        }
                    }
                }

                // 7. GET EMAIL HISTORY
                if ((toolCall as any).function.name === 'get_email_history') {
                    let query = supabase.from('notificaciones_historial').select('*').order('created_at', { ascending: false })
                    if (args.client_name) query = query.or(`destinatario.ilike.%${args.client_name}%,asunto.ilike.%${args.client_name}%`)
                    if (args.document_type) query = query.eq('tipo_documento', args.document_type)
                    query = query.limit(args.limit || 10)
                    const { data } = await query
                    result = { total_emails: data?.length || 0, emails: data || [] }
                }

                // 8. GET PENDING ITEMS
                if ((toolCall as any).function.name === 'get_pending_items') {
                    const itemType = args.item_type || 'all'
                    let pendingData: any = {}

                    if (itemType === 'unpaid_invoices' || itemType === 'all') {
                        const { data: unpaid } = await supabase.from('facturas').select('*').neq('estado', 'PAGADA').neq('pagada', true)
                        pendingData.unpaid_invoices = unpaid || []
                        pendingData.total_unpaid_amount_exacto = formatEuro(unpaid?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0)
                    }
                    result = pendingData
                }

                // 9. SEARCH DOCUMENTS
                if ((toolCall as any).function.name === 'search_documents') {
                    const query = args.query
                    const [
                        { data: facturas },
                        { data: presupuestos },
                        { data: albaranes },
                        { data: gastos },
                        { data: contactos },
                        albFirmadosResult
                    ] = await Promise.all([
                        supabase.from('facturas').select('*').or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('presupuestos').select('*').or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('albaranes').select('*').or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('gastos').select('*').or(`numero.ilike.%${query}%,proveedor.ilike.%${query}%,descripcion.ilike.%${query}%,referencia_pedido.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('contactos').select('*').or(`razon_social.ilike.%${query}%,email.ilike.%${query}%,cif.ilike.%${query}%,telefono.ilike.%${query}%`).limit(10),
                        supabase.from('albaranes').select('*').not('documento_firmado_url', 'is', null).or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10)
                    ] as any)

                    const totalFac = facturas?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                    const totalPres = presupuestos?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                    const totalAlb = albaranes?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                    const totalGast = gastos?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0

                    result = {
                        totales_exactos_calculados_por_sistema: {
                            facturas: formatEuro(totalFac),
                            presupuestos: formatEuro(totalPres),
                            albaranes: formatEuro(totalAlb),
                            gastos: formatEuro(totalGast)
                        },
                        facturas: facturas || [],
                        presupuestos: presupuestos || [],
                        albaranes: albaranes || [],
                        gastos: gastos || [],
                        contactos: contactos || [],
                        albaranes_firmados: albFirmadosResult?.data || []
                    }
                }

                toolMessages.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: (toolCall as any).function.name,
                    content: JSON.stringify(result)
                })
            }

            const finalResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `REGLAS DE PRESENTACIÓN FINAL — OBLIGATORIAS:

1. USA los totales del sistema. NUNCA calcules tú: usa "total_importe_exacto_calculado_por_sistema", "cobrado", "importe_pagadas", "total_facturado", etc.

2. LEE EL ESTADO REAL de cada documento. Si el campo "estado" dice PENDIENTE → di PENDIENTE. Si "pagada"=false → no está cobrada. No interpretes, no asumas.

3. MUESTRA los filtros aplicados: período, cliente, si es solo pagadas o todas, rango de fechas. El usuario tiene que saber exactamente qué incluye el resultado.

4. Si hay campo "desglose_facturas" en el resultado, muéstralo: cuántas pagadas, cuántas pendientes, con sus importes exactos.

5. Si el usuario mencionó una cifra diferente a la real → corrígele: "Los datos del sistema indican X€, no Y€." No cedas.

6. Si no hay registros → "No se han encontrado registros con esos criterios."

7. Usa EMOJIS para estructura visual. NO asteriscos. Formato limpio.

8. Al listar facturas, muestra siempre: número, fecha (dd/mm/aaaa), cliente, importe, estado real.`
                    },
                    ...processedMessages,
                    message,
                    ...toolMessages
                ]
            })

            return NextResponse.json(finalResponse.choices[0].message)
        }

        return NextResponse.json(message)

    } catch (error) {
        console.error("Chat Error:", error)
        return NextResponse.json({
            role: 'assistant',
            content: "❌ Error de sistema. Inténtalo de nuevo."
        }, { status: 500 })
    }
}

import { OpenAI } from "openai"
import { startOfMonth, endOfMonth, subMonths } from "date-fns"
import { getNextSequenceNumber } from "@/lib/sequences"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool"
    content: string
    [key: string]: any
}

// Schema Definition for Chatbot Context
const DB_SCHEMA = `
CRITICAL: DATABASE STRUCTURE (READ CAREFULLY)

1. TABLE 'facturas'
   - Columns: id, numero (string), fecha (date), cliente_id, cliente_razon_social, cliente_email, total (number), estado ('PENDIENTE','PAGADA','ENVIADA'), pagada (bool), enviada (bool), statuses (array text e.g. ['pagada','enviado']), pedido_referencia, descripcion, base_imponible, iva_porcentaje, iva_importe, fecha_vencimiento, created_at.

2. TABLE 'presupuestos'
   - Columns: id, numero, fecha, cliente_id, cliente_razon_social, total, estado ('borrador','enviado','aceptado'), aceptado (bool), rechazado (bool), pedido_referencia, descripcion, base_imponible, iva_porcentaje, statuses (array; 'traspasado' significa que YA se convirtió en albarán y por tanto ya NO está pendiente de decisión), created_at.

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
    },
    {
        type: "function",
        function: {
            name: "crear_presupuesto",
            description: "Crea un presupuesto REAL en el sistema. Solo llama a esta función cuando el usuario haya confirmado explícitamente (en este mensaje o en uno anterior de la conversación) que quiere crearlo, y tengas cliente y al menos una línea con importe. Si falta algo, PREGÚNTALO antes de llamar a esta función; no inventes datos.",
            parameters: {
                type: "object",
                properties: {
                    client_name: { type: "string", description: "Nombre del cliente, debe existir ya como contacto en el sistema" },
                    lineas: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                descripcion: { type: "string" },
                                cantidad: { type: "number" },
                                precio_unitario: { type: "number", description: "Precio unitario SIN IVA" }
                            },
                            required: ["descripcion", "cantidad", "precio_unitario"]
                        }
                    },
                    iva_porcentaje: { type: "number", description: "Por defecto 21 si no se indica" },
                    observaciones: { type: "string" }
                },
                required: ["client_name", "lineas"]
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

const SYSTEM_PROMPT = `Eres el asistente inteligente del ERP de Empresa X.

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
▸ STATUSES → lee el array "statuses": si contiene 'pagada' = cobrada. Si un PRESUPUESTO contiene 'traspasado' = ya se convirtió en albarán, YA NO está pendiente de decisión aunque aceptado/rechazado estén en false.
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
📄 CREACIÓN DE DOCUMENTOS (crear_presupuesto)
════════════════════════════════════════════
Puedes crear presupuestos de verdad con la tool crear_presupuesto. Reglas:
- Necesitas el nombre del cliente (debe existir ya en contactos; si no lo encuentras, dilo y pide que lo den de alta primero en el ERP) y al menos una línea con descripción, cantidad y precio.
- Si el usuario no ha dado todos los datos, PREGÚNTALOS uno a uno, no inventes cantidades ni precios.
- Antes de llamar a la tool, resume lo que vas a crear (cliente, líneas, total aproximado) y espera un "sí"/"confirmar" del usuario en el mensaje actual o inmediatamente anterior. No crees nada sin esa confirmación explícita.
- Tras crear el documento, confirma el número de presupuesto generado.

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
→ "Hasta hoy" = {{HOY_ISO}}
→ "Desde X sin fecha fin" → date_to = {{HOY_ISO}}

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
crear_presupuesto      → Crear un presupuesto real (con confirmación previa del usuario)

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

Fecha actual: {{HOY_LARGO}}
Fecha ISO: {{HOY_ISO}}`

async function executeTool(supabase: any, name: string, args: any): Promise<any> {
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
        const { data: unpaid } = await supabase.from('facturas').select('*').neq('estado', 'PAGADA').neq('pagada', true)
        return {
            unpaid_invoices: unpaid || [],
            total_unpaid_amount_exacto: formatEuro(unpaid?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0)
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

    // 10. CREAR PRESUPUESTO (acción real)
    if (name === 'crear_presupuesto') {
        const { data: contacto } = await supabase.from('contactos').select('*').ilike('razon_social', `%${args.client_name}%`).limit(1).maybeSingle()
        if (!contacto) {
            return { error: `No existe ningún cliente que coincida con "${args.client_name}". Debe darse de alta primero en el ERP (sección Clientes) antes de poder crear un presupuesto para él.` }
        }

        const lineas = (args.lineas || []).map((l: any) => ({
            descripcion: l.descripcion,
            cantidad: Number(l.cantidad) || 1,
            precio_unitario: Number(l.precio_unitario) || 0,
        }))
        const base = lineas.reduce((acc: number, l: any) => acc + l.cantidad * l.precio_unitario, 0)
        const ivaPct = Number(args.iva_porcentaje) || 21
        const ivaImporte = Math.round(base * (ivaPct / 100) * 100) / 100
        const total = Math.round((base + ivaImporte) * 100) / 100

        const numero = await getNextSequenceNumber('presupuesto', supabase)

        const { data: inserted, error } = await supabase.from('presupuestos').insert({
            numero,
            fecha: new Date().toISOString(),
            cliente_id: contacto.id,
            cliente_razon_social: contacto.razon_social,
            cliente_cif: contacto.cif,
            cliente_direccion: contacto.direccion,
            cliente_telefono: contacto.telefono,
            cliente_email: contacto.email,
            lineas,
            subtotal: base,
            base_imponible: base,
            iva_porcentaje: ivaPct,
            iva_importe: ivaImporte,
            total,
            observaciones: args.observaciones || 'Creado desde el asistente IA (Telegram/chat)',
            statuses: ['pendiente'],
            estado_vida: 'Pendiente',
        }).select('id, numero, total').single()

        if (error) return { error: `No se pudo crear el presupuesto: ${error.message}` }

        return {
            creado: true,
            numero: inserted.numero,
            total_exacto: formatEuro(Number(inserted.total)),
            mensaje: `Presupuesto ${inserted.numero} creado correctamente por ${formatEuro(Number(inserted.total))}.`
        }
    }

    return { error: `Herramienta desconocida: ${name}` }
}

/** Ejecuta el asistente ERP (mismo motor que usa el widget de chat web) sobre una conversación dada. */
export async function runErpAssistant(supabase: any, messages: ChatMessage[]): Promise<string> {
    const systemContent = SYSTEM_PROMPT
        .replaceAll('{{HOY_ISO}}', new Date().toISOString().split('T')[0])
        .replaceAll('{{HOY_LARGO}}', new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }))

    const first = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "system", content: systemContent }, ...messages] as any,
        tools: tools as any,
        tool_choice: "required",
    })

    const message = first.choices[0].message

    if (!message.tool_calls || message.tool_calls.length === 0) {
        return message.content || 'No he podido generar una respuesta.'
    }

    const toolMessages = []
    for (const toolCall of message.tool_calls) {
        const args = JSON.parse((toolCall as any).function.arguments || '{}')
        const result = await executeTool(supabase, (toolCall as any).function.name, args)
        toolMessages.push({
            tool_call_id: toolCall.id,
            role: "tool" as const,
            content: JSON.stringify(result),
        })
    }

    const final = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `REGLAS DE PRESENTACIÓN FINAL — OBLIGATORIAS:

1. USA los totales del sistema. NUNCA calcules tú.
2. LEE EL ESTADO REAL de cada documento, sin interpretarlo.
3. MUESTRA los filtros aplicados cuando sea relevante.
4. Si hay "desglose_facturas", muéstralo.
5. Si el usuario mencionó una cifra diferente a la real, corrígele con los datos del sistema.
6. Si no hay registros → "No se han encontrado registros con esos criterios."
7. Si acabas de crear un presupuesto (resultado con "creado": true), confirma el número y el total con claridad.
8. Sé conciso: esta respuesta puede leerse en Telegram o en el chat web. Máximo ~120 palabras salvo que listes varios documentos.
9. Usa emojis solo para estructura, no decorativos. Nada de asteriscos de markdown.`,
            },
            { role: "system", content: systemContent },
            ...messages,
            message,
            ...toolMessages,
        ] as any,
    })

    return final.choices[0].message.content || 'Hecho.'
}

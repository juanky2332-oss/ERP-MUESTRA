import 'server-only'
import { OpenAI } from "openai"
import type { Contexto } from "@/lib/auth"
import { tienePermiso } from "@/lib/permisos"
import { ejecutarLectura, formatEuro } from "@/lib/ai/herramientas-lectura"
import { buscarDocumentoPorNumero, emailsDeCliente, NOMBRE, type TipoDocumento } from "@/lib/documentos/servidor"
import { crearAccion, describirAccion, ejecutarAccion, cancelarAccion, ultimaAccionPendiente, type Accion } from "@/lib/acciones/servidor"
import { resumenCobros, borradorReclamacion, conInfo, CAMPOS_FACTURA_COBRO } from "@/lib/cobros/servidor"
import { hoyISO, etiquetaMetodo, METODOS_PAGO, offsetMadrid, rangoDiaMadrid } from "@/lib/cobros/vencimientos"
import { CATEGORIAS_GASTO } from "@/lib/gastos/servidor"
import { registrarUsoIA, comprobarCupoIA } from "@/lib/ai/uso"
import { auditar } from "@/lib/auditoria"
import { MATERIALES, precioConMercado, INDICES_REFERENCIA, type Material } from "@/lib/calculadora/materiales"
import { calcular, FORMAS, type FormaId } from "@/lib/calculadora/calculo"
import { obtenerMercado } from "@/lib/calculadora/mercado"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODELO = process.env.OPENAI_MODEL_CHAT || 'gpt-4o'

export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool"
    content: string
    [key: string]: any
}

export interface RespuestaAsistente {
    texto: string
    /** Acción preparada que el usuario debe confirmar con un botón. */
    accion?: { id: string; tipo: string; resumen: string } | null
    /** Resultado de una acción ejecutada en este turno. */
    ejecutada?: { ok: boolean; mensaje: string } | null
}

const DB_SCHEMA = `
ESTRUCTURA DE DATOS (resumen)
- facturas: numero, fecha, fecha_vencimiento, cliente_razon_social, total, importe_cobrado, estado_cobro ('pendiente','parcial','pagada'), statuses, forma_pago, metodo_pago, anulada.
- cobros: pagos de facturas (importe, fecha, metodo, origen, estado).
- presupuestos: numero, fecha, fecha_validez, cliente_razon_social, total, statuses ('traspasado' = ya convertido en albarán), aceptado, rechazado.
- albaranes: numero, fecha, cliente_razon_social, total, statuses, documento_firmado_url (firmados).
- gastos: fecha, numero, proveedor, categoria, base_imponible, iva_importe, total.
- contactos (clientes): razon_social, email, email_facturacion, telefono, cif, metodo_pago, condiciones de pago.
- notificaciones_historial: correos enviados.
- eventos: agenda (citas, llamadas, visitas, recordatorios...).
- catalogo: productos, materiales y servicios con precio de venta e IVA.`

const lecturaTools = [
    {
        type: "function", function: {
            name: "get_all_documents",
            description: "Lista documentos (facturas, presupuestos, albaranes) con filtros de fecha, cliente y estado. También para totales de un periodo.",
            parameters: {
                type: "object", properties: {
                    document_type: { type: "string", enum: ["all", "factura", "presupuesto", "albaran"] },
                    client_name: { type: "string" },
                    status: { type: "string" },
                    paid_only: { type: "boolean", description: "Solo facturas cobradas del todo" },
                    period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time", "custom_month", "custom_range"] },
                    year: { type: "number" }, month: { type: "number" },
                    date_from: { type: "string" }, date_to: { type: "string" },
                    limit: { type: "number" }
                }
            }
        }
    },
    {
        type: "function", function: {
            name: "get_financial_summary",
            description: "Resumen financiero: facturado, cobrado, pendiente, gastos y beneficio de un periodo.",
            parameters: { type: "object", properties: { period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time", "custom_month", "custom_range"] }, year: { type: "number" }, month: { type: "number" }, date_from: { type: "string" }, date_to: { type: "string" } } }
        }
    },
    {
        type: "function", function: {
            name: "get_client_information",
            description: "Todo sobre un cliente: datos, facturas, presupuestos, albaranes, correos.",
            parameters: { type: "object", properties: { client_name: { type: "string" } }, required: ["client_name"] }
        }
    },
    { type: "function", function: { name: "get_contacts", description: "Buscar clientes.", parameters: { type: "object", properties: { search: { type: "string" }, limit: { type: "number" } } } } },
    {
        type: "function", function: {
            name: "get_gastos", description: "Gastos y facturas de proveedores.",
            parameters: { type: "object", properties: { period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time", "custom_month", "custom_range"] }, year: { type: "number" }, month: { type: "number" }, date_from: { type: "string" }, date_to: { type: "string" }, proveedor: { type: "string" }, search: { type: "string" }, limit: { type: "number" } } }
        }
    },
    {
        type: "function", function: {
            name: "get_albaranes_firmados", description: "Albaranes firmados digitalizados.",
            parameters: { type: "object", properties: { client_name: { type: "string" }, status: { type: "string", enum: ["Pendiente", "Traspasado"] }, period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time", "custom_month", "custom_range"] }, year: { type: "number" }, month: { type: "number" }, date_from: { type: "string" }, date_to: { type: "string" }, limit: { type: "number" } } }
        }
    },
    { type: "function", function: { name: "get_email_history", description: "Historial de correos enviados a clientes.", parameters: { type: "object", properties: { client_name: { type: "string" }, document_type: { type: "string" }, limit: { type: "number" } } } } },
    { type: "function", function: { name: "search_documents", description: "Búsqueda libre en todos los documentos y clientes.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
    {
        type: "function", function: {
            name: "get_cobros_vencimientos",
            description: "Cobros pendientes y vencimientos: facturas vencidas, que vencen pronto, parciales, cobrado del mes. Úsalo para '¿qué me deben?', '¿qué está vencido?', '¿qué vence esta semana?'.",
            parameters: { type: "object", properties: { filtro: { type: "string", enum: ["vencidas", "vencen_pronto", "pendientes", "parciales", "resumen"] }, dias: { type: "number", description: "Para vencen_pronto: horizonte en días (3, 7, 15, 30)" }, client_name: { type: "string" } } }
        }
    },
    {
        type: "function", function: {
            name: "get_agenda",
            description: "Eventos de agenda (citas, llamadas, visitas, recordatorios) y vencimientos entre dos fechas.",
            parameters: { type: "object", properties: { desde: { type: "string", description: "YYYY-MM-DD" }, hasta: { type: "string", description: "YYYY-MM-DD" } }, required: ["desde", "hasta"] }
        }
    },
    {
        type: "function", function: {
            name: "calcular_pieza",
            description: "Calcula el PESO de una pieza o barra de cualquier material y forma, y el coste del material al precio de la empresa (ajustado al mercado de hoy). Úsalo para '¿cuánto pesa…?', '¿cuánto cuesta el material de…?'. Medidas en mm.",
            parameters: {
                type: "object", properties: {
                    material: { type: "string", description: "Material como lo diga el usuario: 'acero F-114', 'C45', 'inox 304', 'aluminio 6082', 'latón', 'bronce', 'POM'..." },
                    forma: { type: "string", enum: FORMAS.map(f => f.id) },
                    medidas: { type: "object", description: "Claves según la forma: redonda {D,L}; cuadrada {A,L}; hexagonal/octogonal {S,L}; pletina {A,E,L}; tubo {D,E,L}; tubo_rect {A,B,E,L}; chapa {A,B,E}; disco {D,E}; anillo {D,d,E}; angular/perfil_u/perfil_t {A,B,E,L}; esfera {D}; perfil_std {L}; volumen {V en cm³}; peso {P en kg}" },
                    perfil: { type: "object", properties: { serie: { type: "string", enum: ["IPE", "HEB", "HEA", "UPN"] }, talla: { type: "string" } } },
                    cantidad: { type: "number" },
                    sobremedida_mm: { type: "number", description: "Creces en diámetro/sección para el bruto (por defecto 0)" }
                }, required: ["material", "forma", "medidas"]
            }
        }
    },
    {
        type: "function", function: {
            name: "buscar_catalogo",
            description: "Busca productos, materiales o servicios del catálogo (con precio de venta e IVA). Úsalo antes de proponer líneas de presupuesto.",
            parameters: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] }
        }
    },
]

const accionTools = [
    {
        type: "function", function: {
            name: "preparar_envio_documento",
            description: "Prepara el ENVÍO POR CORREO de una factura, presupuesto o albarán con su PDF adjunto. No envía nada: deja la acción lista para que el usuario la confirme. Úsalo SIEMPRE que pidan mandar/enviar/reenviar un documento por email.",
            parameters: {
                type: "object", properties: {
                    tipo_documento: { type: "string", enum: ["factura", "presupuesto", "albaran"] },
                    numero: { type: "string", description: "Número tal como lo diga el usuario (FAC-01-2026, 'fac 01', '42'...)" },
                    client_name: { type: "string", description: "Cliente, si lo menciona (ayuda a desambiguar)" },
                    destinatarios: { type: "array", items: { type: "string" }, description: "Solo si el usuario da emails concretos. Si no, se usa el email del cliente." },
                    cc: { type: "array", items: { type: "string" } },
                    asunto: { type: "string" },
                    mensaje: { type: "string", description: "Cuerpo del correo en texto plano, sin firma (la firma de la empresa se añade sola). Si el usuario pide un texto concreto, redáctalo aquí." }
                }, required: ["tipo_documento", "numero"]
            }
        }
    },
    {
        type: "function", function: {
            name: "preparar_correo",
            description: "Prepara un CORREO a un proveedor, cliente o dirección cualquiera (pedidos, consultas, avisos...). No envía nada hasta que el usuario confirme. POR DEFECTO VA SIN ADJUNTOS: solo rellena 'adjuntar' si el usuario ha pedido EXPRESAMENTE adjuntar un documento concreto.",
            parameters: {
                type: "object", properties: {
                    destinatario: { type: "string", description: "Nombre del proveedor/cliente tal como lo diga el usuario, o un email" },
                    tipo_destinatario: { type: "string", enum: ["proveedor", "cliente", "otro"] },
                    cc: { type: "array", items: { type: "string" } },
                    asunto: { type: "string" },
                    mensaje: { type: "string", description: "Cuerpo del correo en texto plano, con saludo y despedida, sin firma" },
                    adjuntar: {
                        type: "array",
                        description: "SOLO si el usuario pide adjuntar algo explícitamente. Si no lo pide, NO incluyas este campo.",
                        items: { type: "object", properties: { tipo_documento: { type: "string", enum: ["factura", "presupuesto", "albaran"] }, numero: { type: "string" } }, required: ["tipo_documento", "numero"] }
                    }
                }, required: ["destinatario", "asunto", "mensaje"]
            }
        }
    },
    {
        type: "function", function: {
            name: "preparar_cobro",
            description: "Prepara el registro de un COBRO de una factura (pagada entera o pago parcial). No registra nada hasta que el usuario confirme.",
            parameters: {
                type: "object", properties: {
                    numero_factura: { type: "string" },
                    importe: { type: "number", description: "Solo si es un pago parcial o el usuario dice un importe. Si dice 'está pagada', omítelo (se cobra todo lo pendiente)." },
                    metodo: { type: "string", enum: METODOS_PAGO.map(m => m.value) },
                    fecha: { type: "string", description: "YYYY-MM-DD, por defecto hoy" },
                    nota: { type: "string" }
                }, required: ["numero_factura"]
            }
        }
    },
    {
        type: "function", function: {
            name: "preparar_reclamacion_pago",
            description: "Prepara un correo de RECLAMACIÓN de pago de una factura pendiente o vencida, usando la plantilla de la empresa. No envía hasta confirmar.",
            parameters: { type: "object", properties: { numero_factura: { type: "string" }, mensaje: { type: "string", description: "Solo si el usuario quiere un texto distinto al de la plantilla" } }, required: ["numero_factura"] }
        }
    },
    {
        type: "function", function: {
            name: "preparar_gasto",
            description: "Prepara un GASTO con los datos que el usuario ha dado (texto o audio). NO inventes importes, IVA ni proveedor: si falta el total pregúntalo antes. No guarda hasta confirmar.",
            parameters: {
                type: "object", properties: {
                    proveedor: { type: "string" }, fecha: { type: "string" }, concepto: { type: "string" },
                    base_imponible: { type: "number" }, iva_porcentaje: { type: "number" }, iva_importe: { type: "number" }, total: { type: "number" },
                    categoria: { type: "string", enum: [...CATEGORIAS_GASTO] }
                }, required: ["total"]
            }
        }
    },
    {
        type: "function", function: {
            name: "previsualizar_presupuesto",
            description: "Prepara un PRESUPUESTO BORRADOR (calcula totales, comprueba el cliente). No guarda nada hasta que el usuario confirme. No inventes precios: usa el catálogo o lo que diga el usuario.",
            parameters: {
                type: "object", properties: {
                    client_name: { type: "string" },
                    lineas: { type: "array", items: { type: "object", properties: { descripcion: { type: "string" }, cantidad: { type: "number" }, precio_unitario: { type: "number", description: "Sin IVA" } }, required: ["descripcion", "cantidad", "precio_unitario"] } },
                    iva_porcentaje: { type: "number" },
                    observaciones: { type: "string" },
                    dias_validez: { type: "number" }
                }, required: ["client_name", "lineas"]
            }
        }
    },
    {
        type: "function", function: {
            name: "crear_evento_agenda",
            description: "Crea un evento en la agenda (cita, llamada, reunión, visita, recordatorio...). Pregunta la fecha/hora si no la tienes.",
            parameters: {
                type: "object", properties: {
                    titulo: { type: "string" },
                    tipo: { type: "string", enum: ["cita", "reunion", "llamada", "visita", "entrega", "recordatorio", "cobro_previsto", "pago_previsto", "seguimiento_presupuesto", "otro"] },
                    inicio: { type: "string", description: "YYYY-MM-DDTHH:mm (hora de Madrid) o YYYY-MM-DD si es todo el día" },
                    duracion_minutos: { type: "number" },
                    client_name: { type: "string" },
                    notas: { type: "string" }
                }, required: ["titulo", "inicio"]
            }
        }
    },
    {
        type: "function", function: {
            name: "confirmar_accion_pendiente",
            description: "Ejecuta la acción que TÚ preparaste antes (envío, cobro, gasto, presupuesto), SOLO si el último mensaje del usuario es una confirmación clara ('sí', 'envíalo', 'confirmo', 'adelante'). Nunca en el mismo turno en que la preparas.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function", function: {
            name: "cancelar_accion_pendiente",
            description: "Cancela la acción preparada si el usuario dice que no, que la cancele o que no la envíe.",
            parameters: { type: "object", properties: {} }
        }
    },
]

const SYSTEM_PROMPT = `Eres "El Maikel", el asistente del ERP de {{EMPRESA}}: cercano, resolutivo y con ganas de ayudar en todo lo que puedas (dudas de uso del ERP, datos, correos, cobros, gastos, presupuestos, cálculo de piezas y materiales). Si te preguntan quién eres, di que eres El Maikel. Hablas con {{USUARIO}} (rol: {{ROL}}). Tono: profesional pero cercano, de tú.

REGLA 1 — DATOS: ante cualquier pregunta sobre datos, llama primero a la herramienta. Nunca inventes números, fechas, estados, clientes, proveedores, productos, importes ni IVA. Usa los totales que calcula el sistema; no sumes tú.

REGLA 2 — ACCIONES REALES: tú NO puedes enviar correos, registrar cobros, crear gastos ni presupuestos directamente. Para eso tienes herramientas "preparar_*" que dejan la acción lista y la interfaz muestra al usuario un resumen con botones Confirmar / Cancelar.
- Cuando pidan enviar/mandar un DOCUMENTO del ERP (factura, presupuesto, albarán) por correo → preparar_envio_documento.
- Cuando pidan escribir/mandar un correo a un proveedor, cliente o a cualquiera sin que sea "enviar un documento" → preparar_correo. NO adjuntes nada salvo que el usuario lo pida expresamente ("adjunta", "con la factura X en PDF"...). Ante la duda, sin adjuntos. Si piden un texto concreto (p. ej. "formal, pidiendo que confirmen la recepción"), redáctalo tú en 'mensaje' con tono profesional: saludo formal ('Estimados señores:'), cuerpo claro y despedida ('Un cordial saludo.'), sin firma (la firma de la empresa se añade sola). Usa el número de documento completo (p. ej. FAC-01-2026). Nunca uses marcadores tipo [Tu nombre].
- "La factura X está pagada" / "han pagado 300 € de la X" → preparar_cobro.
- "Reclama la factura X" → preparar_reclamacion_pago.
- Gasto dictado → preparar_gasto (si falta el total o el IVA, pregunta UNA sola cosa).
- Peso o coste de material de una pieza/barra → calcular_pieza (si el material es ambiguo, di cuál has usado).
- Presupuesto → previsualizar_presupuesto (busca antes en el catálogo si hay productos).
Después de preparar, responde en 1-2 frases diciendo qué has preparado y pide confirmación. NO repitas todo el resumen (ya lo ve con los botones). NUNCA digas "procederé a enviarlo", "enviaré" o "ya está enviado" si no has recibido de la herramienta un resultado con ok=true.
- Si el usuario confirma por texto ("sí", "envíalo", "ok"), llama a confirmar_accion_pendiente y comunica EXACTAMENTE el mensaje que devuelva.
- Si una herramienta devuelve error o varias coincidencias, explícalo y pregunta.

REGLA 3 — PREGUNTAS: si falta un dato, haz UNA sola pregunta clara (por ejemplo "He encontrado dos clientes con ese nombre, ¿cuál?").

FORMATO: castellano profesional, conciso (esto se lee también en Telegram). Importes en euros con formato español. Fechas dd/mm/aaaa. Puedes usar **negrita** con moderación.

${DB_SCHEMA}

Hoy es {{HOY_LARGO}} ({{HOY_ISO}}).`

const CONFIRMA_RE = /^(s[ií]+|sip|vale|ok(ay)?|okey|dale|adelante|confirm[oa]r?|conforme|correcto|de acuerdo|perfecto|hazlo|env[ií]a(lo|la|r)?|m[aá]nda(lo|la|r)?|cr[eé]a(lo|la|r)?|reg[ií]stra(lo|la|r)?|gu[aá]rda(lo|la|r)?|m[aá]rca(la|lo|r)?)\b/i
const CANCELA_RE = /^(no\b|cancela|cancelar|anula|d[ée]jalo|olv[ií]dalo|no lo env[ií]es|para\b)/i

export function esConfirmacion(texto: string) {
    const t = (texto || '').trim()
    return t.length <= 60 && CONFIRMA_RE.test(t) && !/\?$/.test(t)
}
export function esCancelacion(texto: string) {
    const t = (texto || '').trim()
    return t.length <= 40 && CANCELA_RE.test(t)
}

function accionPublica(a: Accion) {
    return { id: a.id, tipo: a.tipo, resumen: a.resumen }
}

const r2 = (n: number) => Math.round(n * 100) / 100

async function elegirDocumento(ctx: Contexto, tipo: TipoDocumento, numero: string, cliente?: string) {
    let docs = await buscarDocumentoPorNumero(ctx, tipo, numero)
    if (cliente && docs.length > 1) {
        const c = cliente.toLowerCase()
        const filtrados = docs.filter(d => (d.cliente_razon_social || '').toLowerCase().includes(c))
        if (filtrados.length) docs = filtrados
    }
    return docs
}

async function ejecutarAccionTool(ctx: Contexto, name: string, args: any, ultimoUsuario: string, estado: { accion: Accion | null; ejecutada: any }, ultimosUsuario: string[] = [ultimoUsuario]): Promise<any> {
    switch (name) {
        case 'get_cobros_vencimientos': {
            if (!tienePermiso(ctx.rol, 'economico') && !tienePermiso(ctx.rol, 'ver')) return { error: 'Sin permiso' }
            const r = await resumenCobros(ctx)
            let lista = args.filtro === 'vencidas' ? r.vencidas
                : args.filtro === 'vencen_pronto' ? r.proximas.filter(f => (f.info.dias ?? 999) <= (args.dias || 7)).concat(r.venceHoy)
                    : args.filtro === 'parciales' ? r.parciales
                        : r.pendientes
            if (args.client_name) lista = lista.filter(f => f.cliente_razon_social.toLowerCase().includes(String(args.client_name).toLowerCase()))
            return {
                resumen: {
                    pendiente_total: formatEuro(r.pendienteTotal), vencido_total: formatEuro(r.vencidoTotal), num_vencidas: r.vencidas.length,
                    vencen_hoy: r.venceHoy.length, vencen_esta_semana: r.venceEstaSemana, cobrado_este_mes: formatEuro(r.cobradoEsteMes), parciales: r.parciales.length,
                },
                facturas: lista.slice(0, 40).map(f => ({ numero: f.numero, cliente: f.cliente_razon_social, total: formatEuro(f.info.total), cobrado: formatEuro(f.info.cobrado), pendiente: formatEuro(f.info.pendiente), vencimiento: f.fecha_vencimiento, situacion: f.info.etiqueta })),
            }
        }
        case 'get_agenda': {
            const { data: eventos } = await ctx.supabase.from('eventos').select('titulo, tipo, estado, inicio, fin, todo_el_dia, notas, direccion, cliente_id').gte('inicio', rangoDiaMadrid(args.desde).desde).lte('inicio', rangoDiaMadrid(args.hasta).hasta).order('inicio')
            const { data: venc } = await ctx.supabase.from('facturas').select('numero, cliente_razon_social, fecha_vencimiento, total, importe_cobrado').gte('fecha_vencimiento', args.desde).lte('fecha_vencimiento', args.hasta).neq('estado_cobro', 'pagada')
            return { eventos: eventos || [], vencimientos_facturas: (venc || []).map((f: any) => ({ numero: f.numero, cliente: f.cliente_razon_social, vence: f.fecha_vencimiento, pendiente: formatEuro(Number(f.total) - Number(f.importe_cobrado || 0)) })) }
        }
        case 'calcular_pieza': {
            const { data: cfg } = await ctx.supabase.from('calculadora_config').select('precios, materiales_extra').eq('empresa_id', ctx.empresaId).maybeSingle()
            const todos: Material[] = [...MATERIALES, ...((cfg?.materiales_extra || []) as Material[])]
            const q = String(args.material || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            const tokens = q.split(/[\s,/()-]+/).filter(t => t.length >= 2)
            const puntos = (m: Material) => tokens.reduce((a, t) => a + (norm(m.nombre + ' ' + m.norma + ' ' + m.id).includes(t) ? 1 : 0), 0)
            const candidatos = todos.map(m => ({ m, p: puntos(m) })).filter(x => x.p > 0).sort((a, b) => b.p - a.p)
            if (!candidatos.length) return { error: `No reconozco el material "${args.material}". Pregunta cuál es (acero, inox, aluminio, latón, bronce, plástico...).` }
            const material = candidatos[0].m
            const propio = cfg?.precios?.[material.id]
            const mercado = await obtenerMercado()
            const precioKg = propio?.precioKg ? Number(propio.precioKg) : precioConMercado(material.precioKg, material.indice, material.sensibilidad, mercado.cotizaciones, INDICES_REFERENCIA)
            const forma = args.forma as FormaId
            const cant = Math.max(1, Math.round(Number(args.cantidad) || 1))
            const r = calcular({
                material, precioKg, forma, perfil: args.perfil, final: args.medidas || {},
                sobremedida: { seccion: Number(args.sobremedida_mm) || 0, largo: 0, redondearComercial: false },
                cantidad: cant, kerf: 0, largoBarra: 0, merma: 0, descontarViruta: false, operaciones: [], tratamientos: [], otrosLote: 0, margen: 0,
            })
            return {
                material: `${material.nombre} (${material.norma}, ${material.densidad} g/cm³)`,
                otras_coincidencias: candidatos.slice(1, 4).map(x => x.m.nombre),
                peso_por_pieza_kg: r.pesoNeto,
                peso_bruto_por_pieza_kg: r.pesoBruto,
                peso_total_kg: Math.round(r.pesoBruto * cant * 1000) / 1000,
                precio_material_eur_kg: precioKg,
                origen_precio: propio?.precioKg ? `precio propio de la empresa (${propio.fecha})` : 'precio orientativo de almacén ajustado al mercado de hoy',
                coste_material_por_pieza: formatEuro(r.costeMaterialLote / cant),
                coste_material_total: formatEuro(r.costeMaterialLote),
                nota: 'Solo material. Para tiempos de máquina, tratamientos y precio de venta, que use la Calculadora del ERP (menú Calculadora).',
            }
        }
        case 'buscar_catalogo': {
            const t = String(args.texto || '').trim()
            const { data } = await ctx.supabase.from('catalogo').select('nombre, referencia, tipo, descripcion, unidad, precio_venta, iva_porcentaje, categoria').eq('activo', true)
                .or(`nombre.ilike.%${t}%,referencia.ilike.%${t}%,descripcion.ilike.%${t}%,categoria.ilike.%${t}%`).limit(15)
            return { resultados: data || [], nota: (data || []).length ? undefined : 'No hay productos que coincidan en el catálogo. No inventes precios: pregunta al usuario.' }
        }
        case 'preparar_envio_documento': {
            if (!tienePermiso(ctx.rol, 'enviar')) return { error: 'Tu rol no permite enviar correos a clientes.' }
            const tipo = args.tipo_documento as TipoDocumento
            const docs = await elegirDocumento(ctx, tipo, args.numero, args.client_name)
            if (docs.length === 0) return { error: `No encuentro ningún ${NOMBRE[tipo].toLowerCase()} con número "${args.numero}".` }
            if (docs.length > 1) return { varias_coincidencias: docs.slice(0, 6).map(d => `${d.numero} · ${d.cliente_razon_social} · ${formatEuro(Number(d.total))}`), instruccion: 'Pregunta al usuario cuál.' }
            const doc = docs[0]
            const destinatarios = (args.destinatarios?.length ? args.destinatarios : await emailsDeCliente(ctx, doc.cliente_id, doc.cliente_email)).map((e: string) => e.trim()).filter(Boolean)
            if (!destinatarios.length) return { error: `El cliente ${doc.cliente_razon_social} no tiene email guardado. Pide al usuario la dirección de correo.` }
            const nombreDoc = NOMBRE[tipo].toLowerCase()
            const asunto = args.asunto || `${NOMBRE[tipo]} ${doc.numero}`
            const cuerpo = args.mensaje || `Estimados señores:\n\nLes adjuntamos ${tipo === 'factura' ? 'la' : 'el'} ${nombreDoc} ${doc.numero}${doc.total ? `, por importe de ${formatEuro(Number(doc.total))}` : ''}.\n\nLes agradeceríamos que nos confirmasen la recepción de este correo.\n\nQuedamos a su disposición para cualquier consulta.\n\nUn cordial saludo.`
            const payload = { tipo, documentoId: doc.id, numero: doc.numero, cliente: doc.cliente_razon_social, destinatarios, cc: args.cc || [], asunto, cuerpo }
            const accion = await crearAccion(ctx, 'email_documento', payload, describirAccion('email_documento', payload))
            estado.accion = accion
            return { preparado: true, pendiente_de_confirmacion: true, documento: doc.numero, cliente: doc.cliente_razon_social, para: destinatarios, asunto, instruccion: 'NO se ha enviado todavía. Di en una frase que está listo y que pulse Confirmar (o responda "sí").' }
        }
        case 'preparar_correo': {
            if (!tienePermiso(ctx.rol, 'enviar')) return { error: 'Tu rol no permite enviar correos.' }
            const dest = String(args.destinatario || '').trim()
            let destinatarios: string[] = [], nombre = dest, tipoDest = args.tipo_destinatario || 'otro'
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
                destinatarios = [dest.toLowerCase()]
            } else {
                const buscar = async (tabla: 'proveedores' | 'contactos') => (await ctx.supabase.from(tabla).select('id, razon_social, email' + (tabla === 'contactos' ? ', email_facturacion' : '')).ilike('razon_social', `%${dest}%`).limit(5)).data || []
                const orden: ('proveedores' | 'contactos')[] = tipoDest === 'cliente' ? ['contactos', 'proveedores'] : ['proveedores', 'contactos']
                let encontrados: any[] = [], tabla: string = ''
                for (const t of orden) { encontrados = await buscar(t); if (encontrados.length) { tabla = t; break } }
                if (!encontrados.length) return { error: `No encuentro ningún proveedor ni cliente llamado "${dest}". Pide el email.` }
                if (encontrados.length > 1 && !encontrados.some((x: any) => x.razon_social.toLowerCase() === dest.toLowerCase())) return { varias_coincidencias: encontrados.map((x: any) => x.razon_social), instruccion: 'Pregunta a cuál.' }
                const elegido = encontrados.find((x: any) => x.razon_social.toLowerCase() === dest.toLowerCase()) || encontrados[0]
                nombre = elegido.razon_social
                tipoDest = tabla === 'proveedores' ? 'proveedor' : 'cliente'
                const email = elegido.email_facturacion || elegido.email
                if (!email) return { error: `${elegido.razon_social} no tiene email guardado. Pide la dirección de correo.` }
                destinatarios = String(email).split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
            }
            // Barrera de servidor: aunque el modelo proponga adjuntos, solo se
            // mantienen si el usuario ha pedido adjuntar algo en sus últimos mensajes.
            const pidioAdjunto = ultimosUsuario.some(t => /adjunt|pdf|con (la|el) (factura|presupuesto|albar)|m[aá]nda(le|les)? (la|el) (factura|presupuesto|albar)/i.test(t))
            const adjuntos: any[] = []
            let avisoAdjuntos: string | undefined
            if ((args.adjuntar || []).length) {
                if (!pidioAdjunto) {
                    avisoAdjuntos = 'Se han QUITADO los adjuntos: el usuario no ha pedido adjuntar nada.'
                } else {
                    for (const a of args.adjuntar) {
                        const docs = await buscarDocumentoPorNumero(ctx, a.tipo_documento, a.numero)
                        if (docs.length !== 1) return { error: docs.length ? `Hay varios documentos que coinciden con "${a.numero}". Pregunta cuál.` : `No encuentro ${a.tipo_documento} "${a.numero}".` }
                        adjuntos.push({ tipo: a.tipo_documento, documentoId: docs[0].id, numero: docs[0].numero })
                    }
                }
            }
            const payload = { destinatarios, destinatarioNombre: nombre, tipoDestinatario: tipoDest, cc: args.cc || [], asunto: args.asunto, cuerpo: args.mensaje, adjuntos }
            const accion = await crearAccion(ctx, 'email_libre', payload, describirAccion('email_libre', payload))
            estado.accion = accion
            return { preparado: true, pendiente_de_confirmacion: true, para: destinatarios, adjuntos: adjuntos.map(a => a.numero), aviso: avisoAdjuntos, instruccion: 'No se ha enviado. Di en una frase que está listo (menciona si va sin adjuntos) y pide confirmación.' }
        }
        case 'preparar_cobro': {
            if (ctx.rol === 'lectura') return { error: 'Tu rol es de solo lectura.' }
            const docs = await buscarDocumentoPorNumero(ctx, 'factura', args.numero_factura)
            if (docs.length === 0) return { error: `No encuentro la factura "${args.numero_factura}".` }
            if (docs.length > 1) return { varias_coincidencias: docs.slice(0, 6).map(d => `${d.numero} · ${d.cliente_razon_social}`), instruccion: 'Pregunta cuál.' }
            const { data: f } = await ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).eq('id', docs[0].id).single()
            const fc = conInfo(f)
            if (fc.info.estado === 'pagada') return { error: `La factura ${fc.numero} ya está pagada por completo.` }
            const importe = args.importe != null ? r2(Number(args.importe)) : null
            if (importe != null && importe > fc.info.pendiente + 0.01) return { error: `El importe supera lo pendiente (${formatEuro(fc.info.pendiente)}).` }
            const payload = { facturaId: fc.id, numero: fc.numero, cliente: fc.cliente_razon_social, total: fc.info.total, cobrado: fc.info.cobrado, pendiente: fc.info.pendiente, importe, metodo: args.metodo || fc.metodo_pago || null, fecha: args.fecha || hoyISO(), nota: args.nota || null }
            const accion = await crearAccion(ctx, 'cobro', payload, describirAccion('cobro', payload))
            estado.accion = accion
            return { preparado: true, pendiente_de_confirmacion: true, factura: fc.numero, pendiente: formatEuro(fc.info.pendiente), puede_confirmar: tienePermiso(ctx.rol, 'cobros'), instruccion: 'No se ha registrado aún. Pide confirmación en una frase.' }
        }
        case 'preparar_reclamacion_pago': {
            if (!tienePermiso(ctx.rol, 'cobros')) return { error: 'Tu rol no permite reclamar pagos.' }
            const docs = await buscarDocumentoPorNumero(ctx, 'factura', args.numero_factura)
            if (docs.length !== 1) return docs.length ? { varias_coincidencias: docs.slice(0, 6).map(d => d.numero) } : { error: `No encuentro la factura "${args.numero_factura}".` }
            const b = await borradorReclamacion(ctx, docs[0].id)
            if (b.factura.info.estado === 'pagada') return { error: `La factura ${b.factura.numero} ya está pagada.` }
            const destinatarios = await emailsDeCliente(ctx, b.factura.cliente_id, b.factura.cliente_email)
            if (!destinatarios.length) return { error: 'El cliente no tiene email guardado. Pide la dirección.' }
            const payload = { tipo: 'factura', documentoId: b.factura.id, numero: b.factura.numero, cliente: b.factura.cliente_razon_social, pendiente: b.factura.info.pendiente, etiqueta: b.factura.info.etiqueta, destinatarios, asunto: b.asunto, cuerpo: args.mensaje || b.cuerpo }
            const accion = await crearAccion(ctx, 'reclamacion', payload, describirAccion('reclamacion', payload))
            estado.accion = accion
            return { preparado: true, pendiente_de_confirmacion: true, factura: b.factura.numero, para: destinatarios }
        }
        case 'preparar_gasto': {
            if (!tienePermiso(ctx.rol, 'gastos')) return { error: 'Tu rol no permite registrar gastos.' }
            const payload = {
                proveedor: args.proveedor || null, fecha: args.fecha || hoyISO(), concepto: args.concepto || null,
                base_imponible: args.base_imponible ?? null, iva_porcentaje: args.iva_porcentaje ?? null, iva_importe: args.iva_importe ?? null,
                total: Number(args.total), categoria: args.categoria || null,
            }
            if (!(payload.total > 0)) return { error: 'Falta el importe total del gasto. Pregúntalo.' }
            const accion = await crearAccion(ctx, 'gasto', payload, describirAccion('gasto', payload))
            estado.accion = accion
            const falta = payload.iva_porcentaje == null && payload.iva_importe == null ? 'iva' : !payload.categoria ? 'categoria' : null
            return { preparado: true, pendiente_de_confirmacion: true, falta, instruccion: falta === 'iva' ? 'Pregunta qué IVA aplicar (21%, 10%, 4% u otro).' : falta === 'categoria' ? 'Puedes preguntar la categoría o dejar que confirme sin ella.' : 'Pide confirmación.' }
        }
        case 'previsualizar_presupuesto': {
            if (!tienePermiso(ctx.rol, 'presupuestos')) return { error: 'Tu rol no permite crear presupuestos.' }
            const { data: candidatos } = await ctx.supabase.from('contactos').select('id, razon_social, cif').ilike('razon_social', `%${args.client_name}%`).limit(5)
            if (!candidatos?.length) return { existe_cliente: false, error: `No existe ningún cliente que coincida con "${args.client_name}". Debe darse de alta primero.` }
            if (candidatos.length > 1 && !candidatos.some((c: any) => c.razon_social.toLowerCase() === String(args.client_name).toLowerCase())) {
                return { varias_coincidencias: candidatos.map((c: any) => c.razon_social), instruccion: 'Pregunta cuál.' }
            }
            const contacto = candidatos.find((c: any) => c.razon_social.toLowerCase() === String(args.client_name).toLowerCase()) || candidatos[0]
            const lineas = (args.lineas || []).map((l: any) => ({ descripcion: l.descripcion, cantidad: Number(l.cantidad) || 1, precio_unitario: Number(l.precio_unitario) || 0, importe: r2((Number(l.cantidad) || 1) * (Number(l.precio_unitario) || 0)) }))
            const base = r2(lineas.reduce((a: number, l: any) => a + l.importe, 0))
            const ivaPct = args.iva_porcentaje != null ? Number(args.iva_porcentaje) : 21
            const ivaImporte = r2(base * ivaPct / 100)
            const total = r2(base + ivaImporte)
            const validez = new Date(Date.now() + (Number(args.dias_validez) || 30) * 86400000).toISOString().slice(0, 10)
            const payload = { clienteId: contacto.id, cliente: contacto.razon_social, lineas, base, ivaPct, ivaImporte, total, observaciones: args.observaciones || null, fecha_validez: validez }
            const accion = await crearAccion(ctx, 'presupuesto', payload, describirAccion('presupuesto', payload))
            estado.accion = accion
            return { preparado: true, pendiente_de_confirmacion: true, cliente: contacto.razon_social, total: formatEuro(total), instruccion: 'No se ha guardado. Pide confirmación en una frase.' }
        }
        case 'crear_evento_agenda': {
            if (!tienePermiso(ctx.rol, 'agenda')) return { error: 'Tu rol no permite gestionar la agenda.' }
            let clienteId: string | null = null
            if (args.client_name) {
                const { data: c } = await ctx.supabase.from('contactos').select('id').ilike('razon_social', `%${args.client_name}%`).limit(1).maybeSingle()
                clienteId = c?.id || null
            }
            const todoElDia = !String(args.inicio).includes('T')
            const inicio = todoElDia ? new Date(`${args.inicio}T00:00:00${offsetMadrid(args.inicio)}`) : new Date(`${String(args.inicio).slice(0, 16)}:00${offsetMadrid(args.inicio)}`)
            if (isNaN(inicio.getTime())) return { error: 'Fecha no válida. Pregunta la fecha y hora.' }
            const fin = new Date(inicio.getTime() + (Number(args.duracion_minutos) || 60) * 60000)
            const { data: ev, error } = await ctx.supabase.from('eventos').insert({
                empresa_id: ctx.empresaId, titulo: args.titulo, tipo: args.tipo || 'cita', inicio: inicio.toISOString(), fin: todoElDia ? null : fin.toISOString(),
                todo_el_dia: todoElDia, cliente_id: clienteId, notas: args.notas || null, usuario_id: ctx.userId, creado_por: ctx.userId, origen: ctx.origen === 'telegram' ? 'telegram' : 'ia',
            }).select('id, titulo, inicio').single()
            if (error) return { error: error.message }
            await auditar(ctx, 'evento_creado', { tipo: 'evento', id: ev.id, ref: ev.titulo }, { inicio: ev.inicio })
            return { creado: true, titulo: ev.titulo, inicio: ev.inicio }
        }
        case 'confirmar_accion_pendiente': {
            if (!esConfirmacion(ultimoUsuario)) {
                return { error: 'BLOQUEADO: el último mensaje del usuario no es una confirmación explícita. Pídele que pulse Confirmar o que responda "sí".' }
            }
            const pendiente = await ultimaAccionPendiente(ctx)
            if (!pendiente) return { error: 'No hay ninguna acción pendiente de confirmar (puede que haya caducado). Vuelve a prepararla.' }
            if (estado.accion?.id === pendiente.id) {
                return { error: 'BLOQUEADO: esta acción se acaba de preparar en este mismo turno; el usuario aún no ha visto el resumen. Pide confirmación.' }
            }
            const r = await ejecutarAccion(ctx, pendiente.id)
            estado.ejecutada = r
            return r
        }
        case 'cancelar_accion_pendiente': {
            const pendiente = await ultimaAccionPendiente(ctx)
            if (pendiente) await cancelarAccion(ctx, pendiente.id)
            return { cancelada: !!pendiente }
        }
    }
    return undefined
}

/**
 * Ejecuta el asistente sobre una conversación. Mismo motor para el chat web
 * y para Telegram. Todo lo que tiene efectos pasa por acciones confirmables.
 */
export async function runErpAssistant(ctx: Contexto, messages: ChatMessage[]): Promise<RespuestaAsistente> {
    const ultimoUsuario = [...messages].reverse().find(m => m.role === 'user')?.content?.trim() || ''

    // Atajo determinista: "sí"/"envíalo" justo después de preparar una acción
    // la ejecuta sin depender de que el modelo llame a la herramienta.
    if (esConfirmacion(ultimoUsuario) || esCancelacion(ultimoUsuario)) {
        const pendiente = await ultimaAccionPendiente(ctx)
        const ultimoAsistente = [...messages].reverse().find(m => m.role === 'assistant')
        if (pendiente && ultimoAsistente?.accion_id === pendiente.id) {
            if (esCancelacion(ultimoUsuario)) {
                await cancelarAccion(ctx, pendiente.id)
                return { texto: 'De acuerdo, lo he cancelado. No se ha hecho nada.', ejecutada: { ok: true, mensaje: 'Cancelada' } }
            }
            const r = await ejecutarAccion(ctx, pendiente.id)
            return { texto: r.mensaje, ejecutada: r }
        }
    }

    const cupo = await comprobarCupoIA(ctx)
    if (!cupo.ok) return { texto: cupo.mensaje }

    const empresa = await ctx.supabase.from('empresas').select('nombre').eq('id', ctx.empresaId).maybeSingle()
    const system = SYSTEM_PROMPT
        .replaceAll('{{EMPRESA}}', empresa.data?.nombre || 'la empresa')
        .replaceAll('{{USUARIO}}', ctx.nombre)
        .replaceAll('{{ROL}}', ctx.rol)
        .replaceAll('{{HOY_ISO}}', hoyISO())
        .replaceAll('{{HOY_LARGO}}', new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }))

    const tools = [...lecturaTools, ...accionTools]
    const conversacion: any[] = [
        { role: 'system', content: system },
        ...messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content })),
    ]
    const estado: { accion: Accion | null; ejecutada: any } = { accion: null, ejecutada: null }
    let tokensIn = 0, tokensOut = 0

    try {
        for (let paso = 0; paso < 5; paso++) {
            const res = await openai.chat.completions.create({
                model: MODELO,
                messages: conversacion,
                tools: tools as any,
                tool_choice: 'auto',
                temperature: 0.2,
            })
            tokensIn += res.usage?.prompt_tokens || 0
            tokensOut += res.usage?.completion_tokens || 0
            const msg = res.choices[0].message

            if (!msg.tool_calls?.length) {
                // Si se ejecutó una acción, el texto es el resultado REAL del
                // servidor, no la paráfrasis del modelo.
                return {
                    texto: estado.ejecutada ? estado.ejecutada.mensaje : (msg.content || 'Hecho.'),
                    accion: estado.accion ? accionPublica(estado.accion) : null,
                    ejecutada: estado.ejecutada,
                }
            }

            conversacion.push(msg)
            for (const call of msg.tool_calls as any[]) {
                let args: any = {}
                try { args = JSON.parse(call.function.arguments || '{}') } catch { }
                let resultado: any
                try {
                    resultado = await ejecutarAccionTool(ctx, call.function.name, args, ultimoUsuario, estado, messages.filter(m => m.role === 'user').slice(-3).map(m => m.content))
                    if (resultado === undefined) resultado = await ejecutarLectura(ctx.supabase, call.function.name, args)
                    if (resultado === undefined) resultado = { error: `Herramienta desconocida: ${call.function.name}` }
                } catch (e: any) {
                    resultado = { error: e?.message || 'Error ejecutando la herramienta' }
                }
                const json = JSON.stringify(resultado)
                conversacion.push({ role: 'tool', tool_call_id: call.id, content: json.length > 60000 ? json.slice(0, 60000) + '…(recortado)' : json })
            }
        }
        return { texto: 'He tenido que detenerme: la consulta necesitaba demasiados pasos. ¿Puedes concretarla un poco más?', accion: estado.accion ? accionPublica(estado.accion) : null }
    } finally {
        registrarUsoIA(ctx, { accion: 'chat', modelo: MODELO, tokensEntrada: tokensIn, tokensSalida: tokensOut }).catch(() => { })
    }
}

export { etiquetaMetodo }

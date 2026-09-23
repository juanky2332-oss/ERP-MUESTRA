import 'server-only'
import OpenAI from 'openai'
import type { Contexto } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getContextoDeUsuario } from '@/lib/supabase/user-scoped'
import { tienePermiso } from '@/lib/permisos'
import { formatCurrency } from '@/lib/utils'
import { enviar, editar, responderCallback, escribiendo, enviarDocumento, descargarArchivoTelegram, esc, markdownATelegram, configurarComandos, type Teclado } from '@/lib/telegram/api'
import { resumenCobros, conInfo, CAMPOS_FACTURA_COBRO, borradorReclamacion, confirmarCobroPropuesto, type FacturaCobro } from '@/lib/cobros/servidor'
import { hoyISO, sumarDias, METODOS_PAGO, etiquetaMetodo, offsetMadrid, rangoDiaMadrid } from '@/lib/cobros/vencimientos'
import { buscarDocumentoPorNumero, emailsDeCliente, pdfDeDocumento, nombreArchivo } from '@/lib/documentos/servidor'
import { crearAccion, getAccion, actualizarPayload, ejecutarAccion, cancelarAccion, describirAccion, type Accion } from '@/lib/acciones/servidor'
import { runErpAssistant, esConfirmacion, esCancelacion, type ChatMessage } from '@/lib/ai/erp-assistant'
import { transcribirAudio, registrarUsoIA, comprobarCupoIA } from '@/lib/ai/uso'
import { leerDocumentoConIA } from '@/lib/ocr/leer'
import { subirArchivo } from '@/lib/archivos-servidor'
import { resolveExpenseSupplier } from '@/lib/expense-supplier'
import { CATEGORIAS_GASTO } from '@/lib/gastos/categorias'
import { auditar } from '@/lib/auditoria'
import { informeEmpresa } from '@/lib/informes/servidor'
import { variacion } from '@/lib/informes/calcular'
import { leerDocumentoFirmado, sugerirVinculos, estadoFirmas, dossierFactura, etiquetaTipo } from '@/lib/firmados/servidor'
import { moduloActivo } from '@/lib/modulos'
import type { ArchivoPedido } from '@/lib/ai/erp-assistant'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://erp-muestra.vercel.app'
const MAX_HISTORIAL = 10

interface Link {
    id: string
    chat_id: string
    user_id: string
    empresa_id: string
    conversation: ChatMessage[] | null
    estado_conversacion: any
    notificaciones: Record<string, boolean> | null
}

interface Sesion {
    ctx: Contexto
    link: Link
    chatId: string
}

// ─────────────────────────────── utilidades ───────────────────────────────

const euro = (n: number) => formatCurrency(Number(n) || 0)

function fechaCorta(iso?: string | null) {
    if (!iso) return '—'
    const [y, m, d] = iso.slice(0, 10).split('-')
    return `${d}/${m}/${y}`
}

function icono(f: FacturaCobro) {
    switch (f.info.visual) {
        case 'pagada': return '🟢'
        case 'vencida': return '🔴'
        case 'vence_hoy': return '🟠'
        case 'pronto': return '🟡'
        case 'parcial': return '🔵'
        default: return '⚪'
    }
}

async function guardarEstado(s: Sesion, estado: any) {
    s.link.estado_conversacion = estado
    await createAdminClient().from('telegram_links').update({ estado_conversacion: estado }).eq('id', s.link.id)
}

async function guardarHistorial(s: Sesion, historial: ChatMessage[]) {
    await createAdminClient().from('telegram_links').update({ conversation: historial.slice(-MAX_HISTORIAL) }).eq('id', s.link.id)
}

const botonesNav: Teclado = [[{ text: '🏠 Inicio', callback_data: 'm:inicio' }, { text: '🌐 Abrir ERP', url: APP_URL() }]]

// ─────────────────────────────── paneles ───────────────────────────────

function tecladoInicio(ctx: Contexto): Teclado {
    const filas: Teclado = []
    const eco = tienePermiso(ctx.rol, 'economico')
    filas.push([{ text: '📊 Resumen', callback_data: 'm:resumen' }, { text: '📅 Hoy', callback_data: 'm:hoy' }])
    filas.push([{ text: '👤 Buscar cliente', callback_data: 'm:cliente' }, { text: '📄 Facturas', callback_data: 'm:facturas' }])
    if (eco) filas.push([{ text: '💰 Cobros', callback_data: 'm:cobros' }, { text: '🔴 Vencidas', callback_data: 'm:vencidas' }])
    if (tienePermiso(ctx.rol, 'gastos')) filas.push([{ text: '📷 Añadir gasto', callback_data: 'm:gasto' }, { text: '📝 Presupuestos', callback_data: 'm:presupuestos' }])
    else filas.push([{ text: '📝 Presupuestos', callback_data: 'm:presupuestos' }])
    if (tienePermiso(ctx.rol, 'documentos')) filas.push([{ text: '📦 Albaranes', callback_data: 'm:albaranes' }, { text: '✍️ Subir firmado', callback_data: 'm:firmado' }])
    if (eco) filas.push([{ text: '📈 Informes', callback_data: 'm:informe' }, { text: '🔔 Avisos', callback_data: 'm:notif' }])
    else filas.push([{ text: '🔔 Avisos', callback_data: 'm:notif' }])
    filas.push([{ text: '❓ Ayuda', callback_data: 'm:ayuda' }])
    return filas
}

async function panelInicio(s: Sesion) {
    await enviar(s.chatId, `Hola, <b>${esc(s.ctx.nombre.split(" ")[0])}</b>, soy <b>El Maikel</b> 👋 ¿Qué quieres consultar o registrar?\n\n<i>También puedes escribirme o mandarme un audio en lenguaje normal, o una foto de un ticket.</i>`, tecladoInicio(s.ctx))
}

const AYUDA = `<b>Cómo usar el bot</b>

<b>Consultas</b>
/hoy — agenda y vencimientos de hoy
/resumen — cómo va el mes
/cobros · /pendientes · /vencidas
/facturas · /presupuestos
/cliente Nombre — ficha rápida
/buscar texto — busca en todo el ERP

/informe — informes: mes, trimestre, año o un mes concreto (<code>/informe marzo</code>)
/albaranes — sin facturar y sin firma · /firmados — control de firmas
/expediente F-42 — factura + albaranes + firmas en un PDF

<b>Registrar</b>
/pagada F-42 — marcar una factura como cobrada
/firmado — subir un albarán o parte firmado (o manda la foto con «firmado» en el pie)
📷 Foto de un ticket o factura de proveedor → borrador de gasto
📷 Foto de un justificante con la palabra «pagada» → cobro
🎙️ Nota de voz → la transcribo y la proceso

<b>Ejemplos en lenguaje normal</b>
«La factura 42 está pagada»
«Han pagado 300 € de la F-38 por transferencia»
«Mándale a Empresa A la factura 1 por correo»
«¿Qué facturas vencen esta semana?»
«Hazle un albarán a Empresa A de 10 ejes a 18 €»
«Factura el albarán 3» · «Pasa el presupuesto 5 a albarán»
«¿Cómo fue el trimestre comparado con el anterior?»
«¿Cuánto pesa una barra de C45 de Ø50 × 1000?» (módulo calculadora)

Todo lo que cambia datos o envía correos te pide confirmación antes.
/notificaciones — elegir avisos · /desvincular — desconectar`

async function resumenDelMes(ctx: Contexto): Promise<string> {
    const r = await resumenCobros(ctx)
    const hoy = hoyISO()
    const inicioMes = hoy.slice(0, 8) + '01'
    const [{ data: presu }, { count: gastosSinClasificar }, { data: gastosMes }, { data: eventos }] = await Promise.all([
        ctx.supabase.from('presupuestos').select('total, statuses, aceptado, rechazado').eq('aceptado', false).eq('rechazado', false),
        ctx.supabase.from('gastos').select('id', { count: 'exact', head: true }).or('categoria.is.null,revisado.eq.false'),
        ctx.supabase.from('gastos').select('total').gte('fecha', inicioMes),
        ctx.supabase.from('eventos').select('id').gte('inicio', rangoDiaMadrid(hoy).desde).lte('inicio', rangoDiaMadrid(hoy).hasta).neq('estado', 'cancelado'),
    ])
    const presPend = (presu || []).filter((p: any) => !(p.statuses || []).includes('traspasado'))
    const eco = tienePermiso(ctx.rol, 'economico')
    const mes = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })
    const lineas = [`📊 <b>Resumen de ${mes}</b>`, '']
    if (eco) {
        lineas.push(
            `Facturado: <b>${euro(r.facturadoEsteMes)}</b>`,
            `Cobrado: <b>${euro(r.cobradoEsteMes)}</b>`,
            `Pendiente de cobro: <b>${euro(r.pendienteTotal)}</b>`,
            `🔴 Vencidas: ${r.vencidas.length} (${euro(r.vencidoTotal)})`,
            `🟡 Vencen en 7 días: ${r.venceEstaSemana}`,
            `Gastos del mes: ${euro((gastosMes || []).reduce((a: number, g: any) => a + Number(g.total || 0), 0))}`,
        )
    }
    lineas.push(
        `📝 Presupuestos por decidir: ${presPend.length} (${euro(presPend.reduce((a: number, p: any) => a + Number(p.total || 0), 0))})`,
        `🧾 Gastos sin clasificar: ${gastosSinClasificar || 0}`,
        `📅 Eventos hoy: ${(eventos || []).length}`,
    )
    if (r.cobrosPropuestos && tienePermiso(ctx.rol, 'cobros')) lineas.push(`📨 Cobros propuestos por revisar: ${r.cobrosPropuestos}`)
    return lineas.join('\n')
}

async function cmdResumen(s: Sesion) {
    const teclado: Teclado = []
    if (tienePermiso(s.ctx.rol, 'economico')) teclado.push([{ text: '🔴 Vencidas', callback_data: 'm:vencidas' }, { text: '💰 Cobros', callback_data: 'm:cobros' }])
    teclado.push([{ text: '📅 Hoy', callback_data: 'm:hoy' }, { text: '📝 Presupuestos', callback_data: 'm:presupuestos' }])
    await enviar(s.chatId, await resumenDelMes(s.ctx), [...teclado, ...botonesNav])
}

async function cmdHoy(s: Sesion) {
    const hoy = hoyISO()
    const { data: eventos } = await s.ctx.supabase.from('eventos')
        .select('id, titulo, tipo, estado, inicio, todo_el_dia, direccion')
        .gte('inicio', rangoDiaMadrid(hoy).desde).lte('inicio', rangoDiaMadrid(hoy).hasta)
        .neq('estado', 'cancelado').order('inicio')
    const lineas = [`📅 <b>Hoy, ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })}</b>`, '']
    const teclado: Teclado = []

    if (eventos?.length) {
        lineas.push('<b>Agenda</b>')
        for (const e of eventos) {
            const hora = e.todo_el_dia ? 'Todo el día' : new Date(e.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
            lineas.push(`${e.estado === 'completado' ? '✅' : '•'} ${hora} — ${esc(e.titulo)}${e.direccion ? ` (${esc(e.direccion)})` : ''}`)
            if (e.estado !== 'completado') teclado.push([{ text: `✅ ${e.titulo.slice(0, 22)}`, callback_data: `evc:${e.id}` }, { text: '🕑 Reprogramar', callback_data: `evr:${e.id}` }])
        }
    } else {
        lineas.push('Sin citas ni reuniones en la agenda.')
    }

    if (tienePermiso(s.ctx.rol, 'economico')) {
        const r = await resumenCobros(s.ctx)
        const { data: cobrosPrev } = await s.ctx.supabase.from('eventos').select('titulo, importe').in('tipo', ['cobro_previsto', 'pago_previsto']).gte('inicio', rangoDiaMadrid(hoy).desde).lte('inicio', rangoDiaMadrid(hoy).hasta)
        if (r.venceHoy.length) {
            lineas.push('', '<b>Facturas que vencen hoy</b>')
            for (const f of r.venceHoy.slice(0, 8)) {
                lineas.push(`🟠 ${esc(f.numero)} · ${esc(f.cliente_razon_social)} · ${euro(f.info.pendiente)}`)
                teclado.push([{ text: `Ver ${f.numero}`, callback_data: `fac:${f.id}` }])
            }
        }
        if (r.vencidas.length) lineas.push('', `🔴 Tienes ${r.vencidas.length} factura(s) vencida(s) por ${euro(r.vencidoTotal)}.`)
        if (cobrosPrev?.length) {
            lineas.push('', '<b>Cobros/pagos previstos</b>')
            for (const c of cobrosPrev) lineas.push(`• ${esc(c.titulo)}${c.importe ? ` · ${euro(c.importe)}` : ''}`)
        }
    }
    await enviar(s.chatId, lineas.join('\n'), [...teclado.slice(0, 8), ...botonesNav])
}

async function listaFacturasCobro(s: Sesion, filtro: 'vencidas' | 'pendientes' | 'cobros') {
    if (!tienePermiso(s.ctx.rol, 'economico')) return enviar(s.chatId, 'Tu rol no tiene acceso a la información de cobros.', botonesNav)
    const r = await resumenCobros(s.ctx)
    const lista = filtro === 'vencidas' ? r.vencidas : r.pendientes.sort((a, b) => (a.info.dias ?? 9999) - (b.info.dias ?? 9999))
    const titulo = filtro === 'vencidas' ? `🔴 <b>Facturas vencidas</b> (${r.vencidas.length} · ${euro(r.vencidoTotal)})` : `💰 <b>Pendiente de cobro</b>: ${euro(r.pendienteTotal)} en ${r.pendientes.length} factura(s)`
    if (!lista.length) return enviar(s.chatId, filtro === 'vencidas' ? '✅ No tienes facturas vencidas.' : '✅ No hay nada pendiente de cobro.', botonesNav)
    const lineas = [titulo, '']
    if (filtro === 'cobros') lineas.push(`Vencido: ${euro(r.vencidoTotal)} · Vence en 7 días: ${r.venceEstaSemana} · Parciales: ${r.parciales.length}`, '')
    const teclado: Teclado = []
    for (const f of lista.slice(0, 10)) {
        lineas.push(`${icono(f)} <b>${esc(f.numero)}</b> · ${esc(f.cliente_razon_social)}\n    ${euro(f.info.pendiente)} · ${esc(f.info.etiqueta)}`)
        teclado.push([{ text: `${f.numero} · ${euro(f.info.pendiente)}`, callback_data: `fac:${f.id}` }])
    }
    if (lista.length > 10) lineas.push('', `…y ${lista.length - 10} más. Míralas todas en el ERP.`)
    await enviar(s.chatId, lineas.join('\n'), [...teclado, ...botonesNav])
}

async function cmdFacturas(s: Sesion) {
    const { data } = await s.ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).order('fecha', { ascending: false }).limit(8)
    if (!data?.length) return enviar(s.chatId, 'Todavía no hay facturas.', botonesNav)
    const lista: FacturaCobro[] = data.map((f: any) => conInfo(f))
    const eco = tienePermiso(s.ctx.rol, 'economico')
    await enviar(s.chatId, ['📄 <b>Últimas facturas</b>', '', ...lista.map(f => `${icono(f)} <b>${esc(f.numero)}</b> · ${esc(f.cliente_razon_social)}${eco ? ` · ${euro(f.info.total)} · ${esc(f.info.etiqueta)}` : ''}`)].join('\n'),
        [...lista.map(f => [{ text: `Ver ${f.numero}`, callback_data: `fac:${f.id}` }]), ...botonesNav])
}

async function cmdPresupuestos(s: Sesion) {
    const { data } = await s.ctx.supabase.from('presupuestos').select('id, numero, cliente_razon_social, total, fecha, fecha_validez, statuses, aceptado, rechazado').eq('aceptado', false).eq('rechazado', false).order('fecha', { ascending: false }).limit(20)
    const pend = (data || []).filter((p: any) => !(p.statuses || []).includes('traspasado')).slice(0, 10)
    if (!pend.length) return enviar(s.chatId, '✅ No hay presupuestos pendientes de decisión.', botonesNav)
    const hoy = hoyISO()
    await enviar(s.chatId, ['📝 <b>Presupuestos por decidir</b>', '', ...pend.map((p: any) => {
        const caduca = p.fecha_validez ? (p.fecha_validez < hoy ? ' · ⚠️ caducado' : ` · válido hasta ${fechaCorta(p.fecha_validez)}`) : ''
        return `• <b>${esc(p.numero)}</b> · ${esc(p.cliente_razon_social)} · ${euro(p.total)}${caduca}`
    })].join('\n'), [...pend.slice(0, 6).map((p: any) => [{ text: `📎 ${p.numero}`, callback_data: `pdf:p:${p.id}` }, { text: '✅ Aceptado', callback_data: `pac:${p.id}` }, { text: '📦 A albarán', callback_data: `cnv:pa:${p.id}` }]), ...botonesNav])
}

async function cmdCliente(s: Sesion, nombre: string) {
    if (!nombre) {
        await guardarEstado(s, { esperando: 'buscar_cliente', desde: new Date().toISOString() })
        return enviar(s.chatId, '👤 Escribe el nombre (o parte) del cliente:')
    }
    const { data } = await s.ctx.supabase.from('contactos').select('*').or(`razon_social.ilike.%${nombre}%,cif.ilike.%${nombre}%,telefono.ilike.%${nombre}%,email.ilike.%${nombre}%`).eq('archivado', false).limit(6)
    if (!data?.length) return enviar(s.chatId, `No encuentro ningún cliente que coincida con «${esc(nombre)}».`, botonesNav)
    if (data.length > 1) {
        return enviar(s.chatId, `He encontrado ${data.length} clientes. ¿Cuál?`, [...data.map((c: any) => [{ text: c.razon_social, callback_data: `cli:${c.id}` }]), ...botonesNav])
    }
    return fichaCliente(s, data[0].id)
}

async function fichaCliente(s: Sesion, id: string) {
    const { data: c } = await s.ctx.supabase.from('contactos').select('*').eq('id', id).maybeSingle()
    if (!c) return enviar(s.chatId, 'Cliente no encontrado.', botonesNav)
    const { data: facturas } = await s.ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).eq('cliente_id', id).order('fecha', { ascending: false }).limit(200)
    const lista: FacturaCobro[] = (facturas || []).map((f: any) => conInfo(f))
    const facturado = lista.reduce((a, f) => a + f.info.total, 0)
    const cobrado = lista.reduce((a, f) => a + f.info.cobrado, 0)
    const pendientes = lista.filter(f => f.info.estado !== 'pagada')
    const vencidas = pendientes.filter(f => f.info.visual === 'vencida')
    const eco = tienePermiso(s.ctx.rol, 'economico')
    const lineas = [
        `👤 <b>${esc(c.razon_social)}</b>`,
        c.cif ? `CIF: ${esc(c.cif)}` : '',
        c.telefono ? `📞 ${esc(c.telefono)}` : '',
        c.email ? `✉️ ${esc(c.email)}` : '',
        c.metodo_pago ? `Pago habitual: ${esc(etiquetaMetodo(c.metodo_pago))}` : '',
    ].filter(Boolean)
    if (eco) {
        lineas.push('', `Facturado: ${euro(facturado)}`, `Cobrado: ${euro(cobrado)}`, `Pendiente: <b>${euro(facturado - cobrado)}</b>`, `Vencidas: ${vencidas.length}`)
        if (lista[0]) lineas.push(`Última factura: ${esc(lista[0].numero)} (${fechaCorta(lista[0].fecha)})`)
    }
    const teclado: Teclado = pendientes.slice(0, 5).map(f => [{ text: `${icono(f)} ${f.numero} · ${euro(f.info.pendiente)}`, callback_data: `fac:${f.id}` }])
    await enviar(s.chatId, lineas.join('\n'), [...teclado, ...botonesNav])
}

async function detalleFactura(s: Sesion, facturaId: string, editarMsg?: number) {
    const { data } = await s.ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO + ', soportes_firmados').eq('id', facturaId).maybeSingle()
    if (!data) return enviar(s.chatId, 'Factura no encontrada.', botonesNav)
    const f = conInfo(data)
    const eco = tienePermiso(s.ctx.rol, 'economico')
    const texto = [
        `🧾 <b>Factura ${esc(f.numero)}</b>`,
        `Cliente: ${esc(f.cliente_razon_social)}`,
        `Fecha: ${fechaCorta(f.fecha)} · Vence: ${fechaCorta(f.fecha_vencimiento)}`,
        '',
        `Total: ${euro(f.info.total)}`,
        eco ? `Cobrado: ${euro(f.info.cobrado)}` : '',
        eco ? `Pendiente: <b>${euro(f.info.pendiente)}</b>` : '',
        `Estado: ${icono(f)} ${esc(f.info.etiqueta)}`,
        (data as any).soportes_firmados ? `✍️ Soporte firmado: ${esc((data as any).soportes_firmados)}` : '',
        f.reminder_count ? `Reclamada ${f.reminder_count} vez/veces (última ${fechaCorta(f.last_reminder_at)})` : '',
    ].filter(Boolean).join('\n')
    const teclado: Teclado = []
    if (f.info.estado !== 'pagada' && s.ctx.rol !== 'lectura') {
        teclado.push([{ text: '✅ Marcar pagada', callback_data: `pag:${f.id}` }, { text: '✏️ Pago parcial', callback_data: `par:${f.id}` }])
        if (tienePermiso(s.ctx.rol, 'cobros') && (f.info.visual === 'vencida' || f.info.visual === 'vence_hoy' || f.info.visual === 'pronto')) {
            teclado.push([{ text: '📧 Reclamar pago', callback_data: `rec:${f.id}` }])
        }
    }
    teclado.push([{ text: '📎 Ver PDF', callback_data: `pdf:f:${f.id}` }, { text: '📁 Expediente', callback_data: `exp:${f.id}` }])
    teclado.push([{ text: '🌐 Abrir ERP', url: `${APP_URL()}/facturas?buscar=${encodeURIComponent(f.numero)}` }])
    teclado.push([{ text: '⬅️ Volver', callback_data: 'm:cobros' }, { text: '🏠 Inicio', callback_data: 'm:inicio' }])
    if (editarMsg) return editar(s.chatId, editarMsg, texto, teclado)
    return enviar(s.chatId, texto, teclado)
}

// ─────────────────────────────── informes ───────────────────────────────

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "marzo", "03/2026", "2026-03", "marzo 2025" → YYYY-MM */
function mesDeTexto(t: string): string | null {
    const x = t.toLowerCase().trim()
    const hoy = hoyISO()
    let m = x.match(/(20\d{2})[-\/](\d{1,2})/) || x.match(/(\d{1,2})[-\/](20\d{2})/)
    if (m) { const [a, b] = m[1].length === 4 ? [m[1], m[2]] : [m[2], m[1]]; return `${a}-${b.padStart(2, '0')}` }
    const i = MESES_ES.findIndex(n => x.includes(n))
    if (i < 0) return null
    const anio = x.match(/20\d{2}/)?.[0] || (i + 1 > Number(hoy.slice(5, 7)) ? String(Number(hoy.slice(0, 4)) - 1) : hoy.slice(0, 4))
    return `${anio}-${String(i + 1).padStart(2, '0')}`
}

function tecladoInformes(): Teclado {
    const hoy = hoyISO()
    const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 - i, 1)); return d.toISOString().slice(0, 7) })
    return [
        [{ text: 'Este mes', callback_data: 'inf:este_mes' }, { text: 'Mes anterior', callback_data: 'inf:mes_anterior' }],
        [{ text: 'Trimestre', callback_data: 'inf:trimestre' }, { text: 'Trim. anterior', callback_data: 'inf:trimestre_anterior' }],
        [{ text: 'Este año', callback_data: 'inf:este_ano' }, { text: 'Año anterior', callback_data: 'inf:ano_anterior' }],
        meses.slice(2, 6).map(m => ({ text: `${MESES_ES[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(2, 4)}`, callback_data: `inf:m:${m}` })),
        [{ text: '🌐 Informe completo', url: `${APP_URL()}/informes` }, { text: '🏠 Inicio', callback_data: 'm:inicio' }],
    ]
}

async function cmdInforme(s: Sesion, preset?: string, mes?: string) {
    if (!tienePermiso(s.ctx.rol, 'economico')) return enviar(s.chatId, 'Tu rol no tiene acceso a los informes económicos.', botonesNav)
    if (!preset) return enviar(s.chatId, '📈 <b>Informes</b>\n¿Qué periodo quieres ver? También puedes escribir <code>/informe marzo</code> o preguntarme en lenguaje normal («¿cuánto le facturé a X este año?»).', tecladoInformes())
    await escribiendo(s.chatId)
    const { actual: a, anterior: b } = await informeEmpresa(s.ctx, { preset, mes })
    const k = a.kpis, kb = b.kpis
    const v = (x: number, y: number, inv = false) => { const d = variacion(x, y); if (d == null || d === 0) return ''; const bueno = inv ? d < 0 : d > 0; return ` ${bueno ? '🟢' : '🔴'} ${d > 0 ? '+' : ''}${d.toLocaleString('es-ES')}%` }
    const lineas = [
        `📈 <b>${esc(a.periodo.etiqueta)}</b> <i>(vs ${esc(b.periodo.etiqueta)})</i>`, '',
        `Facturado: <b>${euro(k.facturadoBase)}</b>${v(k.facturadoBase, kb.facturadoBase)} · ${k.numFacturas} fact.`,
        `Cobrado: <b>${euro(k.cobrado)}</b>${v(k.cobrado, kb.cobrado)}`,
        `Gastos: <b>${euro(k.gastosBase)}</b>${v(k.gastosBase, kb.gastosBase, true)}`,
        `Resultado: <b>${euro(k.resultado)}</b>${k.margen != null ? ` (margen ${k.margen.toLocaleString('es-ES')}%)` : ''}`,
        `IVA a pagar aprox.: ${euro(k.ivaRepercutido - k.ivaSoportado)}`,
        '',
        `Pendiente de cobro hoy: ${euro(k.pendienteCobro)} · vencido ${euro(k.vencido)}`,
        k.diasMedioCobro != null ? `Días medios de cobro: ${k.diasMedioCobro}` : '',
        `Presupuestos: ${a.presupuestos.num} · aceptados ${a.presupuestos.conversion ?? 0}%`,
        `Albaranes sin facturar: ${a.albaranes.pendientesFacturar} (${euro(a.albaranes.importePendienteFacturar)})`,
    ].filter(Boolean)
    if (a.ventasPorCliente.length) lineas.push('', '<b>Mejores clientes</b>', ...a.ventasPorCliente.slice(0, 5).map(c => `• ${esc(c.clave)}: ${euro(c.importe)}`))
    if (a.gastosPorCategoria.length) lineas.push('', '<b>Gastos por categoría</b>', ...a.gastosPorCategoria.slice(0, 4).map(c => `• ${esc(c.clave)}: ${euro(c.importe)}`))
    const q = preset === 'mes' && mes ? `preset=mes&mes=${mes}` : `preset=${preset}`
    await enviar(s.chatId, lineas.join('\n'), [[{ text: '🌐 Ver con gráficos', url: `${APP_URL()}/informes?${q}` }], ...tecladoInformes().slice(0, 3), [{ text: '🏠 Inicio', callback_data: 'm:inicio' }]])
}

// ─────────────────────────────── albaranes y firmados ───────────────────────────────

async function cmdAlbaranes(s: Sesion) {
    const { data } = await s.ctx.supabase.from('albaranes').select('id, numero, fecha, cliente_razon_social, total, factura_id, statuses, firmado_at').order('fecha', { ascending: false }).limit(40)
    const sinFacturar = (data || []).filter((a: any) => !a.factura_id && !(a.statuses || []).includes('traspasado'))
    if (!data?.length) return enviar(s.chatId, 'Todavía no hay albaranes.', botonesNav)
    const lineas = ['📦 <b>Albaranes</b>', '', sinFacturar.length ? `<b>Sin facturar: ${sinFacturar.length}</b> (${euro(sinFacturar.reduce((x: number, a: any) => x + Number(a.total || 0), 0))})` : '✅ Todos facturados']
    for (const a of (sinFacturar.length ? sinFacturar : data).slice(0, 10)) lineas.push(`${a.firmado_at ? '✍️' : '▫️'} <b>${esc(a.numero)}</b> · ${esc(a.cliente_razon_social)} · ${euro(a.total)}${a.firmado_at ? '' : ' · sin firma'}`)
    lineas.push('', '<i>✍️ = firmado por el cliente</i>')
    await enviar(s.chatId, lineas.join('\n'), [...(sinFacturar.length ? sinFacturar : data).slice(0, 8).map((a: any) => [{ text: `${a.numero} · ${a.cliente_razon_social}`.slice(0, 40), callback_data: `alb:${a.id}` }]), ...botonesNav])
}

async function detalleAlbaran(s: Sesion, id: string) {
    const { data: a } = await s.ctx.supabase.from('albaranes').select('*').eq('id', id).maybeSingle()
    if (!a) return enviar(s.chatId, 'Albarán no encontrado.', botonesNav)
    const { data: fac } = a.factura_id ? await s.ctx.supabase.from('facturas').select('id, numero').eq('id', a.factura_id).maybeSingle() : { data: null }
    const texto = [
        `📦 <b>Albarán ${esc(a.numero)}</b>`, `Cliente: ${esc(a.cliente_razon_social)}`, `Fecha: ${fechaCorta(a.fecha)} · Total: ${euro(a.total)}`,
        a.firmado_at ? `✍️ Firmado${a.firmado_por ? ' por ' + esc(a.firmado_por) : ''} el ${fechaCorta(a.firmado_at)}` : '▫️ Sin firma del cliente',
        fac ? `🧾 Facturado en ${esc(fac.numero)}` : '⏳ Pendiente de facturar',
    ].join('\n')
    const t: Teclado = [[{ text: '📎 PDF', callback_data: `pdf:a:${a.id}` }]]
    if (!fac && tienePermiso(s.ctx.rol, 'documentos')) t[0].push({ text: '🧾 Facturar', callback_data: `cnv:af:${a.id}` })
    if (!a.firmado_at && tienePermiso(s.ctx.rol, 'documentos')) t.push([{ text: '✍️ Subir su albarán firmado', callback_data: `fir:${a.id}` }])
    if (fac) t.push([{ text: `Ver ${fac.numero}`, callback_data: `fac:${fac.id}` }, { text: '📁 Expediente', callback_data: `exp:${fac.id}` }])
    return enviar(s.chatId, texto, [...t, ...botonesNav])
}

async function cmdFirmados(s: Sesion) {
    const e = await estadoFirmas(s.ctx)
    const lineas = ['✍️ <b>Albaranes y partes firmados</b>', '',
        `Pendientes de unir: <b>${e.pendientesDeUnir}</b>`,
        `Albaranes entregados sin firma (120 días): <b>${e.albaranesSinFirma.length}</b>`,
        `Facturas sin soporte firmado: <b>${e.facturasSinSoporte.length}</b>`,
        `Con incidencias anotadas: <b>${e.conIncidencias}</b>`,
        '', 'Para subir uno: manda la <b>foto o PDF</b> con «firmado» en el pie, o pulsa el botón.']
    const t: Teclado = [[{ text: '✍️ Subir firmado', callback_data: 'm:firmado' }]]
    for (const a of e.albaranesSinFirma.slice(-5).reverse()) t.push([{ text: `▫️ ${a.numero} · ${a.cliente_razon_social}`.slice(0, 40), callback_data: `alb:${a.id}` }])
    t.push([{ text: '🌐 Abrir en el ERP', url: `${APP_URL()}/albaranes-firmados` }, { text: '🏠 Inicio', callback_data: 'm:inicio' }])
    return enviar(s.chatId, lineas.join('\n'), t)
}

/** Foto/PDF de un albarán o parte firmado: se lee, se proponen destinos y se pregunta a cuál unirlo. */
async function recibirFirmado(s: Sesion, archivo: { buffer: Buffer }, tipo: string, ext: string, nombre: string, destinoFijo?: string | null) {
    if (!tienePermiso(s.ctx.rol, 'documentos')) return enviar(s.chatId, 'Tu rol no permite subir documentos firmados.')
    const cupo = await comprobarCupoIA(s.ctx)
    if (!cupo.ok) return enviar(s.chatId, cupo.mensaje)
    await enviar(s.chatId, '✍️ Leyendo el documento firmado…')
    const sub = await subirArchivo(s.ctx, 'albaranes-firmados', 'firmados', archivo.buffer, tipo, ext)
    let datos: any = {}
    try { datos = await leerDocumentoFirmado(s.ctx, archivo.buffer, tipo) } catch (e: any) { datos = {} }
    registrarUsoIA(s.ctx, { accion: 'ocr_firmado', modelo: 'gpt-4o', tokensEntrada: 1500, tokensSalida: 300 }).catch(() => { })
    let candidatos = await sugerirVinculos(s.ctx, datos, 4)
    if (destinoFijo) {
        const { data: a } = await s.ctx.supabase.from('albaranes').select('id, numero, cliente_razon_social, fecha, total, factura_id').eq('id', destinoFijo).maybeSingle()
        if (a) {
            const { data: f } = a.factura_id ? await s.ctx.supabase.from('facturas').select('numero').eq('id', a.factura_id).maybeSingle() : { data: null }
            candidatos = [{ tipo: 'albaran' as const, id: a.id, numero: a.numero, cliente: a.cliente_razon_social, fecha: a.fecha, total: Number(a.total || 0), factura_id: a.factura_id, factura_numero: f?.numero || null, puntos: 999, motivo: 'elegido por ti' }, ...candidatos.filter(c => c.id !== a.id)].slice(0, 4)
        }
    }
    const destino = candidatos[0] && candidatos[0].puntos >= 60 ? candidatos[0] : null
    const payload = { archivo_url: sub.url, archivo_nombre: nombre, archivo_tipo: tipo.includes('pdf') ? 'application/pdf' : tipo, datos, candidatos, destino }
    const a = await crearAccion(s.ctx, 'firmado', payload, describirAccion('firmado', payload))
    return mostrarFirmado(s, a)
}

async function mostrarFirmado(s: Sesion, a: Accion, editarMsg?: number) {
    const cands: any[] = a.payload.candidatos || []
    const t: Teclado = cands.map((c, i) => [{ text: `${a.payload.destino?.id === c.id ? '✅ ' : ''}${c.tipo === 'albaran' ? 'Alb.' : 'Fact.'} ${c.numero} · ${c.cliente}`.slice(0, 44), callback_data: `frm:${a.id}:${i}` }])
    t.push([{ text: `${!a.payload.destino ? '✅ ' : ''}No unir ahora`, callback_data: `frm:${a.id}:x` }])
    t.push([{ text: a.payload.destino ? '💾 Guardar y unir' : '💾 Guardar sin unir', callback_data: `ok:${a.id}` }, { text: '❌ Cancelar', callback_data: `no:${a.id}` }])
    const texto = esc(a.resumen) + '\n\n' + (cands.length ? '¿A qué documento lo unes? Elige y pulsa Guardar. Si no está en la lista, escribe su número (p. ej. <code>ALB-03-2026</code>).' : 'No encuentro a qué albarán o factura pertenece. Escribe su número o guárdalo sin unir.')
    await guardarEstado(s, { esperando: 'destino_firmado', accionId: a.id, desde: new Date().toISOString() })
    if (editarMsg) return editar(s.chatId, editarMsg, texto, t)
    return enviar(s.chatId, texto, t)
}

/** Envía por Telegram los PDFs que haya pedido el asistente. */
async function enviarArchivosPedidos(s: Sesion, archivos: ArchivoPedido[] | undefined) {
    for (const f of archivos || []) {
        await escribiendo(s.chatId, 'upload_document')
        try {
            if (f.tipo === 'expediente') {
                const { pdf, nombre } = await dossierFactura(s.ctx, f.id)
                await enviarDocumento(s.chatId, pdf, nombre, `📁 Expediente de la factura <b>${esc(f.numero)}</b> (factura + albaranes + firmados)`)
            } else {
                const { data: doc } = await s.ctx.supabase.from(f.tipo === 'factura' ? 'facturas' : f.tipo === 'albaran' ? 'albaranes' : 'presupuestos').select('*').eq('id', f.id).maybeSingle()
                if (doc) await enviarDocumento(s.chatId, await pdfDeDocumento(doc, f.tipo, s.ctx), nombreArchivo(doc, f.tipo), `${esc(f.numero)} · ${esc(doc.cliente_razon_social || '')}`)
            }
        } catch (e: any) {
            await enviar(s.chatId, `No he podido generar el PDF de ${esc(f.numero)}: ${esc(e?.message || '')}`)
        }
    }
}

async function prepararConversion(s: Sesion, modo: string, id: string) {
    const [origenTipo, destino] = modo === 'af' ? ['albaran', 'factura'] : modo === 'pf' ? ['presupuesto', 'factura'] : ['presupuesto', 'albaran']
    if (!tienePermiso(s.ctx.rol, 'documentos')) return enviar(s.chatId, 'Tu rol no permite crear albaranes ni facturas.')
    const { data: o } = await s.ctx.supabase.from(origenTipo === 'albaran' ? 'albaranes' : 'presupuestos').select('*').eq('id', id).maybeSingle()
    if (!o) return enviar(s.chatId, 'Documento no encontrado.')
    if (origenTipo === 'albaran' && o.factura_id) return enviar(s.chatId, 'Ese albarán ya está facturado.', botonesNav)
    if (origenTipo === 'presupuesto' && destino === 'albaran') { const { data: ya } = await s.ctx.supabase.from('albaranes').select('numero').eq('presupuesto_id', o.id).limit(1).maybeSingle(); if (ya) return enviar(s.chatId, `Ese presupuesto ya es el albarán ${esc(ya.numero)}.`, botonesNav) }
    const payload = { origenTipo, origenId: o.id, origenNumero: o.numero, destino, cliente: o.cliente_razon_social, total: Number(o.total) || 0, firmado: origenTipo === 'albaran' && !!o.firmado_at }
    const a = await crearAccion(s.ctx, 'convertir', payload, describirAccion('convertir', payload))
    return mostrarAccion(s, a)
}

async function prepararEstadoPresupuesto(s: Sesion, id: string, aceptado: boolean) {
    if (!tienePermiso(s.ctx.rol, 'presupuestos')) return enviar(s.chatId, 'Tu rol no permite gestionar presupuestos.')
    const { data: p } = await s.ctx.supabase.from('presupuestos').select('id, numero, cliente_razon_social').eq('id', id).maybeSingle()
    if (!p) return enviar(s.chatId, 'Presupuesto no encontrado.')
    const payload = { presupuestoId: p.id, numero: p.numero, cliente: p.cliente_razon_social, aceptado }
    const a = await crearAccion(s.ctx, 'estado_presupuesto', payload, describirAccion('estado_presupuesto', payload))
    return mostrarAccion(s, a)
}

// ─────────────────────────────── acciones con confirmación ───────────────────────────────

function tecladoAccion(a: Accion): Teclado {
    const ok = { text: a.tipo === 'cobro' ? '✅ Marcar pagada' : a.tipo === 'gasto' ? '✅ Guardar gasto' : a.tipo.includes('email') || a.tipo === 'reclamacion' ? '✅ Enviar' : '✅ Confirmar', callback_data: `ok:${a.id}` }
    const cancelar = { text: '❌ Cancelar', callback_data: `no:${a.id}` }
    if (a.tipo === 'cobro') {
        const esParcial = a.payload.importe != null && Math.abs(Number(a.payload.importe) - Number(a.payload.pendiente)) >= 0.01
        return [
            [{ ...ok, text: esParcial ? `✅ Registrar ${euro(a.payload.importe)}` : '✅ Marcar pagada' }],
            [{ text: '✏️ Pago parcial', callback_data: `par:${a.payload.facturaId}` }, { text: '💳 Elegir método', callback_data: `mts:${a.id}` }],
            [{ text: '📷 Adjuntar justificante', callback_data: `jus:${a.id}` }, cancelar],
        ]
    }
    if (a.tipo === 'gasto') {
        const filas: Teclado = [[ok]]
        if (a.payload.iva_porcentaje == null && a.payload.iva_importe == null) {
            filas.unshift([{ text: 'IVA 21%', callback_data: `iva:${a.id}:21` }, { text: 'IVA 10%', callback_data: `iva:${a.id}:10` }, { text: 'IVA 4%', callback_data: `iva:${a.id}:4` }, { text: 'Sin IVA', callback_data: `iva:${a.id}:0` }])
        }
        filas.push([{ text: '🏷️ Categoría', callback_data: `cts:${a.id}` }, cancelar])
        return filas
    }
    return [[ok, cancelar]]
}

async function mostrarAccion(s: Sesion, a: Accion, intro?: string, editarMsg?: number) {
    let texto = (intro ? intro + '\n\n' : '') + esc(a.resumen)
    if (a.tipo === 'cobro' && !tienePermiso(s.ctx.rol, 'cobros')) texto += '\n\n<i>Tu rol no confirma cobros: se enviará como propuesta a administración.</i>'
    if (a.tipo === 'gasto' && a.payload.iva_porcentaje == null && a.payload.iva_importe == null) texto += '\n\n❓ No he detectado el IVA. ¿Cuál aplico?'
    else if (a.tipo === 'gasto' && !a.payload.categoria) texto += '\n\n🏷️ Puedes asignar una categoría o guardarlo sin clasificar.'
    if (editarMsg) return editar(s.chatId, editarMsg, texto, tecladoAccion(a))
    return enviar(s.chatId, texto, tecladoAccion(a))
}

async function prepararCobro(s: Sesion, facturaId: string, importe: number | null, extra: Record<string, any> = {}) {
    if (s.ctx.rol === 'lectura') return enviar(s.chatId, 'Tu rol es de solo lectura.')
    const { data } = await s.ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).eq('id', facturaId).maybeSingle()
    if (!data) return enviar(s.chatId, 'Factura no encontrada.')
    const f = conInfo(data)
    if (f.info.estado === 'pagada') return enviar(s.chatId, `✅ La factura ${esc(f.numero)} ya está pagada por completo.`, botonesNav)
    if (importe != null && importe > f.info.pendiente + 0.01) return enviar(s.chatId, `⚠️ ${euro(importe)} supera lo pendiente (${euro(f.info.pendiente)}). Escribe otro importe.`)
    const payload = { facturaId: f.id, numero: f.numero, cliente: f.cliente_razon_social, total: f.info.total, cobrado: f.info.cobrado, pendiente: f.info.pendiente, importe, metodo: f.metodo_pago || null, fecha: hoyISO(), ...extra }
    const a = await crearAccion(s.ctx, 'cobro', payload, describirAccion('cobro', payload))
    await mostrarAccion(s, a)
}

async function cmdPagada(s: Sesion, numero: string) {
    if (!numero) {
        await guardarEstado(s, { esperando: 'numero_pagada', desde: new Date().toISOString() })
        return enviar(s.chatId, '¿Qué factura se ha pagado? Escribe el número (por ejemplo <code>F-42</code> o <code>42</code>).')
    }
    const docs = await buscarDocumentoPorNumero(s.ctx, 'factura', numero)
    if (!docs.length) return enviar(s.chatId, `No encuentro la factura «${esc(numero)}».`, botonesNav)
    if (docs.length > 1) return enviar(s.chatId, 'Hay varias facturas que coinciden. ¿Cuál?', docs.slice(0, 6).map((d: any) => [{ text: `${d.numero} · ${d.cliente_razon_social}`, callback_data: `pag:${d.id}` }]))
    return prepararCobro(s, docs[0].id, null)
}

async function prepararReclamacion(s: Sesion, facturaId: string) {
    if (!tienePermiso(s.ctx.rol, 'cobros')) return enviar(s.chatId, 'Tu rol no permite reclamar pagos.')
    const b = await borradorReclamacion(s.ctx, facturaId)
    const destinatarios = await emailsDeCliente(s.ctx, b.factura.cliente_id, b.factura.cliente_email)
    if (!destinatarios.length) return enviar(s.chatId, `⚠️ ${esc(b.factura.cliente_razon_social)} no tiene email guardado. Añádelo en su ficha del ERP.`, botonesNav)
    const payload = { tipo: 'factura', documentoId: b.factura.id, numero: b.factura.numero, cliente: b.factura.cliente_razon_social, pendiente: b.factura.info.pendiente, etiqueta: b.factura.info.etiqueta, destinatarios, asunto: b.asunto, cuerpo: b.cuerpo }
    const a = await crearAccion(s.ctx, 'reclamacion', payload, describirAccion('reclamacion', payload))
    await mostrarAccion(s, a, '📧 <b>Borrador de reclamación</b> (se adjunta la factura en PDF). Si quieres otro texto, dímelo con tus palabras.')
}

// ─────────────────────────────── fotos, documentos y audio ───────────────────────────────

const PALABRAS_PAGO = /pagad|cobrad|justificante|transferencia|bizum|comprobante|ingreso|pag[oó]/i
const PALABRAS_FIRMADO = /firmad|firma\b|parte|albar[aá]n|entregad|recib[ií]|conforme|recepci[oó]n/i

async function extraerDatosJustificante(s: Sesion, buffer: Buffer, tipo: string): Promise<{ numero_factura?: string; importe?: number; fecha?: string; metodo?: string }> {
    if (!process.env.OPENAI_API_KEY || tipo.includes('pdf')) return {}
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: 'Lees justificantes de pago (transferencias, Bizum, recibos). Devuelve JSON {"numero_factura": string|null, "importe": number|null, "fecha": "YYYY-MM-DD"|null, "metodo": "transferencia"|"bizum"|"tarjeta"|"efectivo"|"cheque"|null}. Si un dato no se ve claramente, null. No inventes.' },
                { role: 'user', content: [{ type: 'text', text: 'Extrae los datos del justificante.' }, { type: 'image_url', image_url: { url: `data:${tipo || 'image/jpeg'};base64,${buffer.toString('base64')}` } }] as any },
            ],
            max_tokens: 200,
        })
        registrarUsoIA(s.ctx, { accion: 'ocr_justificante', modelo: 'gpt-4o-mini', tokensEntrada: res.usage?.prompt_tokens, tokensSalida: res.usage?.completion_tokens }).catch(() => { })
        return JSON.parse(res.choices[0].message.content || '{}')
    } catch {
        return {}
    }
}

async function recibirArchivo(s: Sesion, message: any) {
    let fileId: string | undefined, tipo = 'image/jpeg', ext = 'jpg'
    if (message.photo?.length) {
        fileId = message.photo[message.photo.length - 1].file_id
    } else if (message.document) {
        tipo = message.document.mime_type || ''
        if (!/pdf|image\//.test(tipo)) return enviar(s.chatId, 'Solo puedo procesar fotos, imágenes o PDF.')
        fileId = message.document.file_id
        ext = tipo.includes('pdf') ? 'pdf' : (tipo.split('/')[1] || 'jpg')
    }
    if (!fileId) return
    await escribiendo(s.chatId)
    const archivo = await descargarArchivoTelegram(fileId)
    if (!archivo) return enviar(s.chatId, 'No he podido descargar el archivo (máximo 20 MB).')

    const caption: string = message.caption || ''
    const estado = s.link.estado_conversacion || {}

    // 1) Justificante que se estaba esperando para un cobro preparado.
    if (estado.esperando === 'justificante' && estado.accionId) {
        const sub = await subirArchivo(s.ctx, 'justificantes', 'cobros', archivo.buffer, tipo, ext)
        await guardarEstado(s, null)
        const a = await actualizarPayload(s.ctx, estado.accionId, { justificante: sub.url })
        if (!a) return enviar(s.chatId, 'La confirmación de cobro ha caducado. Vuelve a empezar con /pagada.')
        await auditar(s.ctx, 'justificante_adjuntado', { tipo: 'factura', id: a.payload.facturaId, ref: a.payload.numero }, { archivo: sub.url })
        return mostrarAccion(s, a, '📎 Justificante guardado de forma privada.')
    }

    // 2) Justificante de pago ("pagada" en el texto de la foto).
    if (PALABRAS_PAGO.test(caption)) {
        if (s.ctx.rol === 'lectura') return enviar(s.chatId, 'Tu rol es de solo lectura.')
        const sub = await subirArchivo(s.ctx, 'justificantes', 'cobros', archivo.buffer, tipo, ext)
        const datos = await extraerDatosJustificante(s, archivo.buffer, tipo)
        const textoNumero = caption.replace(PALABRAS_PAGO, ' ').trim() || datos.numero_factura || ''
        let docs = textoNumero ? await buscarDocumentoPorNumero(s.ctx, 'factura', textoNumero) : []
        if (!docs.length && datos.importe) {
            const r = await resumenCobros(s.ctx)
            docs = r.pendientes.filter(f => Math.abs(f.info.pendiente - Number(datos.importe)) < 0.01)
        }
        if (docs.length === 1) {
            return prepararCobro(s, docs[0].id, null, { justificante: sub.url, metodo: datos.metodo || undefined, fecha: datos.fecha || hoyISO() })
        }
        await guardarEstado(s, { esperando: 'factura_justificante', justificante: sub.url, metodo: datos.metodo || null, desde: new Date().toISOString() })
        const extra = datos.importe ? ` Veo un importe de ${euro(datos.importe)}.` : ''
        return enviar(s.chatId, `📎 Justificante guardado.${extra}\n¿De qué factura es? Escribe el número (p. ej. <code>F-42</code>).`)
    }

    // 3) Albarán o parte FIRMADO (pie «firmado/parte/albarán…» o se estaba esperando).
    if (estado.esperando === 'firmado' || PALABRAS_FIRMADO.test(caption)) {
        const fijo = estado.esperando === 'firmado' ? estado.albaranId || null : null
        await guardarEstado(s, null)
        return recibirFirmado(s, archivo, tipo, ext, message.document?.file_name || `firmado.${ext}`, fijo)
    }

    // 4) Por defecto: ticket o factura de proveedor → borrador de gasto.
    if (!tienePermiso(s.ctx.rol, 'gastos')) return enviar(s.chatId, 'Tu rol no permite registrar gastos. Si es un justificante de pago, reenvíalo escribiendo «pagada» en el pie de la foto.')
    const cupo = await comprobarCupoIA(s.ctx)
    if (!cupo.ok) return enviar(s.chatId, cupo.mensaje)
    await enviar(s.chatId, '🔎 Leyendo el documento…')
    const sub = await subirArchivo(s.ctx, 'gastos', 'gastos', archivo.buffer, tipo, ext)
    const ocr = await leerDocumentoConIA(archivo.buffer, tipo)
    registrarUsoIA(s.ctx, { accion: 'ocr_gasto', modelo: 'gpt-4o', tokensEntrada: 1500, tokensSalida: 300 }).catch(() => { })
    if (!ocr.success) return enviar(s.chatId, `No he podido leer el documento: ${esc(ocr.error || '')}\nPrueba con una foto más nítida, o escribe los datos (proveedor, importe e IVA).`)
    const d = ocr.data || {}
    const prov = resolveExpenseSupplier(d)
    const num = (v: any) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
    const payload = {
        proveedor: prov.proveedor, proveedor_cif: prov.proveedor_cif || null, fecha: d.fecha || hoyISO(),
        concepto: d.concepto || d.descripcion || null, numero: d.numero || null,
        base_imponible: num(d.base_imponible), iva_porcentaje: num(d.iva_porcentaje), iva_importe: num(d.iva_importe),
        total: num(d.total) ?? ((num(d.base_imponible) || 0) + (num(d.iva_importe) || 0)),
        categoria: null, archivo_url: sub.url, ocr_data: { ...d, _proveedor_resuelto: prov },
    }
    if (!(Number(payload.total) > 0)) {
        await guardarEstado(s, null)
        return enviar(s.chatId, 'He guardado el documento, pero no veo el importe total. Escríbeme el gasto, por ejemplo: «gasto de 45,90 € en Ferretería López, IVA 21%».')
    }
    const a = await crearAccion(s.ctx, 'gasto', payload, describirAccion('gasto', payload))
    await mostrarAccion(s, a, prov.revisar ? '⚠️ No tengo claro el proveedor: revísalo.' : '🧾 <b>Borrador de gasto</b>')
}

async function recibirAudio(s: Sesion, message: any) {
    const voz = message.voice || message.audio
    if (!voz) return
    const cupo = await comprobarCupoIA(s.ctx)
    if (!cupo.ok) return enviar(s.chatId, cupo.mensaje)
    await escribiendo(s.chatId)
    const archivo = await descargarArchivoTelegram(voz.file_id)
    if (!archivo) return enviar(s.chatId, 'No he podido descargar el audio.')
    const texto = await transcribirAudio(s.ctx, archivo.buffer, archivo.ruta.split('/').pop() || 'audio.ogg')
    if (!texto.trim()) return enviar(s.chatId, 'No he entendido el audio. ¿Puedes repetirlo?')
    await enviar(s.chatId, `🎙️ <i>${esc(texto)}</i>`)
    return procesarTexto(s, texto)
}

// ─────────────────────────────── texto ───────────────────────────────

function parsearImporte(t: string): number | null {
    const m = t.replace(/\s/g, '').match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/)
    if (!m) return null
    let v = m[1]
    if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.')
    const n = Number(v)
    return isNaN(n) ? null : Math.round(n * 100) / 100
}

function parsearFechaHora(t: string): Date | null {
    const hoy = hoyISO()
    const txt = t.toLowerCase().trim()
    let fecha: string | null = null
    if (/\bpasado mañana\b/.test(txt)) fecha = sumarDias(hoy, 2)
    else if (/\bmañana\b/.test(txt)) fecha = sumarDias(hoy, 1)
    else if (/\bhoy\b/.test(txt)) fecha = hoy
    const m = txt.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/)
    if (m) {
        const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : hoy.slice(0, 4)
        fecha = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
    if (!fecha) return null
    const h = txt.match(/(\d{1,2})[:h](\d{2})/)
    const hora = h ? `${h[1].padStart(2, '0')}:${h[2]}` : '09:00'
    const d = new Date(`${fecha}T${hora}:00${offsetMadrid(fecha)}`)
    return isNaN(d.getTime()) ? null : d
}

async function procesarEsperando(s: Sesion, texto: string): Promise<boolean> {
    const estado = s.link.estado_conversacion
    if (!estado?.esperando) return false
    if (estado.desde && Date.now() - new Date(estado.desde).getTime() > 30 * 60 * 1000) {
        await guardarEstado(s, null)
        return false
    }
    if (texto.startsWith('/')) { await guardarEstado(s, null); return false }

    switch (estado.esperando) {
        case 'importe_parcial': {
            const importe = parsearImporte(texto)
            if (importe == null || importe <= 0) { await enviar(s.chatId, 'Escribe solo el importe, por ejemplo <code>300</code> o <code>300,50</code>.'); return true }
            await guardarEstado(s, null)
            await prepararCobro(s, estado.facturaId, importe)
            return true
        }
        case 'numero_pagada':
            await guardarEstado(s, null)
            await cmdPagada(s, texto)
            return true
        case 'factura_justificante': {
            const docs = await buscarDocumentoPorNumero(s.ctx, 'factura', texto)
            if (docs.length !== 1) { await enviar(s.chatId, docs.length ? 'Hay varias. Escribe el número completo (p. ej. FAC-42-2026).' : 'No encuentro esa factura. Prueba otra vez con el número.'); return true }
            await guardarEstado(s, null)
            await prepararCobro(s, docs[0].id, null, { justificante: estado.justificante, metodo: estado.metodo || undefined })
            return true
        }
        case 'destino_firmado': {
            const a = await getAccion(s.ctx, estado.accionId)
            if (!a || a.estado !== 'pendiente') { await guardarEstado(s, null); return false }
            // ¿Es un número de albarán o factura?
            const albs = await buscarDocumentoPorNumero(s.ctx, 'albaran', texto)
            const facs = albs.length === 1 ? [] : await buscarDocumentoPorNumero(s.ctx, 'factura', texto)
            const doc = albs.length === 1 ? { tipo: 'albaran', d: albs[0] } : facs.length === 1 ? { tipo: 'factura', d: facs[0] } : null
            if (!doc) { await guardarEstado(s, null); return false } // no es un número: que lo trate la IA
            let factura_numero: string | null = null
            if (doc.tipo === 'albaran' && doc.d.factura_id) factura_numero = (await s.ctx.supabase.from('facturas').select('numero').eq('id', doc.d.factura_id).maybeSingle()).data?.numero || null
            const destino = { tipo: doc.tipo, id: doc.d.id, numero: doc.d.numero, cliente: doc.d.cliente_razon_social, fecha: doc.d.fecha, total: Number(doc.d.total || 0), factura_numero, puntos: 999, motivo: 'elegido por ti' }
            const acc = await actualizarPayload(s.ctx, a.id, { destino, candidatos: [destino, ...(a.payload.candidatos || []).filter((c: any) => c.id !== destino.id)].slice(0, 4) })
            if (acc) await mostrarFirmado(s, acc)
            return true
        }
        case 'buscar_cliente':
            await guardarEstado(s, null)
            await cmdCliente(s, texto)
            return true
        case 'reprogramar': {
            const d = parsearFechaHora(texto)
            if (!d) { await enviar(s.chatId, 'No entiendo la fecha. Escribe por ejemplo <code>25/09 10:30</code> o <code>mañana 17:00</code>.'); return true }
            await guardarEstado(s, null)
            const { data: ev } = await s.ctx.supabase.from('eventos').select('inicio, fin, titulo').eq('id', estado.eventoId).maybeSingle()
            if (!ev) { await enviar(s.chatId, 'Evento no encontrado.'); return true }
            const dur = ev.fin ? new Date(ev.fin).getTime() - new Date(ev.inicio).getTime() : 3600000
            await s.ctx.supabase.from('eventos').update({ inicio: d.toISOString(), fin: new Date(d.getTime() + dur).toISOString(), estado: 'reprogramado' }).eq('id', estado.eventoId)
            await auditar(s.ctx, 'evento_reprogramado', { tipo: 'evento', id: estado.eventoId, ref: ev.titulo }, { antes: ev.inicio, despues: d.toISOString() })
            await enviar(s.chatId, `🕑 «${esc(ev.titulo)}» reprogramado para el ${d.toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Madrid' })}.`, botonesNav)
            return true
        }
    }
    return false
}

async function procesarTexto(s: Sesion, texto: string) {
    if (await procesarEsperando(s, texto)) return

    const [cmdRaw, ...resto] = texto.trim().split(/\s+/)
    const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, '')
    const arg = resto.join(' ').trim()

    switch (cmd) {
        case '/start': case '/inicio': return panelInicio(s)
        case '/ayuda': case '/help': return enviar(s.chatId, AYUDA, botonesNav)
        case '/resumen': return cmdResumen(s)
        case '/hoy': return cmdHoy(s)
        case '/cobros': return listaFacturasCobro(s, 'cobros')
        case '/pendientes': return listaFacturasCobro(s, 'pendientes')
        case '/vencidas': return listaFacturasCobro(s, 'vencidas')
        case '/facturas': return cmdFacturas(s)
        case '/factura': return arg ? buscarYMostrarFactura(s, arg) : cmdFacturas(s)
        case '/presupuestos': case '/presupuesto': return cmdPresupuestos(s)
        case '/cliente': return cmdCliente(s, arg)
        case '/pagada': return cmdPagada(s, arg)
        case '/gasto': return enviar(s.chatId, '📷 Mándame una <b>foto del ticket</b> o el <b>PDF de la factura</b> del proveedor.\nTambién puedes escribirlo o dictarlo: «gasto de 60 € en gasolina, IVA 21%».')
        case '/buscar': return arg ? procesarConIA(s, `Busca en el ERP: ${arg}`) : enviar(s.chatId, 'Escribe qué buscar: <code>/buscar tornillos</code>')
        case '/notificaciones': return panelNotificaciones(s)
        case '/informe': case '/informes': {
            if (!arg) return cmdInforme(s)
            const mes = mesDeTexto(arg)
            if (mes) return cmdInforme(s, 'mes', mes)
            const t = arg.toLowerCase()
            const preset = /trimestre anterior|trim.*pasad/.test(t) ? 'trimestre_anterior' : /trimestre/.test(t) ? 'trimestre' : /año anterior|año pasado/.test(t) ? 'ano_anterior' : /año/.test(t) ? 'este_ano' : /mes anterior|mes pasado/.test(t) ? 'mes_anterior' : /mes/.test(t) ? 'este_mes' : null
            return preset ? cmdInforme(s, preset) : procesarConIA(s, `Informe: ${arg}`)
        }
        case '/albaranes': case '/albaran': return arg ? procesarConIA(s, `Muéstrame el albarán ${arg}`) : cmdAlbaranes(s)
        case '/firmados': return cmdFirmados(s)
        case '/firmado': {
            if (!tienePermiso(s.ctx.rol, 'documentos')) return enviar(s.chatId, 'Tu rol no permite subir documentos firmados.')
            await guardarEstado(s, { esperando: 'firmado', desde: new Date().toISOString() })
            return enviar(s.chatId, '✍️ Mándame la <b>foto o el PDF</b> del albarán o parte firmado por el cliente. Lo leo y te pregunto a qué albarán o factura lo unimos.')
        }
        case '/expediente': return arg ? procesarConIA(s, `Pásame el expediente de la factura ${arg}`) : enviar(s.chatId, 'Escribe la factura: <code>/expediente F-42</code>')
        case '/desvincular': return enviar(s.chatId, '¿Seguro que quieres desconectar este chat del ERP?', [[{ text: 'Sí, desvincular', callback_data: 'desv:si' }, { text: 'No', callback_data: 'm:inicio' }]])
    }
    if (cmd.startsWith('/')) return enviar(s.chatId, 'No conozco ese comando. Escribe /ayuda.', botonesNav)

    return procesarConIA(s, texto)
}

async function buscarYMostrarFactura(s: Sesion, numero: string) {
    const docs = await buscarDocumentoPorNumero(s.ctx, 'factura', numero)
    if (!docs.length) return enviar(s.chatId, `No encuentro la factura «${esc(numero)}».`, botonesNav)
    if (docs.length > 1) return enviar(s.chatId, '¿Cuál?', docs.slice(0, 6).map((d: any) => [{ text: `${d.numero} · ${d.cliente_razon_social}`, callback_data: `fac:${d.id}` }]))
    return detalleFactura(s, docs[0].id)
}

async function procesarConIA(s: Sesion, texto: string) {
    await escribiendo(s.chatId)
    const historial: ChatMessage[] = Array.isArray(s.link.conversation) ? s.link.conversation : []
    const mensajes: ChatMessage[] = [...historial, { role: 'user', content: texto }]
    let r
    try {
        r = await runErpAssistant(s.ctx, mensajes)
    } catch (e) {
        console.error('Error IA Telegram:', e)
        return enviar(s.chatId, 'He tenido un problema consultando el ERP. Inténtalo de nuevo o usa /inicio.')
    }
    await guardarHistorial(s, [...mensajes, { role: 'assistant', content: r.texto, accion_id: r.accion?.id }])
    if (r.accion) {
        const a = await getAccion(s.ctx, r.accion.id)
        if (a) return mostrarAccion(s, a, markdownATelegram(r.texto))
    }
    await enviar(s.chatId, markdownATelegram(r.texto))
    return enviarArchivosPedidos(s, r.archivos)
}

async function panelNotificaciones(s: Sesion, editarMsg?: number) {
    const n = { resumen_diario: true, vencidas: true, vencen_pronto: true, cobros: true, gastos_revisar: true, presupuestos_caducan: true, ...(s.link.notificaciones || {}) }
    const etiquetas: Record<string, string> = {
        resumen_diario: 'Resumen diario (8:00)', vencidas: 'Facturas vencidas', vencen_pronto: 'Vencen en 3 días',
        cobros: 'Cobros registrados', gastos_revisar: 'Gastos por revisar', presupuestos_caducan: 'Presupuestos que caducan',
    }
    const teclado: Teclado = Object.keys(etiquetas).map(k => [{ text: `${(n as any)[k] ? '🔔' : '🔕'} ${etiquetas[k]}`, callback_data: `ntf:${k}` }])
    teclado.push([{ text: '🏠 Inicio', callback_data: 'm:inicio' }])
    const texto = '🔔 <b>Avisos por Telegram</b>\nPulsa para activar o desactivar cada aviso.'
    if (editarMsg) return editar(s.chatId, editarMsg, texto, teclado)
    return enviar(s.chatId, texto, teclado)
}

// ─────────────────────────────── botones ───────────────────────────────

async function procesarCallback(s: Sesion, cb: any) {
    const data: string = cb.data || ''
    const msgId: number | undefined = cb.message?.message_id
    const [tipo, a1, a2] = data.split(':')

    if (tipo === 'm') {
        await responderCallback(cb.id)
        switch (a1) {
            case 'inicio': return panelInicio(s)
            case 'resumen': return cmdResumen(s)
            case 'hoy': return cmdHoy(s)
            case 'cobros': return listaFacturasCobro(s, 'cobros')
            case 'vencidas': return listaFacturasCobro(s, 'vencidas')
            case 'facturas': return cmdFacturas(s)
            case 'presupuestos': return cmdPresupuestos(s)
            case 'cliente': return cmdCliente(s, '')
            case 'gasto': return procesarTexto(s, '/gasto')
            case 'ayuda': return enviar(s.chatId, AYUDA, botonesNav)
            case 'notif': return panelNotificaciones(s)
            case 'informe': return cmdInforme(s)
            case 'albaranes': return cmdAlbaranes(s)
            case 'firmados': return cmdFirmados(s)
            case 'firmado': return procesarTexto(s, '/firmado')
        }
        return
    }
    if (tipo === 'inf') { await responderCallback(cb.id, 'Calculando…'); return a1 === 'm' ? cmdInforme(s, 'mes', a2) : cmdInforme(s, a1) }
    if (tipo === 'alb') { await responderCallback(cb.id); return detalleAlbaran(s, a1) }
    if (tipo === 'cnv') { await responderCallback(cb.id); return prepararConversion(s, a1, a2) }
    if (tipo === 'pac') { await responderCallback(cb.id); return prepararEstadoPresupuesto(s, a1, true) }
    if (tipo === 'fir') {
        await responderCallback(cb.id)
        await guardarEstado(s, { esperando: 'firmado', albaranId: a1, desde: new Date().toISOString() })
        return enviar(s.chatId, '✍️ Mándame la foto o el PDF del albarán firmado.')
    }
    if (tipo === 'exp') {
        await responderCallback(cb.id, 'Preparando el expediente…')
        const { data: f } = await s.ctx.supabase.from('facturas').select('id, numero').eq('id', a1).maybeSingle()
        if (!f) return enviar(s.chatId, 'Factura no encontrada.')
        return enviarArchivosPedidos(s, [{ tipo: 'expediente', id: f.id, numero: f.numero, url: '' }])
    }
    if (tipo === 'frm') {
        const acc0 = await getAccion(s.ctx, a1)
        if (!acc0 || acc0.estado !== 'pendiente') { await responderCallback(cb.id, 'Esta confirmación ha caducado.', true); return }
        const destino = a2 === 'x' ? null : (acc0.payload.candidatos || [])[Number(a2)] || null
        const acc = await actualizarPayload(s.ctx, a1, { destino })
        await responderCallback(cb.id, destino ? `${destino.numero}` : 'Sin unir')
        if (acc) return mostrarFirmado(s, acc, msgId)
        return
    }

    if (tipo === 'fac') { await responderCallback(cb.id); return detalleFactura(s, a1) }
    if (tipo === 'cli') { await responderCallback(cb.id); return fichaCliente(s, a1) }
    if (tipo === 'pag') { await responderCallback(cb.id); return prepararCobro(s, a1, null) }
    if (tipo === 'rec') { await responderCallback(cb.id); return prepararReclamacion(s, a1) }
    if (tipo === 'par') {
        await responderCallback(cb.id)
        await guardarEstado(s, { esperando: 'importe_parcial', facturaId: a1, desde: new Date().toISOString() })
        return enviar(s.chatId, '✏️ ¿Qué importe se ha cobrado? Escribe solo la cifra (por ejemplo <code>300</code>).')
    }
    if (tipo === 'pdf') {
        await responderCallback(cb.id, 'Generando PDF…')
        const tipoDoc = a1 === 'p' ? 'presupuesto' : a1 === 'a' ? 'albaran' : 'factura'
        const { data: doc } = await s.ctx.supabase.from(tipoDoc === 'factura' ? 'facturas' : tipoDoc === 'albaran' ? 'albaranes' : 'presupuestos').select('*').eq('id', a2).maybeSingle()
        if (!doc) return enviar(s.chatId, 'Documento no encontrado.')
        await escribiendo(s.chatId, 'upload_document')
        const pdf = await pdfDeDocumento(doc, tipoDoc, s.ctx)
        return enviarDocumento(s.chatId, pdf, nombreArchivo(doc, tipoDoc), `${tipoDoc === 'factura' ? 'Factura' : tipoDoc === 'albaran' ? 'Albarán' : 'Presupuesto'} <b>${esc(doc.numero)}</b> · ${esc(doc.cliente_razon_social)}`)
    }
    if (tipo === 'ok' || tipo === 'no') {
        const accion = await getAccion(s.ctx, a1)
        if (!accion) { await responderCallback(cb.id, 'Este botón ya no es válido.', true); return }
        if (tipo === 'no') {
            await cancelarAccion(s.ctx, a1)
            if (s.link.estado_conversacion?.accionId === a1) await guardarEstado(s, null)
            await responderCallback(cb.id, 'Cancelado')
            if (msgId) await editar(s.chatId, msgId, esc(accion.resumen) + '\n\n❌ <b>Cancelado.</b> No se ha hecho nada.')
            return
        }
        await responderCallback(cb.id, 'Procesando…')
        if (msgId) await editar(s.chatId, msgId, esc(accion.resumen) + '\n\n⏳ Procesando…')
        const r = await ejecutarAccion(s.ctx, a1)
        if (accion.tipo === 'firmado' && s.link.estado_conversacion?.accionId === a1) await guardarEstado(s, null)
        const creado = r.ok && r.datos?.id && r.datos?.tipo && ['documento', 'convertir'].includes(accion.tipo)
        const tras: Teclado = creado ? [[{ text: `📎 PDF ${r.datos.numero}`, callback_data: `pdf:${r.datos.tipo === 'factura' ? 'f' : r.datos.tipo === 'albaran' ? 'a' : 'p'}:${r.datos.id}` }], ...botonesNav] : botonesNav
        if (msgId) await editar(s.chatId, msgId, esc(accion.resumen) + `\n\n${esc(r.mensaje)}`, r.ok ? tras : tecladoAccion(accion))
        else await enviar(s.chatId, esc(r.mensaje), botonesNav)
        // El asistente ve el resultado en su memoria para no volver a proponerlo.
        const hist = Array.isArray(s.link.conversation) ? s.link.conversation : []
        await guardarHistorial(s, [...hist, { role: 'assistant', content: r.mensaje }])
        return
    }
    if (tipo === 'mts') {
        await responderCallback(cb.id)
        const filas: Teclado = []
        for (let i = 0; i < METODOS_PAGO.length; i += 3) filas.push(METODOS_PAGO.slice(i, i + 3).map(m => ({ text: m.label, callback_data: `mt:${a1}:${m.value}` })))
        return enviar(s.chatId, '💳 ¿Cómo se ha cobrado?', filas)
    }
    if (tipo === 'mt') {
        const acc = await actualizarPayload(s.ctx, a1, { metodo: a2 })
        if (!acc) { await responderCallback(cb.id, 'Esta confirmación ha caducado.', true); return }
        await responderCallback(cb.id, `Método: ${etiquetaMetodo(a2)}`)
        if (msgId) await editar(s.chatId, msgId, `💳 Método: <b>${esc(etiquetaMetodo(a2))}</b>`)
        return mostrarAccion(s, acc)
    }
    if (tipo === 'jus') {
        await responderCallback(cb.id)
        await guardarEstado(s, { esperando: 'justificante', accionId: a1, desde: new Date().toISOString() })
        return enviar(s.chatId, '📷 Mándame la foto o el PDF del justificante.')
    }
    if (tipo === 'iva') {
        const pct = Number(a2)
        const acc0 = await getAccion(s.ctx, a1)
        if (!acc0 || acc0.estado !== 'pendiente') { await responderCallback(cb.id, 'Esta confirmación ha caducado.', true); return }
        const total = Number(acc0.payload.total) || 0
        const base = acc0.payload.base_imponible ?? Math.round((total / (1 + pct / 100)) * 100) / 100
        const acc = await actualizarPayload(s.ctx, a1, { iva_porcentaje: pct, base_imponible: base, iva_importe: Math.round((total - base) * 100) / 100 })
        await responderCallback(cb.id, `IVA ${pct}%`)
        if (acc) return mostrarAccion(s, acc, undefined, msgId)
        return
    }
    if (tipo === 'cts') {
        await responderCallback(cb.id)
        const filas: Teclado = []
        CATEGORIAS_GASTO.forEach((c, i) => { if (i % 2 === 0) filas.push([]); filas[filas.length - 1].push({ text: c, callback_data: `cat:${a1}:${i}` }) })
        return enviar(s.chatId, '🏷️ ¿Qué categoría le pongo?', filas)
    }
    if (tipo === 'cat') {
        const cat = CATEGORIAS_GASTO[Number(a2)]
        const acc = await actualizarPayload(s.ctx, a1, { categoria: cat })
        if (!acc) { await responderCallback(cb.id, 'Esta confirmación ha caducado.', true); return }
        await responderCallback(cb.id, cat)
        if (msgId) await editar(s.chatId, msgId, `🏷️ Categoría: <b>${esc(cat)}</b>`)
        return mostrarAccion(s, acc)
    }
    if (tipo === 'cpc') {
        try {
            await confirmarCobroPropuesto(s.ctx, a1)
            await responderCallback(cb.id, 'Cobro confirmado')
            if (msgId) await editar(s.chatId, msgId, '✅ Cobro propuesto confirmado. La factura se ha actualizado.')
        } catch (e: any) {
            await responderCallback(cb.id, e?.message || 'No se pudo confirmar', true)
        }
        return
    }
    if (tipo === 'evc') {
        const { data: ev } = await s.ctx.supabase.from('eventos').update({ estado: 'completado' }).eq('id', a1).select('titulo').maybeSingle()
        await responderCallback(cb.id, ev ? 'Completado' : 'Evento no encontrado')
        if (ev) await auditar(s.ctx, 'evento_completado', { tipo: 'evento', id: a1, ref: ev.titulo })
        return cmdHoy(s)
    }
    if (tipo === 'evr') {
        await responderCallback(cb.id)
        await guardarEstado(s, { esperando: 'reprogramar', eventoId: a1, desde: new Date().toISOString() })
        return enviar(s.chatId, '🕑 ¿Para cuándo? Escribe por ejemplo <code>25/09 10:30</code> o <code>mañana 17:00</code>.')
    }
    if (tipo === 'ntf') {
        const actual = { resumen_diario: true, vencidas: true, vencen_pronto: true, cobros: true, gastos_revisar: true, presupuestos_caducan: true, ...(s.link.notificaciones || {}) } as Record<string, boolean>
        actual[a1] = !actual[a1]
        s.link.notificaciones = actual
        await createAdminClient().from('telegram_links').update({ notificaciones: actual }).eq('id', s.link.id)
        await responderCallback(cb.id, actual[a1] ? 'Activado' : 'Desactivado')
        return panelNotificaciones(s, msgId)
    }
    if (tipo === 'desv') {
        await createAdminClient().from('telegram_links').delete().eq('id', s.link.id)
        await auditar(s.ctx, 'telegram_desvinculado', { tipo: 'telegram', ref: s.chatId })
        await responderCallback(cb.id, 'Desvinculado')
        return enviar(s.chatId, '👋 Chat desvinculado. Para volver a conectarlo: ERP → Ajustes → Conectar Telegram.')
    }
    await responderCallback(cb.id, 'Este botón ha caducado.', true)
}

// ─────────────────────────────── entrada principal ───────────────────────────────

async function vincular(chatId: string, message: any, texto: string) {
    const admin = createAdminClient()
    const code = texto.split(/\s+/)[1]?.trim().toUpperCase()
    if (!code) return enviar(chatId, 'Escribe el código junto al comando, por ejemplo: <code>/vincular ABC123</code>')

    const { data: yaVinculado } = await admin.from('telegram_links').select('id').eq('chat_id', chatId).eq('linked', true).maybeSingle()
    if (yaVinculado) return enviar(chatId, 'Este chat ya está vinculado. Usa /desvincular primero si quieres cambiar de usuario.')

    const { data: link } = await admin.from('telegram_links').select('*').eq('link_code', code).eq('linked', false).maybeSingle()
    if (!link || !link.user_id || (link.code_expires_at && new Date(link.code_expires_at) < new Date())) {
        return enviar(chatId, 'Ese código no es válido o ha caducado. Genera uno nuevo desde el ERP → Ajustes → Conectar Telegram.')
    }
    const username = message.from?.username || message.from?.first_name || ''
    configurarComandos().catch(() => { })
    await admin.from('telegram_links').update({ chat_id: chatId, linked: true, linked_at: new Date().toISOString(), telegram_username: username, link_code: null, conversation: [] }).eq('id', link.id)
    try {
        const ctx = await getContextoDeUsuario(link.user_id, 'telegram', link.id)
        await auditar(ctx, 'telegram_vinculado', { tipo: 'telegram', ref: chatId }, { username })
        await enviar(chatId, `✅ Cuenta vinculada, <b>${esc(ctx.nombre)}</b>.`)
        return panelInicio({ ctx, link: { ...link, chat_id: chatId, conversation: [], estado_conversacion: null }, chatId })
    } catch {
        return enviar(chatId, '✅ Cuenta vinculada. Escribe /inicio para empezar.')
    }
}

let comandosActualizados = false

/** Procesa un update de Telegram (mensaje o pulsación de botón). */
export async function procesarUpdate(update: any) {
    const cb = update.callback_query
    const message = update.message || update.edited_message
    const chatId: string | undefined = (cb?.message?.chat?.id ?? message?.chat?.id)?.toString()
    if (!chatId) return

    // Solo chats privados: en grupos cualquiera podría ver datos de la empresa.
    const tipoChat = cb?.message?.chat?.type ?? message?.chat?.type
    if (tipoChat && tipoChat !== 'private') {
        if (message) await enviar(chatId, 'Por seguridad, este bot solo funciona en chats privados.')
        return
    }

    const texto: string = message?.text?.trim() || ''
    if (message && /^\/vincular\b/i.test(texto)) return vincular(chatId, message, texto)

    const admin = createAdminClient()
    const { data: link } = await admin.from('telegram_links')
        .select('id, chat_id, user_id, empresa_id, conversation, estado_conversacion, notificaciones')
        .eq('chat_id', chatId).eq('linked', true).maybeSingle()

    if (!link?.user_id) {
        if (cb) return responderCallback(cb.id, 'Este chat no está vinculado al ERP.', true)
        return enviar(chatId, '🔒 Este chat no está vinculado al ERP.\n\n1. Entra en el ERP → <b>Ajustes</b> → <b>Conectar Telegram</b>\n2. Pulsa «Generar código»\n3. Escríbeme aquí: <code>/vincular CODIGO</code>')
    }

    let ctx: Contexto
    try {
        ctx = await getContextoDeUsuario(link.user_id, 'telegram', link.id)
    } catch (e: any) {
        if (cb) await responderCallback(cb.id)
        return enviar(chatId, `⚠️ ${esc(e?.message || 'Tu usuario ya no tiene acceso al ERP.')}`)
    }
    const s: Sesion = { ctx, link: link as Link, chatId }
    // Mantener actualizado el menú «/» del bot (una vez por arranque del servidor)
    if (!comandosActualizados) { comandosActualizados = true; configurarComandos().catch(() => { comandosActualizados = false }) }

    try {
        if (cb) return await procesarCallback(s, cb)
        if (!message) return
        if (message.photo || message.document) return await recibirArchivo(s, message)
        if (message.voice || message.audio) return await recibirAudio(s, message)
        if (texto) return await procesarTexto(s, texto)
    } catch (e: any) {
        console.error('Error procesando update de Telegram:', e)
        await enviar(chatId, `⚠️ Ha ocurrido un error: ${esc(e?.message || 'inténtalo de nuevo')}`)
    }
}

export { resumenDelMes, esConfirmacion, esCancelacion }

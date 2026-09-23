import 'server-only'
import OpenAI from 'openai'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Contexto } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { descargarArchivo } from '@/lib/archivos-servidor'
import { pdfDeDocumento } from '@/lib/documentos/servidor'

/**
 * Albaranes y partes firmados.
 *
 * Cualquier papel que firma el cliente (albarán de entrega, parte de trabajo,
 * recepción de material) se sube en foto/PDF, la IA lo lee y se UNE a su
 * albarán y/o factura. Así cada factura tiene su soporte firmado y se puede
 * sacar el expediente completo en un único PDF (factura + albaranes + firmas).
 * Lo usan la web, el asistente El Maikel y Telegram.
 */

export type TipoFirmado = 'albaran' | 'parte_trabajo' | 'recepcion_material' | 'otro'

export const TIPOS_FIRMADO: { value: TipoFirmado; label: string; corto: string }[] = [
    { value: 'albaran', label: 'Albarán de entrega firmado', corto: 'Albarán' },
    { value: 'parte_trabajo', label: 'Parte de trabajo / servicio firmado', corto: 'Parte de trabajo' },
    { value: 'recepcion_material', label: 'Recepción de material firmada', corto: 'Recepción' },
    { value: 'otro', label: 'Otro documento firmado', corto: 'Otro' },
]
export const etiquetaTipo = (t?: string | null) => TIPOS_FIRMADO.find(x => x.value === t)?.corto || 'Documento'

export interface DatosFirmado {
    tipo: TipoFirmado
    numero_documento: string | null
    fecha_documento: string | null
    cliente: string | null
    cliente_cif: string | null
    firmado: boolean | null
    firmante_nombre: string | null
    firmante_dni: string | null
    descripcion: string | null
    horas: number | null
    incidencias: string | null
    pedido_referencia: string | null
    raw_text?: string
}

export interface Candidato {
    tipo: 'albaran' | 'factura'
    id: string
    numero: string
    cliente: string
    fecha: string
    total: number
    factura_id?: string | null
    factura_numero?: string | null
    ya_firmado?: boolean
    puntos: number
    motivo: string
}

const PROMPT = (empresa: string) => `Eres el administrativo de ${empresa}. Te pasan la foto o el PDF de un documento que ha FIRMADO un cliente:
un albarán de entrega, un parte de trabajo/servicio (horas, técnico, trabajo realizado) o una recepción de material.
${empresa} es quien entrega o hace el trabajo; el CLIENTE es la otra empresa/persona (quien firma y recibe). Nunca pongas a ${empresa} como cliente.

Devuelve SOLO JSON con estas claves:
- tipo: "albaran" | "parte_trabajo" | "recepcion_material" | "otro"
- numero_documento: número del albarán/parte tal y como aparece (ej. "ALB-03-2026", "Parte 145"). null si no hay.
- fecha_documento: YYYY-MM-DD (fecha del documento o de la firma). null si no hay.
- cliente: razón social o nombre del cliente. null si no se ve.
- cliente_cif: NIF/CIF del cliente o null.
- pedido_referencia: nº de pedido / referencia del cliente o null.
- firmado: true si se ve una firma manuscrita, sello o "recibí" firmado; false si el hueco de firma está vacío; null si no se puede saber.
- firmante_nombre: nombre de quien firma (escrito junto a la firma, "Recibido por", "Conforme") o null.
- firmante_dni: DNI de quien firma si aparece, o null.
- descripcion: resumen corto del material entregado o del trabajo realizado (máx. 200 caracteres).
- horas: total de horas si es un parte de trabajo, o null.
- incidencias: cualquier anotación a mano del cliente: faltas, roturas, "pendiente", "conforme con reservas", tachones en cantidades... null si no hay.
- raw_text: transcripción del texto visible.
NO inventes nada: si un dato no se ve, null.`

const limpiarTexto = (v: any) => (typeof v === 'string' && v.trim() && !/^(null|n\/a|s\/n|-)$/i.test(v.trim()) ? v.trim() : null)

/** Lee el documento firmado con IA (foto o PDF). */
export async function leerDocumentoFirmado(ctx: Pick<Contexto, 'supabase' | 'empresaId'>, buffer: Buffer, contentType: string): Promise<DatosFirmado> {
    if (!process.env.OPENAI_API_KEY) throw new Error('Falta configurar la IA (OPENAI_API_KEY).')
    const { data: emp } = await ctx.supabase.from('empresas').select('nombre, nombre_comercial').eq('id', ctx.empresaId).maybeSingle()
    const empresa = emp?.nombre_comercial || emp?.nombre || 'nuestra empresa'
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const esPdf = contentType.includes('pdf') || buffer.subarray(0, 5).toString('latin1') === '%PDF-'
    const contenido: any[] = esPdf
        ? [{ type: 'file', file: { filename: 'documento.pdf', file_data: `data:application/pdf;base64,${buffer.toString('base64')}` } }]
        : [{ type: 'image_url', image_url: { url: `data:${contentType || 'image/jpeg'};base64,${buffer.toString('base64')}` } }]
    const r = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL_OCR || 'gpt-4o',
        messages: [
            { role: 'system', content: PROMPT(empresa) },
            { role: 'user', content: [...contenido, { type: 'text', text: 'Lee este documento firmado.' }] as any },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1500,
    })
    const d = JSON.parse(r.choices[0].message.content || '{}')
    const tipo: TipoFirmado = ['albaran', 'parte_trabajo', 'recepcion_material', 'otro'].includes(d.tipo) ? d.tipo : 'albaran'
    const fecha = limpiarTexto(d.fecha_documento)
    return {
        tipo,
        numero_documento: limpiarTexto(d.numero_documento),
        fecha_documento: fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
        cliente: limpiarTexto(d.cliente),
        cliente_cif: limpiarTexto(d.cliente_cif),
        firmado: typeof d.firmado === 'boolean' ? d.firmado : null,
        firmante_nombre: limpiarTexto(d.firmante_nombre),
        firmante_dni: limpiarTexto(d.firmante_dni),
        descripcion: limpiarTexto(d.descripcion)?.slice(0, 300) || null,
        horas: Number.isFinite(Number(d.horas)) && Number(d.horas) > 0 ? Number(d.horas) : null,
        incidencias: limpiarTexto(d.incidencias),
        pedido_referencia: limpiarTexto(d.pedido_referencia),
        raw_text: typeof d.raw_text === 'string' ? d.raw_text.slice(0, 4000) : undefined,
    }
}

const norm = (s?: string | null) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const SOCIETARIO = new Set(['SL', 'SA', 'SLU', 'SLL', 'SC', 'CB', 'S', 'L', 'U', 'DE', 'LA', 'EL', 'Y', 'LOS', 'LAS'])
function parecidoNombre(a?: string | null, b?: string | null) {
    const ta = norm(a).split(' ').filter(t => t.length > 1 && !SOCIETARIO.has(t))
    const tb = new Set(norm(b).split(' ').filter(t => t.length > 1 && !SOCIETARIO.has(t)))
    if (!ta.length || !tb.size) return 0
    return ta.filter(t => tb.has(t)).length / Math.max(ta.length, tb.size)
}
const digitos = (s?: string | null) => (s || '').replace(/\D/g, '')
function coincideNumero(leido?: string | null, nuestro?: string | null) {
    if (!leido || !nuestro) return 0
    const a = norm(leido).replace(/ /g, ''), b = norm(nuestro).replace(/ /g, '')
    if (a === b) return 1
    if (a.length >= 4 && (a.includes(b) || b.includes(a))) return 0.9
    // "ALB 3/2026" ↔ ALB-03-2026: misma secuencia y año
    const [sa, anioA] = [leido.match(/(\d+)\D+(20\d{2})/)?.[1], leido.match(/20\d{2}/)?.[0]]
    const m = nuestro.match(/-(\d+)-(20\d{2})/)
    if (m && sa && anioA && Number(sa) === Number(m[1]) && anioA === m[2]) return 0.95
    if (m && digitos(leido) && Number(digitos(leido)) === Number(m[1])) return 0.4
    return 0
}
const dias = (a?: string | null, b?: string | null) => (a && b ? Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000 : Infinity)

/** Propone a qué albarán o factura pertenece el documento leído, ordenado por probabilidad. */
export async function sugerirVinculos(ctx: Pick<Contexto, 'supabase'>, d: Partial<DatosFirmado>, limite = 6): Promise<Candidato[]> {
    const desde = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)
    const [{ data: albs }, { data: facs }, { data: firmas }] = await Promise.all([
        ctx.supabase.from('albaranes').select('id, numero, fecha, cliente_razon_social, cliente_cif, total, factura_id, firmado_at, pedido_referencia').gte('fecha', desde).order('fecha', { ascending: false }).limit(800),
        ctx.supabase.from('facturas').select('id, numero, fecha, cliente_razon_social, cliente_cif, total, albaran_ids, pedido_referencia, anulada').gte('fecha', desde).order('fecha', { ascending: false }).limit(800),
        ctx.supabase.from('albaranes_firmados').select('albaran_id, factura_id'),
    ])
    const facturaDeAlbaran = new Map<string, any>()
    for (const f of facs || []) for (const id of (Array.isArray(f.albaran_ids) ? f.albaran_ids : [])) facturaDeAlbaran.set(String(id), f)
    const facPorId = new Map((facs || []).map((f: any) => [f.id, f]))
    const albFirmados = new Set((firmas || []).map((x: any) => x.albaran_id).filter(Boolean))
    const facConSoporte = new Set((firmas || []).map((x: any) => x.factura_id).filter(Boolean))

    const puntuar = (numero: string, cliente: string, cif: string, fecha: string, pedido: string) => {
        let p = 0; const motivos: string[] = []
        const n = coincideNumero(d.numero_documento, numero)
        if (n) { p += n * 100; motivos.push(n >= 0.9 ? 'mismo número' : 'número parecido') }
        if (d.cliente_cif && cif && digitos(d.cliente_cif) === digitos(cif) && digitos(cif).length >= 7) { p += 40; motivos.push('mismo CIF') }
        else { const s = parecidoNombre(d.cliente, cliente); if (s >= 0.5) { p += 35 * s; motivos.push('mismo cliente') } }
        if (d.pedido_referencia && pedido && norm(d.pedido_referencia) === norm(pedido)) { p += 30; motivos.push('mismo pedido') }
        const dd = dias(d.fecha_documento, fecha)
        if (dd <= 3) { p += 15; motivos.push('misma fecha') } else if (dd <= 20) p += 6
        return { p, motivo: motivos.join(' · ') || 'reciente' }
    }

    const lista: Candidato[] = []
    for (const a of albs || []) {
        const { p, motivo } = puntuar(a.numero, a.cliente_razon_social, a.cliente_cif, a.fecha, a.pedido_referencia)
        const fac = (a.factura_id && facPorId.get(a.factura_id)) || facturaDeAlbaran.get(a.id)
        const ya = !!a.firmado_at || albFirmados.has(a.id)
        lista.push({ tipo: 'albaran', id: a.id, numero: a.numero, cliente: a.cliente_razon_social, fecha: a.fecha, total: Number(a.total || 0), factura_id: fac?.id || null, factura_numero: fac?.numero || null, ya_firmado: ya, puntos: p + (ya ? -10 : 5), motivo })
    }
    for (const f of facs || []) {
        if (f.anulada) continue
        const { p, motivo } = puntuar(f.numero, f.cliente_razon_social, f.cliente_cif, f.fecha, f.pedido_referencia)
        // Una factura se propone sobre todo para partes/servicios sin albarán
        lista.push({ tipo: 'factura', id: f.id, numero: f.numero, cliente: f.cliente_razon_social, fecha: f.fecha, total: Number(f.total || 0), ya_firmado: facConSoporte.has(f.id), puntos: p * (d.tipo === 'albaran' ? 0.8 : 0.95), motivo })
    }
    const hayPistas = !!(d.numero_documento || d.cliente || d.cliente_cif || d.pedido_referencia)
    return lista.filter(c => !hayPistas || c.puntos >= 20).sort((a, b) => b.puntos - a.puntos).slice(0, limite)
}

const fechaES = (f?: string | null) => (f ? new Date(f).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) : '')

/** Recalcula las marcas de firma en el albarán y el resumen de soportes de la factura. */
async function refrescarMarcas(ctx: Pick<Contexto, 'supabase'>, albaranIds: (string | null | undefined)[], facturaIds: (string | null | undefined)[]) {
    for (const id of new Set(albaranIds.filter(Boolean) as string[])) {
        const { data: fs } = await ctx.supabase.from('albaranes_firmados').select('archivo_url, fecha_documento, created_at, firmante_nombre, firmado').eq('albaran_id', id).order('created_at', { ascending: true })
        const valido = (fs || []).find((f: any) => f.firmado !== false) || (fs || [])[0]
        await ctx.supabase.from('albaranes').update(valido
            ? { documento_firmado_url: valido.archivo_url, firmado_at: valido.fecha_documento || valido.created_at, firmado_por: valido.firmante_nombre || null }
            : { documento_firmado_url: null, firmado_at: null, firmado_por: null }).eq('id', id)
    }
    for (const id of new Set(facturaIds.filter(Boolean) as string[])) {
        const { data: fs } = await ctx.supabase.from('albaranes_firmados').select('tipo, numero_documento, fecha_documento, created_at, albaranes(numero)').eq('factura_id', id).order('created_at', { ascending: true })
        const texto = (fs || []).map((f: any) => `${f.albaranes?.numero || f.numero_documento || etiquetaTipo(f.tipo)} firmado ${fechaES(f.fecha_documento || f.created_at)}`).join(' · ')
        await ctx.supabase.from('facturas').update({ soportes_firmados: texto || null }).eq('id', id)
    }
}

/** Factura a la que pertenece un albarán (por factura_id o por albaran_ids de la factura). */
async function facturaDeAlbaran(ctx: Pick<Contexto, 'supabase'>, albaranId: string): Promise<string | null> {
    const { data: a } = await ctx.supabase.from('albaranes').select('factura_id').eq('id', albaranId).maybeSingle()
    if (a?.factura_id) return a.factura_id
    const { data: f } = await ctx.supabase.from('facturas').select('id').filter('albaran_ids', 'cs', JSON.stringify([albaranId])).limit(1).maybeSingle()
    return f?.id || null
}

/** Registra un documento firmado (ya subido al almacenamiento privado) y, si se indica, lo une. */
export async function registrarFirmado(ctx: Contexto, p: {
    archivo_url: string; archivo_nombre?: string | null; archivo_tipo?: string | null
    datos: Partial<DatosFirmado>; albaran_id?: string | null; factura_id?: string | null; origen?: 'web' | 'telegram' | 'ia'
}) {
    const d = p.datos || {}
    let facturaId = p.factura_id || null
    let clienteId: string | null = null
    let clienteNombre = d.cliente || null
    if (p.albaran_id) {
        const { data: a } = await ctx.supabase.from('albaranes').select('id, cliente_id, cliente_razon_social').eq('id', p.albaran_id).maybeSingle()
        if (!a) throw new Error('El albarán indicado no existe')
        clienteId = a.cliente_id; clienteNombre = a.cliente_razon_social || clienteNombre
        facturaId = facturaId || await facturaDeAlbaran(ctx, p.albaran_id)
    }
    if (facturaId && !clienteId) {
        const { data: f } = await ctx.supabase.from('facturas').select('cliente_id, cliente_razon_social').eq('id', facturaId).maybeSingle()
        if (!f) throw new Error('La factura indicada no existe')
        clienteId = f.cliente_id; clienteNombre = f.cliente_razon_social || clienteNombre
    }
    const incid = limpiarTexto(d.incidencias)
    const { data, error } = await ctx.supabase.from('albaranes_firmados').insert({
        empresa_id: ctx.empresaId,
        tipo: d.tipo || 'albaran',
        albaran_id: p.albaran_id || null,
        factura_id: facturaId,
        cliente_id: clienteId,
        cliente_razon_social: clienteNombre,
        archivo_url: p.archivo_url,
        archivo_nombre: p.archivo_nombre || null,
        archivo_tipo: p.archivo_tipo || null,
        numero_documento: d.numero_documento || null,
        fecha_documento: d.fecha_documento || null,
        firmado: d.firmado ?? null,
        firmante_nombre: d.firmante_nombre || null,
        firmante_dni: d.firmante_dni || null,
        descripcion: d.descripcion || null,
        horas: d.horas ?? null,
        incidencias: incid,
        con_incidencias: !!incid,
        ocr_data: d,
        validado: !!(p.albaran_id || facturaId),
        origen: p.origen || 'web',
        usuario_id: ctx.userId,
        fecha_subida: new Date().toISOString(),
    }).select('*').single()
    if (error) throw new Error('No se pudo guardar el documento firmado: ' + error.message)
    await refrescarMarcas(ctx, [p.albaran_id], [facturaId])
    await auditar(ctx, 'documento_firmado_registrado', { tipo: 'documento_firmado', id: data.id, ref: d.numero_documento || null }, { albaran_id: p.albaran_id || null, factura_id: facturaId, tipo: d.tipo })
    return data
}

/** Une (o cambia) un documento firmado a un albarán y/o factura. null = soltar. */
export async function vincularFirmado(ctx: Contexto, id: string, destino: { albaran_id?: string | null; factura_id?: string | null }) {
    const { data: antes } = await ctx.supabase.from('albaranes_firmados').select('id, albaran_id, factura_id').eq('id', id).maybeSingle()
    if (!antes) throw new Error('Documento no encontrado')
    const albaranId = destino.albaran_id === undefined ? antes.albaran_id : destino.albaran_id
    let facturaId = destino.factura_id === undefined ? antes.factura_id : destino.factura_id
    const upd: any = { albaran_id: albaranId || null, updated_at: new Date().toISOString() }
    if (albaranId && destino.albaran_id !== undefined && destino.factura_id === undefined) facturaId = await facturaDeAlbaran(ctx, albaranId)
    upd.factura_id = facturaId || null
    const origen = albaranId
        ? (await ctx.supabase.from('albaranes').select('cliente_id, cliente_razon_social').eq('id', albaranId).maybeSingle()).data
        : facturaId ? (await ctx.supabase.from('facturas').select('cliente_id, cliente_razon_social').eq('id', facturaId).maybeSingle()).data : null
    if (origen) { upd.cliente_id = origen.cliente_id; upd.cliente_razon_social = origen.cliente_razon_social }
    upd.validado = !!(albaranId || facturaId)
    const { error } = await ctx.supabase.from('albaranes_firmados').update(upd).eq('id', id)
    if (error) throw new Error(error.message)
    await refrescarMarcas(ctx, [antes.albaran_id, albaranId], [antes.factura_id, facturaId])
    await auditar(ctx, 'documento_firmado_vinculado', { tipo: 'documento_firmado', id }, { antes: { albaran_id: antes.albaran_id, factura_id: antes.factura_id }, despues: { albaran_id: albaranId, factura_id: facturaId } })
}

/** Cuando se factura un albarán que ya tenía firma, la firma pasa también a la factura. */
export async function propagarFirmasAFactura(ctx: Pick<Contexto, 'supabase'>, facturaId: string, albaranIds: string[]) {
    if (!facturaId || !albaranIds?.length) return
    await ctx.supabase.from('albaranes_firmados').update({ factura_id: facturaId }).in('albaran_id', albaranIds).is('factura_id', null)
    await refrescarMarcas(ctx, [], [facturaId])
}

export async function eliminarFirmado(ctx: Contexto, id: string) {
    const { data: antes } = await ctx.supabase.from('albaranes_firmados').select('*').eq('id', id).maybeSingle()
    if (!antes) throw new Error('Documento no encontrado')
    const { error } = await ctx.supabase.from('albaranes_firmados').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await refrescarMarcas(ctx, [antes.albaran_id], [antes.factura_id])
    await auditar(ctx, 'documento_firmado_eliminado', { tipo: 'documento_firmado', id, ref: antes.numero_documento }, { archivo: antes.archivo_url, albaran_id: antes.albaran_id, factura_id: antes.factura_id })
}

/** Actualiza los datos leídos (corrección manual). */
export async function editarFirmado(ctx: Contexto, id: string, cambios: Partial<DatosFirmado>) {
    const permitidos = ['tipo', 'numero_documento', 'fecha_documento', 'firmado', 'firmante_nombre', 'firmante_dni', 'descripcion', 'horas', 'incidencias'] as const
    const upd: any = { updated_at: new Date().toISOString() }
    for (const k of permitidos) if (k in cambios) upd[k] = (cambios as any)[k] === '' ? null : (cambios as any)[k]
    if ('incidencias' in upd) upd.con_incidencias = !!upd.incidencias
    const { data, error } = await ctx.supabase.from('albaranes_firmados').update(upd).eq('id', id).select('albaran_id, factura_id').single()
    if (error) throw new Error(error.message)
    await refrescarMarcas(ctx, [data.albaran_id], [data.factura_id])
}

/** Situación del control de firmas: qué falta por cuadrar. */
export async function estadoFirmas(ctx: Pick<Contexto, 'supabase'>, diasAtras = 120) {
    const desde = new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10)
    const [{ data: albs }, { data: docs }, { data: facs }] = await Promise.all([
        ctx.supabase.from('albaranes').select('id, numero, fecha, cliente_razon_social, total, firmado_at, factura_id').gte('fecha', desde).order('fecha', { ascending: true }),
        ctx.supabase.from('albaranes_firmados').select('id, albaran_id, factura_id, con_incidencias, firmado'),
        ctx.supabase.from('facturas').select('id, numero, fecha, cliente_razon_social, total, albaran_ids, soportes_firmados, anulada, estado_cobro').gte('fecha', desde),
    ])
    const albaranesSinFirma = (albs || []).filter((a: any) => !a.firmado_at)
    const facturasSinSoporte = (facs || []).filter((f: any) => !f.anulada && !f.soportes_firmados)
    const pendientesDeUnir = (docs || []).filter((d: any) => !d.albaran_id && !d.factura_id).length
    const conIncidencias = (docs || []).filter((d: any) => d.con_incidencias).length
    const sinFirmaDetectada = (docs || []).filter((d: any) => d.firmado === false).length
    return { albaranesSinFirma, facturasSinSoporte, pendientesDeUnir, conIncidencias, sinFirmaDetectada, total: (docs || []).length }
}

/**
 * Expediente de una factura en un único PDF: portada con el índice,
 * la factura, sus albaranes y todos los documentos firmados unidos.
 */
export async function dossierFactura(ctx: Contexto, facturaId: string): Promise<{ pdf: Buffer; nombre: string }> {
    const { data: f } = await ctx.supabase.from('facturas').select('*').eq('id', facturaId).maybeSingle()
    if (!f) throw new Error('Factura no encontrada')
    const albIds: string[] = Array.isArray(f.albaran_ids) ? f.albaran_ids.map(String) : []
    const { data: albsDirectos } = await ctx.supabase.from('albaranes').select('*').eq('factura_id', facturaId)
    const { data: albsLista } = albIds.length ? await ctx.supabase.from('albaranes').select('*').in('id', albIds) : { data: [] as any[] }
    const albaranes = [...new Map([...(albsLista || []), ...(albsDirectos || [])].map((a: any) => [a.id, a])).values()]
    const ids = albaranes.map(a => a.id)
    const { data: docsFactura } = await ctx.supabase.from('albaranes_firmados').select('*').eq('factura_id', facturaId)
    const { data: docsAlb } = ids.length ? await ctx.supabase.from('albaranes_firmados').select('*').in('albaran_id', ids) : { data: [] as any[] }
    const firmados = [...new Map([...(docsFactura || []), ...(docsAlb || [])].map((d: any) => [d.id, d])).values()]

    const salida = await PDFDocument.create()
    const fuente = await salida.embedFont(StandardFonts.Helvetica)
    const negrita = await salida.embedFont(StandardFonts.HelveticaBold)
    const txt = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, '-')

    // Portada / índice
    const portada = salida.addPage([595.28, 841.89])
    let y = 780
    portada.drawText(txt(`Expediente de la factura ${f.numero}`), { x: 50, y, size: 20, font: negrita }); y -= 26
    portada.drawText(txt(`${f.cliente_razon_social || ''} · ${fechaES(f.fecha)} · ${Number(f.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} EUR`), { x: 50, y, size: 11, font: fuente }); y -= 34
    const linea = (t: string, ok?: boolean) => {
        if (ok !== undefined) portada.drawText(ok ? 'OK' : '!!', { x: 50, y, size: 10, font: negrita, color: ok ? rgb(0.05, 0.55, 0.3) : rgb(0.8, 0.2, 0.1) })
        portada.drawText(txt(t).slice(0, 95), { x: 75, y, size: 10.5, font: fuente }); y -= 18
    }
    portada.drawText('Contenido', { x: 50, y, size: 13, font: negrita }); y -= 22
    linea(`Factura ${f.numero}`, true)
    for (const a of albaranes) {
        const docs = firmados.filter(d => d.albaran_id === a.id)
        linea(`Albarán ${a.numero} (${fechaES(a.fecha)}) · ${docs.length ? `firmado${a.firmado_por ? ' por ' + a.firmado_por : ''} ${fechaES(a.firmado_at)}` : 'SIN FIRMA'}`, docs.length > 0)
    }
    for (const d of firmados.filter(d => !d.albaran_id || !ids.includes(d.albaran_id))) {
        linea(`${etiquetaTipo(d.tipo)} ${d.numero_documento || ''} firmado${d.firmante_nombre ? ' por ' + d.firmante_nombre : ''} ${fechaES(d.fecha_documento || d.created_at)}`, d.firmado !== false)
    }
    const incid = firmados.filter(d => d.con_incidencias)
    if (incid.length) { y -= 8; portada.drawText('Incidencias anotadas por el cliente', { x: 50, y, size: 12, font: negrita, color: rgb(0.8, 0.2, 0.1) }); y -= 18; for (const d of incid) linea(`${d.numero_documento || etiquetaTipo(d.tipo)}: ${d.incidencias}`) }
    if (!firmados.length) { y -= 8; linea('Esta factura todavía no tiene ningún albarán o parte firmado unido.', false) }
    portada.drawText(txt(`Generado el ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} por ${ctx.nombre}`), { x: 50, y: 40, size: 8, font: fuente, color: rgb(0.5, 0.5, 0.5) })

    const anexarPdf = async (bytes: Uint8Array | Buffer) => {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        for (const p of await salida.copyPages(src, src.getPageIndices())) salida.addPage(p)
    }
    await anexarPdf(await pdfDeDocumento(f, 'factura', ctx))
    for (const a of albaranes) {
        await anexarPdf(await pdfDeDocumento(a, 'albaran', ctx))
        for (const d of firmados.filter(x => x.albaran_id === a.id)) await anexarFirmado(d)
    }
    for (const d of firmados.filter(d => !d.albaran_id || !ids.includes(d.albaran_id))) await anexarFirmado(d)

    async function anexarFirmado(d: any) {
        try {
            const { buffer, contentType } = await descargarArchivo(ctx, d.archivo_url)
            if (contentType.includes('pdf') || buffer.subarray(0, 5).toString('latin1') === '%PDF-') return await anexarPdf(buffer)
            const img = /png/.test(contentType) || buffer.subarray(1, 4).toString('latin1') === 'PNG' ? await salida.embedPng(buffer) : await salida.embedJpg(buffer)
            const pag = salida.addPage([595.28, 841.89])
            pag.drawText(txt(`${etiquetaTipo(d.tipo)} firmado ${d.numero_documento || ''} · ${d.cliente_razon_social || ''}`).slice(0, 90), { x: 30, y: 815, size: 10, font: negrita })
            const esc = Math.min(535 / img.width, 770 / img.height)
            pag.drawImage(img, { x: (595.28 - img.width * esc) / 2, y: 30 + (770 - img.height * esc) / 2, width: img.width * esc, height: img.height * esc })
        } catch (e: any) {
            const pag = salida.addPage([595.28, 841.89])
            pag.drawText(txt(`No se pudo incluir el archivo de ${d.numero_documento || 'un documento firmado'}: ${e?.message || e}`).slice(0, 110), { x: 30, y: 800, size: 10, font: fuente })
        }
    }

    return { pdf: Buffer.from(await salida.save()), nombre: `Expediente_${f.numero}.pdf` }
}

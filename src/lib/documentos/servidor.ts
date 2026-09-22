import 'server-only'
import type { Contexto } from '@/lib/auth'
import { assertPermiso } from '@/lib/auth'
import { generatePDF } from '@/lib/pdf-generator'
import { LOGO_DATA_URL } from '@/lib/documentos/logo-data'
import { marcaDesdeEmpresa, type MarcaDocumento } from '@/lib/documentos/marca'
import { enviarCorreo, getEmpresa, registrarEnvio } from '@/lib/email/mailer'
import { auditar } from '@/lib/auditoria'

export type TipoDocumento = 'presupuesto' | 'albaran' | 'factura'

export const TABLA: Record<TipoDocumento, string> = {
    presupuesto: 'presupuestos',
    albaran: 'albaranes',
    factura: 'facturas',
}

export const NOMBRE: Record<TipoDocumento, string> = {
    presupuesto: 'Presupuesto',
    albaran: 'Albarán',
    factura: 'Factura',
}

const norm = (s: string) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '')

/**
 * Busca un documento por número tolerando cómo lo escriba una persona:
 * "FAC-01-2026", "fac 01", "factura 1", "42"... Devuelve todas las
 * coincidencias (para poder preguntar si hay más de una).
 */
export async function buscarDocumentoPorNumero(ctx: Contexto, tipo: TipoDocumento, texto: string): Promise<any[]> {
    const limpio = (texto || '').trim()
    if (!limpio) return []

    const { data: exacto } = await ctx.supabase.from(TABLA[tipo]).select('*').ilike('numero', limpio).limit(2)
    if (exacto && exacto.length === 1) return exacto

    const { data: todos } = await ctx.supabase
        .from(TABLA[tipo])
        .select('*')
        .order('fecha', { ascending: false })
        .limit(2000)

    const lista: any[] = todos || []
    const soloDigitos = limpio.replace(/\D/g, '')
    const q = norm(limpio).replace(/^(FACTURA|PRESUPUESTO|ALBARAN)/, '')

    // "42" o "fac 1": comparar el número de secuencia (FAC-42-2026 → 42).
    const secuencia = (numero: string) => {
        const m = (numero || '').match(/-(\d+)-\d{4}/)
        return m ? parseInt(m[1], 10) : null
    }
    const textoSinAnio = limpio.replace(/\b20\d{2}\b/, '')
    const numeroPedido = textoSinAnio.replace(/\D/g, '')

    // Primero por número de secuencia ("fac 01", "factura 1", "la 42"): es lo
    // que la gente dice de viva voz y es inequívoco dentro del año.
    if (numeroPedido) {
        const n = parseInt(numeroPedido, 10)
        const anio = limpio.match(/\b(20\d{2})\b/)?.[1]
        const porSecuencia = lista.filter(d => secuencia(d.numero) === n && (!anio || d.numero.endsWith(anio)))
        if (porSecuencia.length) {
            // Si hay varios años, el más reciente primero (la lista ya viene ordenada por fecha).
            return porSecuencia
        }
    }

    if (q.length >= 3) {
        const porNormalizado = lista.filter(d => norm(d.numero).includes(q))
        if (porNormalizado.length) return porNormalizado
    }

    if (soloDigitos.length >= 2) return lista.filter(d => (d.numero || '').replace(/\D/g, '').includes(soloDigitos))
    return []
}

/** Emails a los que enviar un documento de un cliente: facturación > principal > adicionales. */
export async function emailsDeCliente(ctx: Contexto, clienteId?: string | null, emailDocumento?: string | null): Promise<string[]> {
    const emails: string[] = []
    const add = (e?: string | null) => {
        for (const x of (e || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)) {
            if (!emails.includes(x.toLowerCase())) emails.push(x.toLowerCase())
        }
    }
    add(emailDocumento)
    if (clienteId) {
        const { data: c } = await ctx.supabase.from('contactos').select('email, email_facturacion').eq('id', clienteId).maybeSingle()
        if (emails.length === 0) add(c?.email_facturacion || c?.email)
        if (emails.length === 0) {
            const { data: extra } = await ctx.supabase.from('client_emails').select('email').eq('client_id', clienteId).limit(3)
            for (const e of extra || []) add(e.email)
        }
    }
    return emails
}

/** Marca de la empresa (logo en base64, datos, color, textos) para PDFs generados en servidor. */
export async function marcaServidor(ctx: Pick<Contexto, 'supabase' | 'empresaId'>): Promise<MarcaDocumento> {
    const { data: e } = await ctx.supabase.from('empresas').select('*').eq('id', ctx.empresaId).maybeSingle()
    let logo: string | null = null
    if (e?.logo_documentos_url) {
        try {
            const res = await fetch(e.logo_documentos_url)
            if (res.ok) {
                const tipo = res.headers.get('content-type') || 'image/png'
                logo = `data:${tipo};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
            }
        } catch (err) {
            console.warn('No se pudo descargar el logo de documentos', err)
        }
    }
    return marcaDesdeEmpresa(e, logo || LOGO_DATA_URL)
}

/** PDF del documento como Buffer (mismo diseño que la descarga desde la web, con la marca de la empresa). */
export async function pdfDeDocumento(doc: any, tipo: TipoDocumento, ctx: Pick<Contexto, 'supabase' | 'empresaId'>): Promise<Buffer> {
    const marca = await marcaServidor(ctx)
    const ab = await generatePDF(doc, tipo, 'arraybuffer', { marca })
    return Buffer.from(ab as ArrayBuffer)
}

export function nombreArchivo(doc: any, tipo: TipoDocumento) {
    return `${NOMBRE[tipo]}_${String(doc.numero || 'documento').replace(/[^\w.-]+/g, '-')}.pdf`
}

/** Marca un documento como enviado (statuses + booleanos heredados). */
export async function marcarEnviado(ctx: Contexto, tipo: TipoDocumento, doc: any) {
    const statuses = Array.from(new Set([...(doc.statuses || []), 'enviado']))
    const update: any = { statuses, es_enviado: true, enviado_email: true }
    if (tipo === 'factura') { update.enviada = true; update.fecha_envio = new Date().toISOString() }
    if (tipo === 'presupuesto') { update.enviado = true; update.fecha_envio = new Date().toISOString() }
    if (tipo === 'albaran') update.enviado = true
    await ctx.supabase.from(TABLA[tipo]).update(update).eq('id', doc.id)
    await ctx.supabase.from('document_status').insert({ document_type: tipo, document_id: doc.id, status: 'enviado', created_by: ctx.nombre })
}

/**
 * Envía un documento (presupuesto/albarán/factura) por correo con su PDF
 * adjunto, lo marca como enviado, lo registra en el historial y en auditoría.
 * Es lo que ejecuta la IA/Telegram tras la confirmación del usuario.
 */
export async function enviarDocumentoPorCorreo(ctx: Contexto, params: {
    tipo: TipoDocumento
    documentoId: string
    destinatarios: string[]
    cc?: string[]
    asunto: string
    cuerpo: string
    motivo?: 'envio' | 'reclamacion'
}) {
    assertPermiso(ctx, 'enviar')
    const { data: doc, error } = await ctx.supabase.from(TABLA[params.tipo]).select('*').eq('id', params.documentoId).maybeSingle()
    if (error || !doc) throw new Error('No se encuentra el documento.')

    const empresa = await getEmpresa(ctx)
    const pdf = await pdfDeDocumento(doc, params.tipo, ctx)

    const res = await enviarCorreo({
        to: params.destinatarios,
        cc: params.cc,
        subject: params.asunto,
        cuerpo: params.cuerpo,
        attachments: [{ filename: nombreArchivo(doc, params.tipo), content: pdf, contentType: 'application/pdf' }],
    }, empresa)

    if (params.motivo !== 'reclamacion') await marcarEnviado(ctx, params.tipo, doc)

    await registrarEnvio(ctx, {
        destinatario: res.cc.length ? `${res.to.join(', ')} (CC: ${res.cc.join(', ')})` : res.to.join(', '),
        tipo_documento: params.motivo === 'reclamacion' ? 'Reclamación de pago' : NOMBRE[params.tipo],
        numero_documento: doc.numero,
        documento_id: doc.id,
        pedido_referencia: doc.pedido_referencia,
        asunto: params.asunto,
        mensaje: params.cuerpo,
        motivo: params.motivo || 'envio',
    })

    await auditar(ctx, params.motivo === 'reclamacion' ? 'reclamacion_enviada' : 'documento_enviado',
        { tipo: params.tipo, id: doc.id, ref: doc.numero },
        { destinatarios: res.to, cc: res.cc, asunto: params.asunto, messageId: res.messageId })

    return { numero: doc.numero, destinatarios: res.to, messageId: res.messageId }
}

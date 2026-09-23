'use server'

import { revalidatePath } from 'next/cache'
import { getContexto, requirePermiso, mensajeError } from '@/lib/auth'
import { descargarArchivo, parsearRutaArchivo } from '@/lib/archivos-servidor'
import {
    leerDocumentoFirmado, sugerirVinculos, registrarFirmado, vincularFirmado, editarFirmado,
    eliminarFirmado, estadoFirmas, type DatosFirmado,
} from '@/lib/firmados/servidor'

const refrescar = () => { revalidatePath('/albaranes-firmados'); revalidatePath('/albaranes'); revalidatePath('/facturas') }

/** Lee con IA un documento firmado ya subido y propone a qué albarán/factura unirlo. */
export async function analizarFirmado(archivoUrl: string) {
    try {
        const ctx = await requirePermiso('documentos')
        const ruta = parsearRutaArchivo(archivoUrl)
        if (!ruta || ruta.bucket !== 'albaranes-firmados') throw new Error('Archivo no válido')
        const { buffer, contentType } = await descargarArchivo(ctx, archivoUrl)
        const datos = await leerDocumentoFirmado(ctx, buffer, contentType)
        const candidatos = await sugerirVinculos(ctx, datos)
        return { success: true as const, datos, candidatos }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/** Busca albaranes y facturas por número o cliente para unir a mano. */
export async function buscarParaUnir(texto: string) {
    try {
        const ctx = await getContexto()
        const q = (texto || '').trim()
        const filtro = q ? `numero.ilike.%${q.replace(/[%,()]/g, ' ')}%,cliente_razon_social.ilike.%${q.replace(/[%,()]/g, ' ')}%` : null
        let qa = ctx.supabase.from('albaranes').select('id, numero, fecha, cliente_razon_social, total, factura_id, firmado_at').order('fecha', { ascending: false }).limit(15)
        let qf = ctx.supabase.from('facturas').select('id, numero, fecha, cliente_razon_social, total, soportes_firmados, anulada').order('fecha', { ascending: false }).limit(15)
        if (filtro) { qa = qa.or(filtro); qf = qf.or(filtro) }
        const [{ data: albs }, { data: facs }] = await Promise.all([qa, qf])
        return {
            success: true as const,
            resultados: [
                ...(albs || []).map((a: any) => ({ tipo: 'albaran' as const, id: a.id, numero: a.numero, cliente: a.cliente_razon_social, fecha: a.fecha, total: Number(a.total || 0), ya_firmado: !!a.firmado_at, facturado: !!a.factura_id })),
                ...(facs || []).filter((f: any) => !f.anulada).map((f: any) => ({ tipo: 'factura' as const, id: f.id, numero: f.numero, cliente: f.cliente_razon_social, fecha: f.fecha, total: Number(f.total || 0), ya_firmado: !!f.soportes_firmados, facturado: true })),
            ],
        }
    } catch (e) {
        return { success: false as const, error: mensajeError(e), resultados: [] }
    }
}

export async function guardarFirmado(p: {
    archivo_url: string; archivo_nombre?: string; archivo_tipo?: string
    datos: Partial<DatosFirmado>; albaran_id?: string | null; factura_id?: string | null
}) {
    try {
        const ctx = await requirePermiso('documentos')
        const ruta = parsearRutaArchivo(p.archivo_url)
        if (!ruta || ruta.bucket !== 'albaranes-firmados' || ruta.path.split('/')[0] !== ctx.empresaId) throw new Error('Archivo no válido')
        const doc = await registrarFirmado(ctx, { ...p, origen: 'web' })
        refrescar()
        return { success: true as const, id: doc.id as string }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function unirFirmado(id: string, destino: { albaran_id?: string | null; factura_id?: string | null }) {
    try {
        const ctx = await requirePermiso('documentos')
        await vincularFirmado(ctx, id, destino)
        refrescar()
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function corregirFirmado(id: string, cambios: Partial<DatosFirmado>) {
    try {
        const ctx = await requirePermiso('documentos')
        await editarFirmado(ctx, id, cambios)
        refrescar()
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function borrarFirmado(id: string) {
    try {
        const ctx = await requirePermiso('documentos')
        await eliminarFirmado(ctx, id)
        refrescar()
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/** Listado con filtros para la pantalla de firmados. */
export async function listarFirmados(f: { estado?: string; tipo?: string; texto?: string; desde?: string; hasta?: string } = {}) {
    try {
        const ctx = await getContexto()
        let q = ctx.supabase.from('albaranes_firmados')
            .select('*, albaranes(id, numero, fecha, total), facturas(id, numero, fecha, total, estado_cobro)')
            .order('created_at', { ascending: false }).limit(300)
        if (f.estado === 'pendientes') q = q.is('albaran_id', null).is('factura_id', null)
        if (f.estado === 'unidos') q = q.or('albaran_id.not.is.null,factura_id.not.is.null')
        if (f.estado === 'incidencias') q = q.eq('con_incidencias', true)
        if (f.estado === 'sin_firma') q = q.eq('firmado', false)
        if (f.tipo && f.tipo !== 'todos') q = q.eq('tipo', f.tipo)
        if (f.desde) q = q.gte('created_at', f.desde)
        if (f.hasta) q = q.lte('created_at', f.hasta + 'T23:59:59')
        if (f.texto?.trim()) {
            const t = f.texto.trim().replace(/[%,()]/g, ' ')
            q = q.or(`numero_documento.ilike.%${t}%,cliente_razon_social.ilike.%${t}%,firmante_nombre.ilike.%${t}%,descripcion.ilike.%${t}%`)
        }
        const [{ data, error }, estado] = await Promise.all([q, estadoFirmas(ctx)])
        if (error) throw error
        return { success: true as const, documentos: data || [], estado }
    } catch (e) {
        return { success: false as const, error: mensajeError(e), documentos: [], estado: null }
    }
}

/** Sugerencias de unión para un documento ya guardado (a partir de lo que leyó la IA). */
export async function sugerenciasDe(id: string) {
    try {
        const ctx = await getContexto()
        const { data: d } = await ctx.supabase.from('albaranes_firmados').select('*').eq('id', id).maybeSingle()
        if (!d) throw new Error('Documento no encontrado')
        const candidatos = await sugerirVinculos(ctx, { ...(d.ocr_data || {}), tipo: d.tipo, numero_documento: d.numero_documento, fecha_documento: d.fecha_documento, cliente: d.cliente_razon_social || d.ocr_data?.cliente })
        return { success: true as const, candidatos }
    } catch (e) {
        return { success: false as const, error: mensajeError(e), candidatos: [] }
    }
}

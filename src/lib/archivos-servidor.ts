import 'server-only'
import type { Contexto } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** URL interna (protegida por sesión) de un archivo privado. */
export function urlProtegida(bucket: string, path: string) {
    return `/api/archivos/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Extrae bucket y ruta de cualquiera de los formatos guardados:
 * '/api/archivos/<bucket>/<ruta>', '<bucket>/<ruta>' o la antigua URL pública.
 */
export function parsearRutaArchivo(ref: string): { bucket: string; path: string } | null {
    if (!ref) return null
    let s = ref.trim()
    const pub = s.match(/\/storage\/v1\/object\/(?:public|sign)\/([^?]+)/)
    if (pub) s = pub[1]
    else s = s.replace(/^https?:\/\/[^/]+/, '').replace(/^\/?api\/archivos\//, '')
    s = s.replace(/^\//, '').split('?')[0]
    const [bucket, ...resto] = s.split('/').map(decodeURIComponent)
    if (!bucket || resto.length === 0) return null
    return { bucket, path: resto.join('/') }
}

/** Comprueba que el archivo pertenece a la empresa del usuario. */
async function perteneceAEmpresa(ctx: Pick<Contexto, 'empresaId'>, path: string) {
    const carpeta = path.split('/')[0]
    if (UUID_RE.test(carpeta)) return carpeta === ctx.empresaId
    const { data: inicial } = await createAdminClient().from('empresas').select('id').order('created_at').limit(1).maybeSingle()
    return inicial?.id === ctx.empresaId
}

/** Descarga un archivo privado de la empresa (para OCR, adjuntar a correos...). */
export async function descargarArchivo(ctx: Pick<Contexto, 'empresaId'>, ref: string): Promise<{ buffer: Buffer; contentType: string; nombre: string }> {
    const r = parsearRutaArchivo(ref)
    if (!r) throw new Error('Referencia de archivo no válida')
    if (!(await perteneceAEmpresa(ctx, r.path))) throw new Error('No autorizado')
    const { data, error } = await createAdminClient().storage.from(r.bucket).download(r.path)
    if (error || !data) throw new Error('No se pudo descargar el archivo')
    return { buffer: Buffer.from(await data.arrayBuffer()), contentType: data.type || '', nombre: r.path.split('/').pop() || 'archivo' }
}

/** Sube un archivo a la carpeta de la empresa y devuelve su URL protegida. */
export async function subirArchivo(ctx: Pick<Contexto, 'empresaId'>, bucket: string, subcarpeta: string, contenido: Buffer, contentType: string, extension: string) {
    const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const path = `${ctx.empresaId}/${subcarpeta}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.${ext}`
    const { error } = await createAdminClient().storage.from(bucket).upload(path, contenido, { contentType, upsert: false })
    if (error) throw new Error('No se pudo guardar el archivo: ' + error.message)
    return { bucket, path, url: urlProtegida(bucket, path) }
}

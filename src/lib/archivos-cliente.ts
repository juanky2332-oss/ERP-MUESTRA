import { supabase } from '@/lib/supabase'

/**
 * Sube un archivo desde el navegador al almacenamiento PRIVADO, dentro de la
 * carpeta de la empresa del usuario (las políticas de Storage solo permiten
 * esa carpeta). Devuelve la URL interna protegida /api/archivos/...
 */
export async function subirArchivoPrivado(bucket: string, file: File, prefijo = 'doc'): Promise<string> {
    const { data: empresaId, error: rpcError } = await supabase.rpc('mi_empresa_id')
    if (rpcError || !empresaId) throw new Error('No se pudo identificar tu empresa. Vuelve a iniciar sesión.')
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${empresaId}/${prefijo}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error('Error subiendo el archivo: ' + error.message)
    return `/api/archivos/${bucket}/${path}`
}

import { supabase } from '@/lib/supabase'
import { marcaDesdeEmpresa, type MarcaDocumento } from './marca'

/**
 * Carga la marca de la empresa del usuario para generar PDFs en el navegador.
 * Se cachea por sesión y se invalida en cuanto cambia el logo o los datos
 * (clave = fecha de actualización del logo + datos relevantes).
 */
let cache: { clave: string; marca: MarcaDocumento } | null = null

async function aDataUrl(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return null
        const blob = await res.blob()
        return await new Promise(resolve => {
            const r = new FileReader()
            r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
            r.onerror = () => resolve(null)
            r.readAsDataURL(blob)
        })
    } catch {
        return null
    }
}

export async function cargarMarcaCliente(): Promise<MarcaDocumento> {
    const { data: empresaId } = await supabase.rpc('mi_empresa_id')
    const { data: e } = empresaId ? await supabase.from('empresas').select('*').eq('id', empresaId).maybeSingle() : { data: null }
    const clave = JSON.stringify([e?.logo_documentos_url, e?.logo_documentos_actualizado_at, e?.nombre, e?.nif, e?.direccion, e?.email, e?.telefono, e?.web, e?.color_documentos, e?.pie_documentos, e?.texto_factura, e?.iban, e?.mostrar_iban_factura])
    if (cache && cache.clave === clave) return cache.marca
    const logo = (e?.logo_documentos_url && await aDataUrl(e.logo_documentos_url)) || await aDataUrl('/icon-512.png')
    const marca = marcaDesdeEmpresa(e, logo)
    cache = { clave, marca }
    return marca
}

export function invalidarMarcaCliente() {
    cache = null
}

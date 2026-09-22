'use server'

import { getContexto, mensajeError } from '@/lib/auth'
import { leerDocumentoConIA } from '@/lib/ocr/leer'
import { descargarArchivo } from '@/lib/archivos-servidor'

/**
 * OCR de un archivo ya subido al almacenamiento privado del ERP.
 * Acepta la ruta protegida (/api/archivos/<bucket>/<ruta>): solo descarga
 * archivos de la propia empresa, nunca URLs externas arbitrarias.
 */
export async function processDocumentWithOCR(url: string) {
    try {
        const ctx = await getContexto()
        const archivo = await descargarArchivo(ctx, url)
        return await leerDocumentoConIA(archivo.buffer, archivo.contentType)
    } catch (e) {
        return { success: false, error: mensajeError(e) }
    }
}

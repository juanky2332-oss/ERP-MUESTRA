import { NextRequest } from 'next/server'
import { ctxFiscal, descarga, errorJson, generadoAhora } from '@/lib/fiscal/ruta'
import { librosDelPeriodo } from '@/lib/fiscal/servidor'
import { marcaServidor } from '@/lib/documentos/servidor'
import { nombreResumen } from '@/lib/fiscal/libros'
import { huellaLibros, pdfResumenFiscal } from '@/lib/fiscal/pdf-resumen'

export const maxDuration = 60

/** PDF resumen del periodo para el asesor. */
export async function GET(req: NextRequest) {
    try {
        const ctx = await ctxFiscal()
        const { libros, cfg } = await librosDelPeriodo(ctx, req.nextUrl.searchParams.get('periodo') || '')
        const marca = await marcaServidor(ctx)
        const pdf = pdfResumenFiscal(libros, marca, { generado: generadoAhora(), huella: huellaLibros(libros), regimen: cfg.regimen })
        return descarga(pdf, 'application/pdf', nombreResumen(libros.periodo))
    } catch (e) {
        return errorJson(e)
    }
}

import { NextRequest } from 'next/server'
import { ctxFiscal, descarga, errorJson, generadoAhora } from '@/lib/fiscal/ruta'
import { librosDelPeriodo, nombreEmpresa } from '@/lib/fiscal/servidor'
import { nombreLibros } from '@/lib/fiscal/libros'
import { huellaLibros } from '@/lib/fiscal/pdf-resumen'
import { excelLibros } from '@/lib/fiscal/excel'

export const maxDuration = 60

/** Libros registro de facturas expedidas y recibidas en Excel. */
export async function GET(req: NextRequest) {
    try {
        const ctx = await ctxFiscal()
        const { libros, empresa } = await librosDelPeriodo(ctx, req.nextUrl.searchParams.get('periodo') || '')
        const xlsx = await excelLibros(libros, { empresa: nombreEmpresa(empresa), nif: empresa?.nif, generado: generadoAhora(), huella: huellaLibros(libros) })
        return descarga(xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nombreLibros(libros.periodo))
    } catch (e) {
        return errorJson(e)
    }
}

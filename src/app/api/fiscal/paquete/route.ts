import { NextRequest, NextResponse } from 'next/server'
import { ctxFiscal, errorJson, generadoAhora } from '@/lib/fiscal/ruta'
import { librosDelPeriodo, nombreEmpresa } from '@/lib/fiscal/servidor'
import { carpetaRaiz, estructuraPaquete } from '@/lib/fiscal/libros'
import { huellaLibros } from '@/lib/fiscal/pdf-resumen'

export const maxDuration = 60

/**
 * Índice del paquete para el asesor: carpeta raíz y, para cada archivo, su
 * ruta y de dónde descargarlo. El navegador descarga cada documento UNA vez
 * y lo escribe en todas sus rutas (por fecha y por cliente/proveedor).
 */
export async function GET(req: NextRequest) {
    try {
        const ctx = await ctxFiscal()
        const clave = req.nextUrl.searchParams.get('periodo') || ''
        const { libros, empresa } = await librosDelPeriodo(ctx, clave)
        const nombre = nombreEmpresa(empresa)
        const q = `periodo=${encodeURIComponent(clave)}`
        const archivos = estructuraPaquete(libros, nombre, generadoAhora()).map(a => {
            const o = a.origen
            if (o.tipo === 'texto') return { ruta: a.ruta, contenido: o.contenido }
            const url = o.tipo === 'emitida' ? `/api/pdf/factura/${o.id}`
                : o.tipo === 'recibida' ? `/api/fiscal/recibida/${o.id}`
                    : o.tipo === 'resumen' ? `/api/fiscal/resumen?${q}` : `/api/fiscal/libros?${q}`
            return { ruta: a.ruta, url }
        })
        return NextResponse.json({
            raiz: carpetaRaiz(nombre, libros.periodo),
            periodo: libros.periodo,
            huella: huellaLibros(libros),
            archivos,
            emitidas: libros.emitidas.length,
            recibidas: libros.recibidas.length,
            sinDocumento: libros.totales.recibidas.sinDocumento,
            anomalias: libros.anomalias.length,
        }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (e) {
        return errorJson(e)
    }
}

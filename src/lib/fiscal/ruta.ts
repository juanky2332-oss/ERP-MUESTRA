import 'server-only'
import { NextResponse } from 'next/server'
import { getContexto, assertPermiso, mensajeError } from '@/lib/auth'

/** Fecha y hora de generación en hora de España (para los documentos del paquete). */
export function generadoAhora() {
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date())
}

/** Contexto con permiso fiscal para las rutas /api/fiscal/*. */
export async function ctxFiscal() {
    const ctx = await getContexto()
    assertPermiso(ctx, 'fiscal')
    return ctx
}

export function errorJson(e: unknown) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
}

export function descarga(buf: Buffer, tipo: string, nombre: string) {
    const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
    return new NextResponse(new Uint8Array(buf), {
        headers: {
            'Content-Type': tipo,
            'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
            'Cache-Control': 'no-store',
        },
    })
}

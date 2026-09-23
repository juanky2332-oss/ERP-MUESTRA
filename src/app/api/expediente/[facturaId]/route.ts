import { NextRequest, NextResponse } from 'next/server'
import { getContexto, mensajeError } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { dossierFactura } from '@/lib/firmados/servidor'

export const maxDuration = 60

/**
 * Expediente de una factura en un solo PDF: índice + factura + albaranes +
 * albaranes/partes firmados. ?descargar=1 lo baja como archivo.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ facturaId: string }> }) {
    try {
        const ctx = await getContexto()
        const { facturaId } = await params
        const { pdf, nombre } = await dossierFactura(ctx, facturaId)
        await auditar(ctx, 'expediente_generado', { tipo: 'factura', id: facturaId, ref: nombre })
        const disposicion = req.nextUrl.searchParams.get('descargar') ? 'attachment' : 'inline'
        return new NextResponse(new Uint8Array(pdf), {
            headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposicion}; filename="${nombre}"`, 'Cache-Control': 'no-store' },
        })
    } catch (e) {
        return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
    }
}

import { NextRequest, NextResponse } from 'next/server'
import { getContexto, mensajeError } from '@/lib/auth'
import { pdfDeDocumento, nombreArchivo, TABLA, type TipoDocumento } from '@/lib/documentos/servidor'

/** PDF de un presupuesto, albarán o factura generado en el servidor (mismo diseño que la web). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ tipo: string; id: string }> }) {
    try {
        const ctx = await getContexto()
        const { tipo, id } = await params
        if (!(tipo in TABLA)) return NextResponse.json({ error: 'Tipo no válido' }, { status: 400 })
        const { data: doc } = await ctx.supabase.from(TABLA[tipo as TipoDocumento]).select('*').eq('id', id).maybeSingle()
        if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
        const pdf = await pdfDeDocumento(doc, tipo as TipoDocumento, ctx)
        const disp = req.nextUrl.searchParams.get('descargar') ? 'attachment' : 'inline'
        return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${disp}; filename="${nombreArchivo(doc, tipo as TipoDocumento)}"`, 'Cache-Control': 'no-store' } })
    } catch (e) {
        return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
    }
}

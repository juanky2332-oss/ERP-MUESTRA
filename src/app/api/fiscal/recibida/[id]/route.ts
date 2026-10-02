import { NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { ctxFiscal, descarga, errorJson } from '@/lib/fiscal/ruta'
import { descargarArchivo } from '@/lib/archivos-servidor'

export const maxDuration = 60

const esPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-'
const esJpg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8
const esPng = (b: Buffer) => b.subarray(1, 4).toString('latin1') === 'PNG'

/**
 * Factura recibida (gasto) siempre en PDF: si se subió como foto JPG/PNG se
 * mete entera en una página A4. Otros formatos se devuelven tal cual con su
 * extensión en la cabecera X-Extension.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await ctxFiscal()
        const { id } = await params
        const { data: g } = await ctx.supabase.from('gastos').select('id, numero, archivo_url, factura_url, url_archivo').eq('id', id).maybeSingle()
        const ref = g?.archivo_url || g?.factura_url || g?.url_archivo
        if (!ref) throw new Error('Este gasto no tiene documento adjunto.')
        const { buffer, nombre } = await descargarArchivo(ctx, ref)
        if (esPdf(buffer)) return descarga(buffer, 'application/pdf', 'factura.pdf')
        if (esJpg(buffer) || esPng(buffer)) {
            const pdf = await PDFDocument.create()
            const img = esJpg(buffer) ? await pdf.embedJpg(buffer) : await pdf.embedPng(buffer)
            const [W, H] = img.width > img.height ? [841.89, 595.28] : [595.28, 841.89]
            const margen = 18
            const esc = Math.min((W - margen * 2) / img.width, (H - margen * 2) / img.height)
            const pagina = pdf.addPage([W, H])
            pagina.drawImage(img, { x: (W - img.width * esc) / 2, y: (H - img.height * esc) / 2, width: img.width * esc, height: img.height * esc })
            pdf.setTitle(`Factura recibida ${g?.numero || ''}`.trim())
            return descarga(Buffer.from(await pdf.save()), 'application/pdf', 'factura.pdf')
        }
        const ext = (nombre.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
        const res = descarga(buffer, 'application/octet-stream', nombre)
        res.headers.set('X-Extension', ext)
        return res
    } catch (e) {
        return errorJson(e)
    }
}

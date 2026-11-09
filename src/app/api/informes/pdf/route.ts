import { NextRequest } from 'next/server'
import { getContexto, assertPermiso } from '@/lib/auth'
import { descarga, errorJson, generadoAhora } from '@/lib/fiscal/ruta'
import { marcaServidor } from '@/lib/documentos/servidor'
import { informeEmpresa } from '@/lib/informes/servidor'
import { pdfInforme } from '@/lib/informes/pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** PDF del informe de gestión con los mismos filtros que la pantalla de Informes. */
export async function GET(req: NextRequest) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'economico')
        const q = req.nextUrl.searchParams
        const g = (k: string) => q.get(k) || undefined
        const cliente = g('cliente') || null
        const [{ hoy, actual, anterior }, marca, nombreCliente] = await Promise.all([
            informeEmpresa(ctx, { preset: g('preset'), mes: g('mes'), desde: g('desde'), hasta: g('hasta'), cliente }),
            marcaServidor(ctx),
            cliente ? ctx.supabase.from('contactos').select('razon_social').eq('id', cliente).maybeSingle().then((r: any) => (r.data?.razon_social as string) || null) : Promise.resolve(null),
        ])
        const pdf = pdfInforme(actual, anterior, marca, { generado: generadoAhora(), hoy, cliente: nombreCliente })
        const limpio = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')
        const nombre = `Informe_${limpio(actual.periodo.etiqueta)}${nombreCliente ? `_${limpio(nombreCliente).slice(0, 30)}` : ''}.pdf`
        return descarga(pdf, 'application/pdf', nombre)
    } catch (e) {
        return errorJson(e)
    }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const BUCKETS = new Set(['documentos', 'firmados', 'gastos', 'albaranes-firmados', 'justificantes', 'partes-trabajo'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Acceso a archivos privados: /api/archivos/<bucket>/<ruta>
 *
 * Los buckets ya no son públicos. Esta ruta comprueba la sesión y que el
 * archivo pertenezca a la empresa del usuario, y redirige a una URL firmada
 * que caduca en 5 minutos. Así nunca hay enlaces públicos permanentes.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ ruta: string[] }> }) {
    const { ruta } = await params
    const [bucket, ...resto] = (ruta || []).map(decodeURIComponent)
    const path = resto.join('/')
    if (!bucket || !BUCKETS.has(bucket) || !path || path.includes('..')) {
        return NextResponse.json({ error: 'Ruta no válida' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await supabase.from('perfiles').select('empresa_id').eq('user_id', user.id).maybeSingle()
    if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const carpeta = path.split('/')[0]
    if (UUID_RE.test(carpeta)) {
        if (carpeta !== perfil.empresa_id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    } else {
        // Archivos subidos antes de la separación por empresa: pertenecen a la empresa inicial.
        const admin = createAdminClient()
        const { data: inicial } = await admin.from('empresas').select('id').order('created_at').limit(1).maybeSingle()
        if (inicial?.id !== perfil.empresa_id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrl(path, 300)
    if (error || !data?.signedUrl) return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })

    return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } })
}

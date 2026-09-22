import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const revalidate = 60

/**
 * Datos públicos de marca para la pantalla de acceso (antes de iniciar
 * sesión): nombre, logo de la app, color y mensaje de bienvenida de la
 * empresa principal. No expone nada más.
 */
export async function GET() {
    const { data } = await createAdminClient()
        .from('empresas')
        .select('nombre, nombre_comercial, logo_app_url, color_principal, mensaje_bienvenida')
        .order('created_at')
        .limit(1)
        .maybeSingle()
    return NextResponse.json({
        nombre: data?.nombre_comercial || data?.nombre || 'ERP',
        logo: data?.logo_app_url || null,
        color: data?.color_principal || null,
        bienvenida: data?.mensaje_bienvenida || null,
    }, { headers: { 'Cache-Control': 'public, max-age=60' } })
}

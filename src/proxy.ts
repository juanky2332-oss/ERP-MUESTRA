import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // El webhook de Telegram se autentica con su propio secret_token (ver
    // route.ts), nunca con la cookie de sesión de Supabase: si pasara por
    // aquí, este middleware lo redirigiría a /login y Telegram nunca
    // recibiría la respuesta 200 que espera.
    // /api/cron se autentica con CRON_SECRET, y el manifest de la PWA debe
    // servirse sin sesión (si no, el navegador recibe el HTML del login).
    '/((?!_next/static|_next/image|favicon.ico|api/telegram|api/cron|api/marca|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}

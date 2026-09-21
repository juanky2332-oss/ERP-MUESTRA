import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { safeNext } from '@/lib/safe-redirect'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const next = safeNext(searchParams.get('next'))

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component - middleware will refresh
          }
        },
      },
    }
  )

  const code = searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL(next, request.url))
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth', request.url))
  }

  return NextResponse.redirect(new URL(next, request.url))
}

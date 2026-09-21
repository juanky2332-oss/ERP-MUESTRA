'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { safeNext } from '@/lib/safe-redirect'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : signInError.message)
        setLoading(false)
        return
      }
      router.push(next)
      router.refresh()
    } catch {
      setError('Error inesperado. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="glass rounded-3xl border border-white/50 shadow-2xl shadow-slate-200/20 p-8 md:p-10">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg mb-4">
              <span className="text-xl font-black">X</span>
            </div>
            <div className="h-6 w-1 bg-primary rounded-full mb-3" />
            <span className="text-[10px] font-extrabold text-primary uppercase tracking-[0.3em]">
              ACCESO
            </span>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 mt-2">
              Empresa <span className="text-primary">X</span>
            </h1>
            <p className="text-slate-500 font-medium text-sm mt-1">
              Inicia sesión para continuar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive font-medium">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={cn(
                  "h-12 rounded-xl border-slate-200 bg-slate-50/50",
                  "focus:ring-primary/20 focus:border-primary"
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={cn(
                  "h-12 rounded-xl border-slate-200 bg-slate-50/50",
                  "focus:ring-primary/20 focus:border-primary"
                )}
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl font-bold text-base mt-2"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <p className="text-center text-[11px] text-slate-400 font-medium mt-6">
            Los usuarios se gestionan desde Supabase. No hay registro desde la app.
          </p>
        </div>
      </div>
    </div>
  )
}

import { getContexto } from '@/lib/auth'
import { moduloActivo } from '@/lib/modulos'
import { EmptyState } from '@/components/ui/empty-state'
import { Calculator } from 'lucide-react'

export const dynamic = 'force-dynamic'

/** La calculadora de mecanizado es un módulo opcional: solo si la empresa lo tiene activo. */
export default async function CalculadoraLayout({ children }: { children: React.ReactNode }) {
    const ctx = await getContexto()
    const { data: e } = await ctx.supabase.from('empresas').select('modulos').eq('id', ctx.empresaId).maybeSingle()
    if (!moduloActivo(e?.modulos, 'calculadora_mecanizado')) {
        return <EmptyState icon={Calculator} title="Módulo no activado" description="La calculadora de mecanizado es un módulo opcional. Actívalo en Ajustes → Módulos si tu empresa lo necesita." actionLabel="Ir a Ajustes" actionHref="/ajustes" />
    }
    return children
}

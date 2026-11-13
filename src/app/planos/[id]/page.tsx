'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Editor } from '@/components/plano-ia/editor'
import { getPlanoIA } from '@/actions/plano-ia'

export default function PlanoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [r, setR] = useState<Awaited<ReturnType<typeof getPlanoIA>> | null>(null)
    useEffect(() => { getPlanoIA(id).then(setR) }, [id])

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <Link href="/planos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Planos</Link>
            {!r ? <div className="h-96 animate-pulse rounded-2xl bg-muted" />
                : !r.success ? <p className="rounded-2xl border p-6 text-muted-foreground">{r.error}</p>
                    : <Editor inicial={r.plano} ajustes={r.ajustes} mercado={r.mercado} mercadoActualizado={r.mercadoActualizado} soloLectura={!r.puedeEditar} />}
        </div>
    )
}

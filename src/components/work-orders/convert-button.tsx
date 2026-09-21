'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowRightCircle, CheckCircle2, Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { convertWorkOrderToDeliveryNote } from '@/actions/work-orders'

export function ConvertToDeliveryNote({
    workOrderId,
    status,
    relatedDeliveryNoteId,
    missingInformation,
}: {
    workOrderId: string
    status: string
    relatedDeliveryNoteId: string | null
    missingInformation: string | null
}) {
    const [pending, startTransition] = useTransition()
    const [converted, setConverted] = useState(relatedDeliveryNoteId)

    if (converted) {
        return (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-bold">Convertido a albarán</span>
                </div>
                <Link href={`/albaranes`} className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 hover:underline">
                    Ver albaranes <ExternalLink className="h-3 w-3" />
                </Link>
            </div>
        )
    }

    const blocked = status === 'pendiente_informacion' && !!missingInformation

    return (
        <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
                <p className="text-sm font-bold text-foreground">Preparar albarán</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {blocked ? 'Completa la información pendiente antes de convertir.' : 'Genera el albarán a partir de este parte. No duplica documentos.'}
                </p>
            </div>
            <Button
                disabled={pending || blocked}
                onClick={() => {
                    startTransition(async () => {
                        const res = await convertWorkOrderToDeliveryNote(workOrderId)
                        if (res.success) {
                            setConverted(res.albaranId!)
                            toast.success(res.alreadyConverted ? 'Este parte ya estaba convertido' : 'Albarán creado correctamente')
                        } else {
                            toast.error(res.error || 'No se pudo convertir')
                        }
                    })
                }}
                className="gap-2 font-bold"
            >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightCircle className="h-4 w-4" />}
                Convertir en albarán
            </Button>
        </div>
    )
}

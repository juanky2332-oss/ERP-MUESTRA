'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { FileSignature, FileStack } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SubirFirmadoDialog } from '@/components/firmados/subir-firmado-dialog'

/** Estado de firma de un albarán/factura en los listados + subir su firmado + expediente. */
export function FirmaEstado({ tipo, doc }: { tipo: 'albaran' | 'factura'; doc: any }) {
    const firmado = tipo === 'albaran' ? !!doc.firmado_at : !!doc.soportes_firmados
    if (!firmado) return null
    return (
        <Link href={`/albaranes-firmados?q=${encodeURIComponent(doc.numero)}`} title={tipo === 'albaran' ? `Firmado${doc.firmado_por ? ' por ' + doc.firmado_por : ''} el ${new Date(doc.firmado_at).toLocaleDateString('es-ES')}` : doc.soportes_firmados}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold">
            <FileSignature className="h-3 w-3" /> FIRMADO
        </Link>
    )
}

export function FirmaAcciones({ tipo, doc, onCambio }: { tipo: 'albaran' | 'factura'; doc: any; onCambio?: () => void }) {
    const input = useRef<HTMLInputElement>(null)
    const [archivos, setArchivos] = useState<File[] | null>(null)
    return (
        <>
            <input ref={input} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={e => { const l = Array.from(e.target.files || []); if (l.length) setArchivos(l); e.target.value = '' }} />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-emerald-600" title={tipo === 'albaran' ? 'Subir el albarán o parte firmado' : 'Subir albarán o parte firmado para esta factura'} onClick={() => input.current?.click()}>
                <FileSignature className="h-4 w-4" />
            </Button>
            {tipo === 'factura' && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary" title="Expediente PDF: factura + albaranes + firmados" asChild>
                    <a href={`/api/expediente/${doc.id}`} target="_blank" rel="noreferrer"><FileStack className="h-4 w-4" /></a>
                </Button>
            )}
            {archivos && (
                <SubirFirmadoDialog archivos={archivos} onCerrar={() => setArchivos(null)} onGuardado={() => onCambio?.()}
                    destinoInicial={{ tipo, id: doc.id, numero: doc.numero, cliente: doc.cliente_razon_social, fecha: doc.fecha, total: Number(doc.total || 0), motivo: 'elegido por ti', puntos: 999 }} />
            )}
        </>
    )
}

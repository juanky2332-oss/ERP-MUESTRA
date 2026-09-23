'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const PRESETS = [
    { v: 'este_mes', l: 'Este mes' },
    { v: 'mes_anterior', l: 'Mes anterior' },
    { v: 'trimestre', l: 'Este trimestre' },
    { v: 'trimestre_anterior', l: 'Trimestre anterior' },
    { v: 'este_ano', l: 'Este año' },
    { v: 'ano_anterior', l: 'Año anterior' },
    { v: 'ultimos_12', l: 'Últimos 12 meses' },
]
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function FiltrosInformes({ clientes, hoy }: { clientes: { id: string; nombre: string }[]; hoy: string }) {
    const router = useRouter()
    const pathname = usePathname()
    const sp = useSearchParams()
    const preset = sp.get('preset') || 'ultimos_12'
    const [desde, setDesde] = useState(sp.get('desde') || '')
    const [hasta, setHasta] = useState(sp.get('hasta') || '')

    const ir = (cambios: Record<string, string | null>) => {
        const q = new URLSearchParams(sp.toString())
        for (const [k, v] of Object.entries(cambios)) v ? q.set(k, v) : q.delete(k)
        router.push(`${pathname}?${q.toString()}`)
    }

    // Últimos 36 meses para elegir uno concreto
    const [y, m] = hoy.split('-').map(Number)
    const meses = Array.from({ length: 36 }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return { v: d.toISOString().slice(0, 7), l: `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}` } })

    return (
        <div className="rounded-2xl border bg-card p-3 space-y-3 print:hidden">
            <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                    <button key={p.v} onClick={() => ir({ preset: p.v, mes: null, desde: null, hasta: null })}
                        className={cn('rounded-full px-3 py-1.5 text-xs font-bold', preset === p.v ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>{p.l}</button>
                ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
                <select value={preset === 'mes' ? sp.get('mes') || '' : ''} onChange={e => e.target.value && ir({ preset: 'mes', mes: e.target.value, desde: null, hasta: null })}
                    className={cn('h-9 rounded-md border bg-background px-2 text-sm', preset === 'mes' && 'ring-2 ring-primary')}>
                    <option value="">Ver un mes concreto…</option>
                    {meses.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
                </select>
                <div className={cn('flex flex-wrap items-center gap-1.5 rounded-md', preset === 'personalizado' && 'ring-2 ring-primary')}>
                    <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="w-[9.5rem]" aria-label="Desde" />
                    <span className="text-xs text-muted-foreground">a</span>
                    <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="w-[9.5rem]" aria-label="Hasta" />
                    <Button size="sm" variant="outline" disabled={!desde || !hasta} onClick={() => ir({ preset: 'personalizado', desde, hasta, mes: null })}>Aplicar</Button>
                </div>
                <select value={sp.get('cliente') || ''} onChange={e => ir({ cliente: e.target.value || null })} className="h-9 rounded-md border bg-background px-2 text-sm max-w-[240px]">
                    <option value="">Todos los clientes</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Imprimir / PDF</Button>
            </div>
        </div>
    )
}

/** Descarga una tabla como CSV (se abre bien en Excel: separador ; y BOM UTF-8). */
export function ExportarCSV({ nombre, columnas, filas }: { nombre: string; columnas: string[]; filas: (string | number | null)[][] }) {
    const bajar = () => {
        const esc = (v: any) => {
            if (v == null) return ''
            const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
            return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        }
        const csv = '﻿' + [columnas, ...filas].map(f => f.map(esc).join(';')).join('\r\n')
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
        const a = document.createElement('a'); a.href = url; a.download = `${nombre}.csv`; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    return <Button size="sm" variant="ghost" onClick={bajar} className="print:hidden h-7 px-2 text-xs"><Download className="h-3.5 w-3.5 mr-1" /> Excel</Button>
}

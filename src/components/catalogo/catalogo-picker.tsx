'use client'

import { useEffect, useState } from 'react'
import { Package, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'

export interface ItemCatalogo {
    id: string
    nombre: string
    referencia: string | null
    descripcion: string | null
    tipo: string
    unidad: string | null
    precio_venta: number
    precio_coste: number
    iva_porcentaje: number
}

/** Botón "Añadir desde catálogo": busca productos/servicios y devuelve el elegido. */
export function CatalogoPicker({ onSelect, label = 'Desde catálogo' }: { onSelect: (item: ItemCatalogo) => void; label?: string }) {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState('')
    const [items, setItems] = useState<ItemCatalogo[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open) return
        const t = setTimeout(async () => {
            setLoading(true)
            let query = supabase.from('catalogo').select('id, nombre, referencia, descripcion, tipo, unidad, precio_venta, precio_coste, iva_porcentaje').eq('activo', true).order('nombre').limit(30)
            if (q.trim()) query = query.or(`nombre.ilike.%${q.trim()}%,referencia.ilike.%${q.trim()}%,descripcion.ilike.%${q.trim()}%,categoria.ilike.%${q.trim()}%`)
            const { data } = await query
            setItems((data as ItemCatalogo[]) || [])
            setLoading(false)
        }, 200)
        return () => clearTimeout(t)
    }, [q, open])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1.5">
                    <Package className="h-4 w-4" /> {label}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-0" align="start">
                <div className="p-2 border-b relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input autoFocus placeholder="Buscar producto, servicio o referencia…" value={q} onChange={e => setQ(e.target.value)} className="pl-8" />
                </div>
                <div className="max-h-72 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : items.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                            Sin resultados. <a href="/catalogo" className="text-primary font-semibold underline">Añadir al catálogo</a>
                        </div>
                    ) : items.map(it => (
                        <button
                            key={it.id}
                            type="button"
                            className="w-full text-left px-3 py-2.5 hover:bg-muted border-b border-border last:border-0 transition-colors"
                            onClick={() => { onSelect(it); setOpen(false); setQ('') }}
                        >
                            <div className="flex justify-between gap-3">
                                <span className="text-sm font-semibold text-foreground truncate">{it.nombre}</span>
                                <span className="text-sm font-bold tabular-nums">{formatCurrency(Number(it.precio_venta))}</span>
                            </div>
                            <div className="text-xs text-muted-foreground flex gap-2">
                                {it.referencia && <span className="font-mono">{it.referencia}</span>}
                                <span className="capitalize">{it.tipo}</span>
                                <span>IVA {Number(it.iva_porcentaje)}%</span>
                                {it.unidad && <span>/ {it.unidad}</span>}
                            </div>
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    )
}

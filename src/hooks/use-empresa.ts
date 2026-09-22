'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Datos de la empresa del usuario (marca, colores, textos). */
export function useEmpresa() {
    return useQuery({
        queryKey: ['empresa-actual'],
        queryFn: async () => {
            const { data: id } = await supabase.rpc('mi_empresa_id')
            if (!id) return null
            const { data } = await supabase.from('empresas').select('*').eq('id', id).maybeSingle()
            return data
        },
        staleTime: 60_000,
    })
}

/** Aclara un color muy oscuro para que se vea sobre fondo oscuro (tema oscuro, menú lateral). */
function legibleEnOscuro(hex: string): string {
    const n = parseInt(hex.slice(1), 16)
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    if (lum >= 0.45) return hex
    const f = lum < 0.15 ? 0.6 : 0.4
    r = Math.round(r + (255 - r) * f); g = Math.round(g + (255 - g) * f); b = Math.round(b + (255 - b) * f)
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

/** Aplica el color principal de la empresa a toda la interfaz. */
export function useColorEmpresa(color?: string | null, oscuro = false) {
    useEffect(() => {
        const root = document.documentElement
        if (color && /^#[0-9a-f]{6}$/i.test(color)) {
            root.style.setProperty('--primary', oscuro ? legibleEnOscuro(color) : color)
            root.style.setProperty('--ring', oscuro ? legibleEnOscuro(color) : color)
            // El menú lateral es siempre oscuro: ahí el color debe verse siempre.
            root.style.setProperty('--sidebar-primary', legibleEnOscuro(color))
        } else {
            root.style.removeProperty('--primary')
            root.style.removeProperty('--ring')
            root.style.removeProperty('--sidebar-primary')
        }
    }, [color, oscuro])
}

'use client'

import { useQuery } from '@tanstack/react-query'
import { siguienteNumeroDocumento } from '@/actions/documents'

/**
 * Número orientativo del próximo documento (PREP-01-2026, ALB-..., FAC-...).
 * El número definitivo lo asigna el servidor al guardar.
 */
export function useNextDocumentNumber(type: 'presupuesto' | 'albaran' | 'factura') {
    return useQuery({
        queryKey: ['next-number', type],
        queryFn: async () => (await siguienteNumeroDocumento(type)) || 'PENDIENTE',
        refetchOnWindowFocus: false,
    })
}

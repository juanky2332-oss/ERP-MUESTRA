'use client'

import { DocumentForm } from '@/components/documents/document-form'
import { useBudgets } from '@/hooks/use-budgets'
import { useNextDocumentNumber } from '@/hooks/use-next-number'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function NewBudgetPage() {
    const { createBudget } = useBudgets()
    const router = useRouter()
    const { data: nextNumber } = useNextDocumentNumber('presupuesto')
    const [initialData, setInitialData] = useState<any>(null)

    const handleSubmit = async (data: any, client: any) => {
        // Mapping form data to Supabase Schema
        await createBudget.mutateAsync({
            ...data,
            numero: nextNumber, // User sees this number in PDF, so we try to respect it or let server generate (for now client-driven to match PDF)
            cliente_razon_social: client?.razon_social || 'Cliente Sin Registrar',
            cliente_cif: client?.cif || '',
            cliente_direccion: client?.direccion || '',
            cliente_codigo_postal: client?.codigo_postal || '',
            cliente_ciudad: client?.ciudad || '',
            cliente_provincia: client?.provincia || '',
            cliente_telefono: client?.telefono || '',
            cliente_email: client?.email || '',
            estado: 'borrador',
            // Lineas is already in the correct format? Yes JSONB matches array of objects.
            pdf_url: '',
            enviado: false
        })
        router.push('/presupuestos')
    }

    const handleGeneratePdf = async (data: any, mode: 'preview' | 'download' = 'download') => {
        const { generatePDF } = await import('@/lib/pdf-generator')
        // Inject current fetched number if not present
        return await generatePDF({ ...data, numero: nextNumber }, 'presupuesto', mode)
    }

    // Function removed

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Nuevo Presupuesto</h1>
                <p className="text-gray-500">Crea un nuevo presupuesto para un cliente.</p>
            </div>
            {/* AI Button removed */}

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <DocumentForm
                    key={initialData ? 'imported' : 'fresh'}
                    type="presupuesto"
                    initialData={initialData}
                    onSubmit={handleSubmit}
                    onGeneratePdf={handleGeneratePdf}
                />
            </div>
        </div>
    )
}

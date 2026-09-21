'use client'

import { useState } from 'react'
import { DocumentForm } from '@/components/documents/document-form'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useNextDocumentNumber } from '@/hooks/use-next-number'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'


import { createDocument } from '@/actions/documents'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NewAlbaranPage() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { data: nextNumber } = useNextDocumentNumber('albaran')
    const [initialData, setInitialData] = useState<any>(null)

    const createAlbaranMutation = useMutation({
        mutationFn: async (payload: any) => {
            const res = await createDocument(payload, 'albaran')
            if (!res.success) throw res.error
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['albaranes'] })
            queryClient.invalidateQueries({ queryKey: ['presupuestos'] }) // Refrescar presupuestos por el cambio de estado
            toast.success('Albarán creado correctamente y presupuesto marcado como gestionado')
            router.push('/albaranes')
        },
        onError: (err: any) => toast.error('Error al crear albarán: ' + err.message)
    })

    const handleSubmit = async (data: any, client: any) => {
        await createAlbaranMutation.mutateAsync({
            ...data,
            numero: nextNumber,
            cliente_razon_social: client?.razon_social || data.cliente_razon_social || 'Cliente Varias',
            cliente_cif: client?.cif || data.cliente_cif || '',
            cliente_direccion: client?.direccion || data.cliente_direccion || '',
            cliente_codigo_postal: client?.codigo_postal || data.cliente_codigo_postal || '',
            cliente_ciudad: client?.ciudad || data.cliente_ciudad || '',
            cliente_provincia: client?.provincia || data.cliente_provincia || '',
            cliente_telefono: client?.telefono || data.cliente_telefono || '',
            estado: 'pendiente'
        })
    }

    const handleGeneratePdf = async (data: any, mode: 'preview' | 'download' = 'download') => {
        const { generatePDF } = await import('@/lib/pdf-generator')
        return await generatePDF({ ...data, numero: nextNumber }, 'albaran', mode)
    }

    const handleImport = (doc: any) => {
        // Map fields from Presupuesto to Albaran
        setInitialData({
            cliente_id: doc.cliente_id,
            cliente_razon_social: doc.cliente_razon_social,
            cliente_cif: doc.cliente_cif,
            cliente_direccion: doc.cliente_direccion,
            cliente_codigo_postal: doc.cliente_codigo_postal || '',
            cliente_ciudad: doc.cliente_ciudad || '',
            cliente_provincia: doc.cliente_provincia || '',
            cliente_telefono: doc.cliente_telefono,
            pedido_referencia: doc.pedido_referencia,
            lineas: doc.lineas,
            observaciones: doc.observaciones,
            iva_porcentaje: doc.iva_porcentaje,
            source_document_id: doc.id,
            source_document_type: 'presupuesto',
            presupuesto_origen_numero: doc.numero
        })
        toast.promise(Promise.resolve(), { loading: 'Importando datos...', success: 'Datos cargados del Presupuesto', duration: 1000 })
    }

    // Function removed

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Nuevo Albarán</h1>
                    <p className="text-gray-500">Crea un albarán de entrega.</p>
                </div>
                <div>
                    <div className="flex gap-2">
                        {/* Import button moved to the document form below */}
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                {/* Key forces remount on import to reset form values properly */}
                <DocumentForm
                    key={initialData ? 'imported' : 'fresh'}
                    type="albaran"
                    initialData={initialData}
                    onSubmit={handleSubmit}
                    onGeneratePdf={handleGeneratePdf}
                />
            </div>
        </div>
    )
}

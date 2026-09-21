'use client'

import { useState } from 'react'
import { DocumentForm } from '@/components/documents/document-form'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useNextDocumentNumber } from '@/hooks/use-next-number'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'


import { createDocument } from '@/actions/documents'
import { Suspense } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

function NewFacturaContent() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const searchParams = useSearchParams()
    const importId = searchParams.get('import_id')
    const importType = searchParams.get('import_type')

    const { data: nextNumber } = useNextDocumentNumber('factura')
    const [initialData, setInitialData] = useState<any>(null)

    // Auto-import if query params are present
    useEffect(() => {
        if (importId && importType === 'albaran' && !initialData) {
            const fetchAndImport = async () => {
                const { data, error } = await supabase.from('albaranes').select('*').eq('id', importId).single()
                if (data && !error) {
                    handleImport(data)
                }
            }
            fetchAndImport()
        }
    }, [importId, importType, initialData])

    const createFacturaMutation = useMutation({
        mutationFn: async (payload: any) => {
            const res = await createDocument(payload, 'factura')
            if (!res.success) throw res.error
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['facturas'] })
            queryClient.invalidateQueries({ queryKey: ['albaranes'] }) // Refrescar albaranes por el cambio de estado
            toast.success('Factura creada correctamente y albarán marcado como gestionado')
            router.push('/facturas')
        },
        onError: (err: any) => toast.error('Error al crear factura: ' + err.message)
    })

    const handleSubmit = async (data: any, selectedClient: any) => {
        // Prioritize data from selectedClient or initialData (if imported)
        const finalClient = selectedClient || initialData;

        await createFacturaMutation.mutateAsync({
            ...data,
            numero: nextNumber,
            cliente_id: finalClient?.id || data.cliente_id,
            cliente_razon_social: finalClient?.razon_social || finalClient?.cliente_razon_social || 'Cliente Varias',
            cliente_cif: finalClient?.cif || finalClient?.cliente_cif || '',
            cliente_direccion: finalClient?.direccion || finalClient?.cliente_direccion || '',
            cliente_codigo_postal: finalClient?.codigo_postal || finalClient?.cliente_codigo_postal || '',
            cliente_ciudad: finalClient?.ciudad || finalClient?.cliente_ciudad || '',
            cliente_provincia: finalClient?.provincia || finalClient?.cliente_provincia || '',
            cliente_telefono: finalClient?.telefono || finalClient?.cliente_telefono || '',
            cliente_email: finalClient?.email || finalClient?.cliente_email || '',
            estado: 'emitida',
            pagada: false
        })
    }

    const handleGeneratePdf = async (data: any, mode: 'preview' | 'download' = 'download') => {
        const { generatePDF } = await import('@/lib/pdf-generator')
        return await generatePDF({ ...data, numero: nextNumber }, 'factura', mode)
    }

    const handleImport = (doc: any) => {
        setInitialData({
            cliente_id: doc.cliente_id,
            cliente_razon_social: doc.cliente_razon_social,
            cliente_cif: doc.cliente_cif,
            cliente_direccion: doc.cliente_direccion,
            cliente_codigo_postal: doc.cliente_codigo_postal || '',
            cliente_ciudad: doc.cliente_ciudad || '',
            cliente_provincia: doc.cliente_provincia || '',
            cliente_email: doc.cliente_email,
            cliente_telefono: doc.cliente_telefono,
            pedido_referencia: doc.pedido_referencia,
            lineas: doc.lineas,
            observaciones: doc.observaciones,
            iva_porcentaje: 21,
            source_document_id: doc.id,
            source_document_type: 'albaran',
            albaran_origen_numero: doc.numero
        })
        toast.promise(Promise.resolve(), { loading: 'Importando datos...', success: 'Datos cargados del Albarán', duration: 1000 })
    }


    // Function removed

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Nueva Factura</h1>
                    <p className="text-gray-500">Emite una nueva factura.</p>
                </div>
                <div>
                    <div className="flex gap-2">
                        {/* Import button moved to the document form below */}
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <DocumentForm
                    key={initialData ? 'imported' : 'fresh'}
                    type="factura"
                    initialData={initialData}
                    onSubmit={handleSubmit}
                    onGeneratePdf={handleGeneratePdf}
                />
            </div>
        </div>
    )
}

export default function NewFacturaPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /> Cargando...</div>}>
            <NewFacturaContent />
        </Suspense>
    )
}

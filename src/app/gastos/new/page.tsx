'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { supabase } from '@/lib/supabase'
import { processDocumentWithOCR } from '@/app/actions/ocr'
import { ingestDocument } from '@/actions/ingest-document'
import { toast } from 'sonner'
import { Loader2, Upload, ScanLine, Save, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const gastoSchema = z.object({
    fecha: z.string().min(1, 'La fecha es obligatoria'),
    proveedor: z.string().min(1, 'El proveedor es obligatorio'),
    concepto: z.string().optional(),
    base_imponible: z.coerce.number().min(0),
    iva_porcentaje: z.coerce.number().min(0).max(100),
    iva_importe: z.coerce.number().min(0),
    total: z.coerce.number().min(0),
    archivo_url: z.string().optional(),
    ocr_data: z.any().optional()
})

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024

const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
}

export default function NewGastoPage() {
    const router = useRouter()
    const [isProcessing, setIsProcessing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)

    const form = useForm({
        resolver: zodResolver(gastoSchema),
        defaultValues: {
            fecha: new Date().toISOString().split('T')[0],
            proveedor: '',
            concepto: '',
            base_imponible: 0,
            iva_porcentaje: 21,
            iva_importe: 0,
            total: 0
        }
    })

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selected = e.target.files[0]

            if (!ALLOWED_TYPES.includes(selected.type)) {
                if (selected.type === 'image/heic' || selected.type === 'image/heif') {
                    toast.error('La cámara del móvil ha generado una imagen HEIC/HEIF. Convierte la foto a JPG o PNG.')
                } else {
                    toast.error(`Tipo de archivo no permitido: ${selected.type || 'desconocido'}`)
                }
                e.target.value = ''
                setFile(null)
                setPreviewUrl(null)
                return
            }

            if (selected.size > MAX_FILE_SIZE) {
                toast.error('El archivo supera 10MB')
                e.target.value = ''
                setFile(null)
                setPreviewUrl(null)
                return
            }

            setFile(selected)
            if (previewUrl) URL.revokeObjectURL(previewUrl)
            setPreviewUrl(URL.createObjectURL(selected))
        }
    }

    const handleOCR = async () => {
        if (!file) {
            toast.error('Selecciona un archivo primero')
            return
        }
        setIsProcessing(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('type', 'gasto')

            const result = await processDocumentWithOCR(formData)

            if (result.success && result.data) {
                const d = result.data
                form.setValue('proveedor', d.proveedor || '')
                form.setValue('concepto', d.concepto || '')
                form.setValue('fecha', d.fecha || new Date().toISOString().split('T')[0])
                form.setValue('base_imponible', d.base_imponible || 0)
                form.setValue('iva_porcentaje', d.iva_porcentaje || 21)
                form.setValue('iva_importe', d.iva_importe || 0)
                form.setValue('total', d.total || 0)
                form.setValue('ocr_data', d)
                toast.success('Datos extraídos correctamente')
            } else {
                toast.error('No se pudieron extraer datos: ' + (result.error || 'Respuesta vacía'))
            }
        } catch (e) {
            console.error(e)
            toast.error('Error al procesar el documento')
        } finally {
            setIsProcessing(false)
        }
    }

    const onSubmit = async (values: z.infer<typeof gastoSchema>) => {
        setIsSaving(true)
        try {
            let fileUrl = ''

            if (file) {
                if (!ALLOWED_TYPES.includes(file.type)) {
                    toast.error('Formato no compatible. Usa JPG, PNG, WEBP o PDF.')
                    setIsSaving(false)
                    return
                }

                const fileExt = mimeToExt[file.type]
                const fileName = `gasto_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`

                const { error: uploadError } = await supabase.storage
                    .from('gastos')
                    .upload(fileName, file, {
                        contentType: file.type,
                        upsert: false,
                    })

                if (uploadError) {
                    console.error('Upload error', uploadError)
                    toast.warning('No se pudo subir la imagen al bucket, pero se guardará el registro.')
                } else {
                    const { data: publicURL } = supabase.storage.from('gastos').getPublicUrl(fileName)
                    fileUrl = publicURL.publicUrl
                }
            }

            const { error: dbError } = await supabase.from('gastos').insert({
                fecha: values.fecha,
                proveedor: values.proveedor,
                concepto: values.concepto,
                base_imponible: values.base_imponible,
                iva_porcentaje: values.iva_porcentaje,
                iva_importe: values.iva_importe,
                total: values.total,
                ocr_data: values.ocr_data,
                archivo_url: fileUrl
            })

            if (dbError) throw dbError

            if (fileUrl) {
                const ocrText = values.ocr_data?.raw_text || values.concepto || ''
                ingestDocument(ocrText, fileUrl, {
                    type: 'gasto',
                    filename: file?.name || 'unknown',
                    ...values
                }).catch(err => console.error('Error ingesting document:', err))
            }

            toast.success('Gasto registrado correctamente')
            router.push('/gastos')

        } catch (e: any) {
            console.error(e)
            toast.error('Error al guardar: ' + e.message)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/gastos">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Registrar Nuevo Gasto</h1>
                    <p className="text-gray-500">Sube tu ticket o factura y deja que la IA extraiga los datos.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Documento</CardTitle>
                            <CardDescription>Sube una imagen o PDF (Tickets, Facturas).</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative min-h-[200px]">
                                {previewUrl ? (
                                    <div className="relative w-full h-full min-h-[200px] flex items-center justify-center">
                                        <img src={previewUrl} alt="Preview" className="max-h-[300px] object-contain rounded" />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="destructive"
                                            className="absolute top-2 right-2"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                setFile(null)
                                                setPreviewUrl(null)
                                            }}
                                        >
                                            x
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="h-10 w-10 text-gray-400 mb-2" />
                                        <span className="text-sm text-gray-600">Haz clic o arrastra un archivo</span>
                                    </>
                                )}
                                <Input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,application/pdf"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={handleFileChange}
                                />
                            </div>

                            <Button
                                type="button"
                                className="w-full bg-indigo-600 hover:bg-indigo-700"
                                onClick={handleOCR}
                                disabled={isProcessing || !file}
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Analizando con IA...
                                    </>
                                ) : (
                                    <>
                                        <ScanLine className="mr-2 h-4 w-4" />
                                        Extraer Datos Automáticamente
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Datos del Gasto</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="proveedor"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Proveedor</FormLabel>
                                                <FormControl><Input placeholder="Ej: Amazon, Suministros Pepe..." {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="fecha"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Fecha</FormLabel>
                                                    <FormControl><Input type="date" {...field} value={field.value as any} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="total"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="font-bold">TOTAL (€)</FormLabel>
                                                    <FormControl><Input type="number" step="0.01" className="font-bold" {...field} value={field.value as any} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="concepto"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Concepto / Detalle</FormLabel>
                                                <FormControl><Textarea className="h-20" placeholder="Descripción breve..." {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="grid grid-cols-3 gap-2">
                                        <FormField
                                            control={form.control}
                                            name="base_imponible"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Base</FormLabel>
                                                    <FormControl><Input type="number" step="0.01" {...field} value={field.value as any} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="iva_porcentaje"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>% IVA</FormLabel>
                                                    <FormControl><Input type="number" step="1" {...field} value={field.value as any} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="iva_importe"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Imp. IVA</FormLabel>
                                                    <FormControl><Input type="number" step="0.01" {...field} value={field.value as any} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <Button type="submit" className="w-full bg-[#1E88E5] hover:bg-[#1565C0] mt-4" disabled={isSaving}>
                                        {isSaving ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
                                        ) : (
                                            <><Save className="mr-2 h-4 w-4" /> Guardar Gasto</>
                                        )}
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

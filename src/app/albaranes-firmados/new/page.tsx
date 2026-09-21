'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { processDocumentWithOCR } from '@/app/actions/ocr'
import { ingestDocument } from '@/actions/ingest-document'
import { toast } from 'sonner'
import { Loader2, Upload, ScanLine, Save, ArrowLeft, Check, ChevronsUpDown } from 'lucide-react'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export default function NewAlbaranFirmadoPage() {
    const router = useRouter()
    const [isProcessing, setIsProcessing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [selectedAlbaranId, setSelectedAlbaranId] = useState<string>('')
    const [openCombobox, setOpenCombobox] = useState(false)
    const [ocrData, setOcrData] = useState<any>(null)

    // Fetch Albaranes
    const { data: albaranes, isLoading: isLoadingAlbaranes } = useQuery({
        queryKey: ['albaranes_list'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('albaranes')
                .select('id, numero, cliente_razon_social, fecha, total')
                .order('fecha', { ascending: false })
                .limit(100)
            if (error) throw error
            return data
        }
    })

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selected = e.target.files[0]
            setFile(selected)
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
            formData.append('type', 'albaran_firmado')

            const result = await processDocumentWithOCR(formData)

            if (result.success && result.data) {
                const d = result.data
                setOcrData(d)
                toast.success('Análisis completado')

                // Try to find matching albaran
                if (d.numero_albaran && albaranes) {
                    // Normalize number (remove prefix if present in one but not other)
                    // Simple check: does the string include the number?
                    // Or exact match.
                    // Albaranes in DB often "A-2024-001". OCR might find "001" or "A-2024-001".
                    const matched = albaranes.find(a =>
                        a.numero && (
                            a.numero === d.numero_albaran ||
                            a.numero.includes(d.numero_albaran) ||
                            d.numero_albaran.includes(a.numero)
                        )
                    )

                    if (matched) {
                        setSelectedAlbaranId(matched.id)
                        toast.success(`Albarán vinculado automáticamente: ${matched.numero}`)
                    } else {
                        toast.info(`Número detectado (${d.numero_albaran}) no coincide exactamente con ninguno reciente. Selecciona manualmente.`)
                    }
                }
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

    const handleSave = async () => {
        if (!file || !selectedAlbaranId) {
            toast.error('Debes seleccionar un archivo y vincularlo a un albarán.')
            return
        }

        setIsSaving(true)
        try {
            let fileUrl = ''

            // 1. Upload File
            const fileExt = file.name.split('.').pop()
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
            const bucketName = 'albaranes-firmados' // User needs to ensure this exists

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(fileName, file)

            if (uploadError) {
                // Attempt public URL generation even if upload reports error (sometimes flakiness)
                // But realistically, if upload fails, we are stuck.
                // Fallback to 'gastos' bucket if 'albaranes-firmados' doesn't exist? No, stick to design.
                console.error('Upload error', uploadError)
                toast.warning('Error al subir archivo. Verifica que el bucket "albaranes-firmados" exista en Supabase.')
                // Try to continue logic? No.
                throw new Error("Fallo en subida de archivo")
            } else {
                const { data: publicURL } = supabase.storage.from(bucketName).getPublicUrl(fileName)
                fileUrl = publicURL.publicUrl
            }

            // 2. Insert DB
            const { error: dbError } = await supabase.from('albaranes_firmados').insert({
                albaran_id: selectedAlbaranId,
                archivo_url: fileUrl,
                ocr_data: ocrData,
                fecha_subida: new Date().toISOString(),
                validado: true // Assuming manual upload implies validation or OCR check
            })

            if (dbError) throw dbError

            // --- IA Ingestion ---
            if (fileUrl) {
                const ocrText = ocrData?.raw_text || ocrData?.concepto || '';
                ingestDocument(ocrText, fileUrl, {
                    type: 'albaran_firmado',
                    filename: file?.name || 'unknown',
                    albaran_id: selectedAlbaranId,
                    ...ocrData
                }).catch(err => console.error('Error ingesting document:', err));
            }

            toast.success('Albarán firmado guardado correctamente')
            router.push('/albaranes-firmados')

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
                <Link href="/albaranes-firmados">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Subir Albarán Firmado</h1>
                    <p className="text-gray-500">Digitaliza y vincula albaranes firmados por clientes.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Documento</CardTitle>
                            <CardDescription>Sube la imagen escaneada o foto.</CardDescription>
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
                                                setOcrData(null)
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
                                    accept="image/*,application/pdf"
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
                                        Detectar Albarán (IA)
                                    </>
                                ) : (
                                    <>
                                        <ScanLine className="mr-2 h-4 w-4" />
                                        Analizar Documento
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Vincular Albarán</CardTitle>
                            <CardDescription>Selecciona a qué albarán corresponde este documento.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col space-y-2">
                                <label className="text-sm font-medium">Buscar Albarán</label>
                                <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openCombobox}
                                            className="w-full justify-between"
                                            disabled={isLoadingAlbaranes}
                                        >
                                            {selectedAlbaranId
                                                ? albaranes?.find((a) => a.id === selectedAlbaranId)?.numero + ' - ' + albaranes?.find((a) => a.id === selectedAlbaranId)?.cliente_razon_social
                                                : "Seleccionar albarán..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[350px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Buscar número o cliente..." />
                                            <CommandList>
                                                <CommandEmpty>No encontrado.</CommandEmpty>
                                                <CommandGroup>
                                                    {albaranes?.map((albaran) => (
                                                        <CommandItem
                                                            key={albaran.id}
                                                            value={albaran.numero + ' ' + albaran.cliente_razon_social}
                                                            onSelect={() => {
                                                                setSelectedAlbaranId(albaran.id)
                                                                setOpenCombobox(false)
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    selectedAlbaranId === albaran.id ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            <div className="flex flex-col">
                                                                <span className="font-bold">{albaran.numero}</span>
                                                                <span className="text-xs text-gray-500">{albaran.cliente_razon_social} ({new Date(albaran.fecha).toLocaleDateString()})</span>
                                                            </div>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {ocrData && (
                                <div className="bg-gray-50 p-4 rounded-md text-sm space-y-2 border">
                                    <p className="font-bold text-gray-700">Datos detectados:</p>
                                    <p>Nº: {ocrData.numero_albaran || '?'}</p>
                                    <p>Cliente: {ocrData.cliente || '?'}</p>
                                    <p>Firmado: {ocrData.firmado ? 'Sí' : 'No seguro'}</p>
                                </div>
                            )}

                            <Button
                                onClick={handleSave}
                                className="w-full bg-[#1E88E5] hover:bg-[#1565C0] mt-4"
                                disabled={isSaving || !selectedAlbaranId || !file}
                            >
                                {isSaving ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
                                ) : (
                                    <><Save className="mr-2 h-4 w-4" /> Guardar y Vincular</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

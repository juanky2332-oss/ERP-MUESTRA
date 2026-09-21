'use client'

import { useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { ClientCombobox } from '@/components/contacts/client-combobox'
import { Trash2, Plus, CalendarIcon, Save, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn, formatNumberInput } from '@/lib/utils'
import { Contacto } from '@/types'
import { PriceCalculator } from './price-calculator'
import { ImportDocumentDialog } from './import-dialog'
import { DocumentPreviewModal } from './document-preview-modal'

// Schema
const lineItemSchema = z.object({
    descripcion: z.string().min(1, 'Descripción requerida'),
    cantidad: z.coerce.number().min(0),
    precio_unitario: z.coerce.number().min(0),
    importe: z.number().optional()
})

const documentSchema = z.object({
    cliente_id: z.string().min(1, 'Selecciona un cliente'),
    fecha: z.date(),
    pedido_referencia: z.string().optional(),
    observaciones: z.string().optional(),
    lineas: z.array(lineItemSchema).min(1, 'Al menos una línea es requerida'),
    iva_porcentaje: z.coerce.number().min(0).default(21),
})

type formValues = z.infer<typeof documentSchema>

interface DocumentFormProps {
    type: 'presupuesto' | 'albaran' | 'factura'
    initialData?: Partial<any>
    onSubmit: (data: any, client: any) => Promise<void>
    onGeneratePdf?: (data: any, mode?: 'preview' | 'download') => Promise<void>
}

export function DocumentForm({ type, initialData, onSubmit, onGeneratePdf }: DocumentFormProps) {
    const [client, setClient] = useState<Contacto | null>(null)
    const [sourceDocInfo, setSourceDocInfo] = useState<{ id: string, type: 'presupuesto' | 'albaran', numero?: string } | null>(
        initialData?.source_document_id ? {
            id: initialData.source_document_id,
            type: initialData.source_document_type,
            numero: initialData.albaran_origen_numero || initialData.presupuesto_origen_numero
        } : null
    )

    const form = useForm({
        resolver: zodResolver(documentSchema),
        defaultValues: {
            fecha: new Date(),
            lineas: [{ descripcion: '', cantidad: 1, precio_unitario: 0, importe: 0 }],
            iva_porcentaje: 21,
            ...initialData
        }
    })

    // Sync state if initialData changes or is provided
    useState(() => {
        if (initialData?.cliente_id && initialData.cliente_razon_social) {
            setClient({
                id: initialData.cliente_id,
                razon_social: initialData.cliente_razon_social,
                cif: initialData.cliente_cif,
                direccion: initialData.cliente_direccion,
                telefono: initialData.cliente_telefono,
                email: initialData.cliente_email
            } as Contacto)
        }
        // FIXED: Sync source doc info if initialData changes
        if (initialData?.source_document_id) {
            setSourceDocInfo({
                id: initialData.source_document_id,
                type: initialData.source_document_type,
                numero: initialData.albaran_origen_numero || initialData.presupuesto_origen_numero
            })
        }
    })


    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'lineas'
    })

    // Watch for calculations
    const lines = useWatch({ control: form.control, name: 'lineas' })
    const ivaPct = useWatch({ control: form.control, name: 'iva_porcentaje' })

    // Calculate totals
    const subtotalRaw = lines ? lines.reduce((acc: number, line: any) => acc + (Number(line.cantidad) * Number(line.precio_unitario)), 0) : 0

    const baseImponible = subtotalRaw
    const ivaAmount = baseImponible * ((Number(ivaPct) || 21) / 100)
    const total = baseImponible + ivaAmount

    const handleSubmit = async (data: formValues) => {
        // Inject calculated values
        const payload = {
            ...data,
            subtotal: subtotalRaw,
            base_imponible: baseImponible,
            iva_porcentaje: ivaPct,
            iva_importe: ivaAmount,
            total: total,
            source_document_id: sourceDocInfo?.id,
            source_document_type: sourceDocInfo?.type,
            albaran_origen_numero: sourceDocInfo?.type === 'albaran' ? sourceDocInfo?.numero : undefined,
            presupuesto_origen_numero: sourceDocInfo?.type === 'presupuesto' ? sourceDocInfo?.numero : undefined
        }
        await onSubmit(payload, client)
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">

                {/* Header Actions */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center p-2">
                            <img src="/icon.svg" alt="Logo" className="max-w-full max-h-full object-contain" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">EMPRESA X, S.L.</h1>
                            <p className="text-xs text-gray-500">B00000000</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {(type === 'albaran' || type === 'factura') && (
                            <ImportDocumentDialog
                                sourceTable={type === 'albaran' ? 'presupuestos' : 'albaranes'}
                                clientId={form.getValues('cliente_id')}
                                onSelect={(doc) => {
                                    form.setValue('cliente_id', doc.cliente_id)
                                    if (doc.cliente_razon_social) {
                                        setClient({
                                            id: doc.cliente_id,
                                            razon_social: doc.cliente_razon_social,
                                            cif: doc.cliente_cif,
                                            direccion: doc.cliente_direccion,
                                            codigo_postal: doc.cliente_codigo_postal,
                                            ciudad: doc.cliente_ciudad,
                                            provincia: doc.cliente_provincia,
                                            telefono: doc.cliente_telefono,
                                            email: doc.cliente_email
                                        } as Contacto)
                                    }
                                    if (doc.lineas && Array.isArray(doc.lineas)) {
                                        form.setValue('lineas', doc.lineas.map((l: any) => ({
                                            descripcion: l.descripcion,
                                            cantidad: Number(l.cantidad),
                                            precio_unitario: Number(l.precio_unitario),
                                            importe: Number(l.total || 0)
                                        })))
                                    }
                                    if (doc.pedido_referencia) form.setValue('pedido_referencia', doc.pedido_referencia)
                                    if (doc.iva_porcentaje) form.setValue('iva_porcentaje', doc.iva_porcentaje)
                                    if (doc.observaciones) form.setValue('observaciones', doc.observaciones)

                                    setSourceDocInfo({
                                        id: doc.id,
                                        type: type === 'albaran' ? 'presupuesto' : 'albaran',
                                        numero: doc.numero
                                    })
                                }}
                            />
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start mb-8 pb-8 border-b">
                    <div>
                        <h2 className="text-4xl font-black text-gray-900 opacity-20 uppercase mb-4">
                            {type === 'presupuesto' ? 'PRESUPUESTO' : type === 'albaran' ? 'ALBARÁN' : 'FACTURA'}
                        </h2>
                        <div className="grid grid-cols-2 gap-4 max-w-sm">
                            <div className="bg-gray-50 p-3 rounded border">
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Nº Documento</p>
                                <p className="text-sm font-bold text-[#1E88E5]">{initialData?.numero || 'PENDIENTE'}</p>
                            </div>
                            <FormField
                                control={form.control}
                                name="fecha"
                                render={({ field }: { field: any }) => (
                                    <div className="bg-gray-50 p-3 rounded border">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Fecha</p>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <button type="button" className="text-sm font-bold text-left w-full hover:text-[#1E88E5]">
                                                    {field.value ? format(field.value, 'dd/MM/yyyy') : 'Seleccionar'}
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                )}
                            />
                        </div>
                        <div className="mt-4 max-w-sm">
                            <FormField
                                control={form.control}
                                name="pedido_referencia"
                                render={({ field }: { field: any }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-bold text-gray-500 uppercase">Su Referencia / Proyecto</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ref cliente..." {...field} className="h-9 font-medium" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-dashed border-gray-300">
                        <FormItem>
                            <FormLabel className="text-xs font-bold text-gray-400 uppercase">Datos del Cliente</FormLabel>
                            <ClientCombobox
                                value={form.getValues('cliente_id')}
                                onChange={(val: string, contact?: Contacto) => {
                                    form.setValue('cliente_id', val)
                                    setClient(contact || null)
                                    // Removed logic that fetched address info based on id, it should be passed using onChange from client component
                                }}
                            />
                            {client && (
                                <div className="mt-4 space-y-1">
                                    <p className="text-sm font-bold text-gray-900">{client.razon_social}</p>
                                    <p className="text-xs text-gray-600">{client.cif}</p>
                                    <p className="text-xs text-gray-600">{client.direccion}</p>
                                    <p className="text-xs text-gray-600">{client.codigo_postal} {client.ciudad}</p>
                                    <p className="text-xs text-gray-600">{client.telefono} | {client.email}</p>
                                </div>
                            )}
                        </FormItem>
                    </div>
                </div>

                {/* Lines */}
                <Card className="border-gray-200 shadow-sm">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-gray-50">
                                <TableRow>
                                    <TableHead className="w-[40%]">Descripción</TableHead>
                                    <TableHead className="w-[15%] text-center">Cantidad</TableHead>
                                    <TableHead className="w-[15%] text-right">Precio (€)</TableHead>
                                    <TableHead className="w-[15%] text-right">Importe</TableHead>
                                    <TableHead className="w-[5%]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fields.map((field, index) => (
                                    <TableRow key={field.id}>
                                        <TableCell>
                                            <Input
                                                {...form.register(`lineas.${index}.descripcion`)}
                                                placeholder="Descripción del servicio/producto"
                                                className="border-0 bg-transparent focus-visible:ring-0 px-0 shadow-none"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                {...(() => {
                                                    const { onChange, ...rest } = form.register(`lineas.${index}.cantidad`)
                                                    return {
                                                        ...rest,
                                                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                                            e.target.value = formatNumberInput(e.target.value)
                                                            onChange(e)
                                                        }
                                                    }
                                                })()}
                                                className="text-center border-0 bg-transparent focus-visible:ring-0 px-0 shadow-none"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                {...(() => {
                                                    const { onChange, ...rest } = form.register(`lineas.${index}.precio_unitario`)
                                                    return {
                                                        ...rest,
                                                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                                            e.target.value = formatNumberInput(e.target.value)
                                                            onChange(e)
                                                        }
                                                    }
                                                })()}
                                                className="text-right border-0 bg-transparent focus-visible:ring-0 px-0 shadow-none"
                                            />
                                        </TableCell>
                                        <TableCell className="text-right font-medium align-middle">
                                            {(Number(form.watch(`lineas.${index}.cantidad`) || 0) * Number(form.watch(`lineas.${index}.precio_unitario`) || 0)).toFixed(2)} €
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center">
                                                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                                <PriceCalculator
                                                    onCalculate={(price) => form.setValue(`lineas.${index}.precio_unitario`, price)}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <div className="p-4 border-t border-gray-100">
                            <Button type="button" variant="outline" size="sm" onClick={() => append({ descripcion: '', cantidad: 1, precio_unitario: 0, importe: 0 })}>
                                <Plus className="h-4 w-4 mr-2" /> Añadir Línea
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Totals & Calculations */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                    <div className="w-full md:w-1/3">
                        <FormField
                            control={form.control}
                            name="iva_porcentaje"
                            render={({ field }: { field: any }) => (
                                <FormItem>
                                    <FormLabel>IVA (%)</FormLabel>
                                    <FormControl>
                                        <select
                                            {...field}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            onChange={(e) => field.onChange(Number(e.target.value))}
                                        >
                                            <option value={21}>21% (General)</option>
                                            <option value={10}>10% (Reducido)</option>
                                            <option value={4}>4% (Superreducido)</option>
                                            <option value={0}>0% (Exento)</option>
                                        </select>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="w-full max-w-sm space-y-4 bg-gray-50 p-6 rounded-lg ml-auto">
                        <div className="flex justify-between items-center text-sm text-gray-600">
                            <span>Subtotal</span>
                            <span className="font-medium text-gray-900">{subtotalRaw.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                        </div>

                        <div className="flex justify-between items-center text-sm font-medium pt-2 border-t border-gray-200 text-gray-900">
                            <span>Base Imponible</span>
                            <span>{baseImponible.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                        </div>

                        <div className="flex justify-between items-center text-sm text-gray-600">
                            <span>IVA ({String(ivaPct || 21)}%)</span>
                            <span className="font-medium text-gray-900">{ivaAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                        </div>

                        <div className="flex justify-between items-center text-lg font-bold pt-4 border-t border-gray-200 text-[#1E88E5]">
                            <span>TOTAL</span>
                            <span>{total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1">
                    <FormField
                        control={form.control}
                        name="observaciones"
                        render={({ field }: { field: any }) => (
                            <FormItem>
                                <FormLabel>Observaciones</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Notas adicionales..." {...field} />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-4 pt-4 border-t">
                    {onGeneratePdf && (
                        <>
                            <DocumentPreviewModal
                                title={`Previsualización: ${type === 'presupuesto' ? 'Presupuesto' : type === 'albaran' ? 'Albarán' : 'Factura'}`}
                                onGenerate={async () => {
                                    // Make sure we pass the absolute latest values
                                    const vals = form.getValues()
                                    // Generate the PDF and return its URL
                                    const res = await onGeneratePdf({
                                        ...vals,
                                        cliente: client,
                                        subtotal: subtotalRaw,
                                        iva_importe: ivaAmount,
                                        total: total,
                                        base_imponible: baseImponible,
                                        albaran_origen_numero: sourceDocInfo?.type === 'albaran' ? sourceDocInfo?.numero : undefined,
                                        presupuesto_origen_numero: sourceDocInfo?.type === 'presupuesto' ? sourceDocInfo?.numero : undefined
                                    }, 'preview') as any
                                    return res as string
                                }}
                                trigger={
                                    <Button type="button" variant="secondary">
                                        <FileText className="h-4 w-4 mr-2" /> Previsualizar
                                    </Button>
                                }
                            />
                            <Button type="button" variant="outline" onClick={() => onGeneratePdf({ ...form.getValues(), cliente: client, subtotal: subtotalRaw, iva_importe: ivaAmount, total: total, base_imponible: baseImponible, albaran_origen_numero: sourceDocInfo?.type === 'albaran' ? sourceDocInfo?.numero : undefined, presupuesto_origen_numero: sourceDocInfo?.type === 'presupuesto' ? sourceDocInfo?.numero : undefined }, 'download')}>
                                <FileText className="h-4 w-4 mr-2" /> Generar PDF
                            </Button>
                        </>
                    )}
                    <Button type="submit" disabled={form.formState.isSubmitting} className="bg-[#1E88E5] hover:bg-[#1565C0]">
                        <Save className="h-4 w-4 mr-2" />
                        {type === 'presupuesto' ? 'Guardar Presupuesto' : type === 'albaran' ? 'Guardar Albarán' : 'Guardar Factura'}
                    </Button>
                </div>

            </form >
        </Form >
    )
}

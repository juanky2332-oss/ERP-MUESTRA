'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader2, Search } from 'lucide-react'
import { format } from 'date-fns'

interface ImportDocumentDialogProps {
    sourceTable: 'presupuestos' | 'albaranes'
    onSelect: (doc: any) => void
    clientId?: string
}

export function ImportDocumentDialog({ sourceTable, onSelect, clientId }: ImportDocumentDialogProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')

    const { data: documents, isLoading } = useQuery({
        queryKey: ['available-docs', sourceTable, search, clientId],
        queryFn: async () => {
            let query = supabase.from(sourceTable).select('*').order('created_at', { ascending: false })

            if (clientId) {
                query = query.eq('cliente_id', clientId)
            }

            if (search) {
                query = query.ilike('cliente_razon_social', `%${search}%`)
            }

            const { data, error } = await query
            if (error) throw error
            return data
        },
        enabled: open
    })

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="secondary">Importar de {sourceTable === 'presupuestos' ? 'Presupuesto' : 'Albarán'}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Seleccionar Documento</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                        <Input
                            placeholder="Buscar por cliente..."
                            className="pl-8"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="max-h-[300px] overflow-y-auto border rounded-md">
                        {isLoading ? (
                            <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /></div>
                        ) : documents?.length === 0 ? (
                            <div className="p-4 text-center text-gray-500">No se encontraron documentos.</div>
                        ) : (
                            <div className="divide-y">
                                {documents?.map((doc: any) => (
                                    <div
                                        key={doc.id}
                                        className="p-3 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                        onClick={() => {
                                            onSelect(doc)
                                            setOpen(false)
                                        }}
                                    >
                                        <div>
                                            <div className="font-medium">{doc.numero}</div>
                                            <div className="text-sm text-gray-500 font-bold">{doc.cliente_razon_social}</div>
                                            {doc.pedido_referencia && (
                                                <div className="text-xs text-blue-600 mt-0.5">
                                                    Ref. Pedido: {doc.pedido_referencia}
                                                </div>
                                            )}
                                            <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[250px]">
                                                {doc.lineas?.[0]?.descripcion || doc.observaciones || 'Sin descripción'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold">{doc.total} €</div>
                                            <div className="text-xs text-gray-400">{format(new Date(doc.fecha), 'dd/MM/yyyy')}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

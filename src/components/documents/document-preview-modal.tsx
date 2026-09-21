'use client'

import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Eye, FileText, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { DocumentViewer } from './document-viewer'

interface DocumentPreviewModalProps {
    url?: string
    document?: any
    type?: 'presupuesto' | 'albaran' | 'factura' | 'gasto'
    onGenerate?: () => Promise<string | void>
    title?: string
    trigger?: React.ReactNode
    className?: string
}

export function DocumentPreviewModal({ url: initialUrl, document, type, onGenerate, title, trigger, className }: DocumentPreviewModalProps) {
    const [url, setUrl] = useState<string | undefined>(initialUrl)
    const [loading, setLoading] = useState(false)
    const [open, setOpen] = useState(false)

    const handleOpen = async () => {
        setOpen(true)
        if (!url && onGenerate) {
            setLoading(true)
            try {
                const generatedUrl = await onGenerate()
                if (generatedUrl) setUrl(generatedUrl)
            } catch (error) {
                console.error('Error generating preview:', error)
            } finally {
                setLoading(false)
            }
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild onClick={(e) => { e.preventDefault(); handleOpen(); }}>
                {trigger || (
                    <Button variant="ghost" size="icon" className={cn("h-8 w-8 text-[#1E88E5]", className)}>
                        <Eye className="h-4 w-4" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-white">
                <div className="flex justify-between items-center p-3 border-b bg-gray-50">
                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[#1E88E5]" />
                        {title || 'Visualización de Documento'}
                    </h3>
                    <div className="flex gap-2">
                        {url && (
                            <Button asChild variant="outline" size="sm" className="h-8 gap-1">
                                <a href={url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3 w-3" />
                                    Abrir Original
                                </a>
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setOpen(false)}>
                            Cerrar
                        </Button>
                    </div>
                </div>
                <div className="flex-1 bg-gray-100 overflow-hidden flex items-center justify-center relative">
                    {loading ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E88E5]"></div>
                            <p className="text-sm text-gray-500">Generando vista previa...</p>
                        </div>
                    ) : url ? (
                        <iframe src={url} className="w-full h-full border-0" />
                    ) : document ? (
                        <div className="w-full h-full overflow-auto bg-white">
                            <DocumentViewer document={document} type={type} />
                        </div>
                    ) : (
                        <p className="text-gray-500">No hay documento disponible para previsualizar.</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

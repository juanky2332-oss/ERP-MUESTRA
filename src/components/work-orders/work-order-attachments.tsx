'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, Trash2, Loader2, FileText, Music } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { addWorkOrderAttachment, deleteWorkOrderAttachment } from '@/actions/work-orders'

interface Attachment {
    id: string
    file_url: string
    file_type: string
    caption: string | null
}

export function WorkOrderAttachments({ workOrderId, attachments }: { workOrderId: string; attachments: Attachment[] }) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [pending, startTransition] = useTransition()
    const [viewerUrl, setViewerUrl] = useState<string | null>(null)

    async function handleFiles(files: FileList | null) {
        if (!files || files.length === 0) return
        setUploading(true)
        for (const file of Array.from(files)) {
            const fd = new FormData()
            fd.set('work_order_id', workOrderId)
            fd.set('file', file)
            const res = await addWorkOrderAttachment(fd)
            if (!res.success) toast.error(res.error || `No se pudo subir ${file.name}`)
        }
        setUploading(false)
        if (inputRef.current) inputRef.current.value = ''
    }

    function handleDelete(id: string) {
        startTransition(async () => {
            const res = await deleteWorkOrderAttachment(id, workOrderId)
            if (!res.success) toast.error(res.error || 'No se pudo eliminar')
        })
    }

    return (
        <div className="metric-card bg-card">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                    <Camera className="h-4 w-4 text-primary" /> Fotos y documentos ({attachments.length})
                </h3>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading} onClick={() => inputRef.current?.click()}>
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    Añadir foto
                </Button>
                <input ref={inputRef} type="file" accept="image/*,application/pdf,audio/*" multiple capture="environment" className="hidden" onChange={e => handleFiles(e.target.files)} />
            </div>

            {attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Sin fotos todavía. Añade evidencia de la intervención desde el móvil.</p>
            ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {attachments.map(a => (
                        <div key={a.id} className="relative group aspect-square rounded-xl overflow-hidden bg-muted border border-border">
                            {a.file_type === 'image' ? (
                                <img src={a.file_url} alt={a.caption || ''} className="w-full h-full object-cover cursor-pointer" onClick={() => setViewerUrl(a.file_url)} />
                            ) : (
                                <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center h-full gap-1 text-muted-foreground">
                                    {a.file_type === 'audio' ? <Music className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                                    <span className="text-[9px] font-bold uppercase">{a.file_type}</span>
                                </a>
                            )}
                            <button
                                onClick={() => handleDelete(a.id)}
                                disabled={pending}
                                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {viewerUrl && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6" onClick={() => setViewerUrl(null)}>
                    <img src={viewerUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
                </div>
            )}
        </div>
    )
}

'use client'

import { useState, useTransition } from 'react'
import { Send, Copy, Check, Loader2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { generateTelegramLinkCode, disconnectTelegram } from '@/actions/telegram'

interface Status {
    linked: boolean
    pendingCode: string | null
    pendingExpiresAt: string | null
    telegramUsername: string | null
    linkedAt: string | null
}

const BOT_USERNAME = 'ERP_PRUEBA_bot'

export function TelegramConnectCard({ initialStatus }: { initialStatus: Status }) {
    const [status, setStatus] = useState(initialStatus)
    const [pending, startTransition] = useTransition()
    const [copied, setCopied] = useState(false)

    function generate() {
        startTransition(async () => {
            const res = await generateTelegramLinkCode()
            if (res.success) {
                setStatus(prev => ({ ...prev, pendingCode: res.code!, pendingExpiresAt: res.expiresAt! }))
                toast.success('Código generado, válido 15 minutos')
            } else {
                toast.error(res.error || 'No se pudo generar el código')
            }
        })
    }

    function disconnect() {
        startTransition(async () => {
            const res = await disconnectTelegram()
            if (res.success) {
                setStatus({ linked: false, pendingCode: null, pendingExpiresAt: null, telegramUsername: null, linkedAt: null })
                toast.success('Telegram desconectado')
            } else {
                toast.error(res.error || 'No se pudo desconectar')
            }
        })
    }

    return (
        <div className="metric-card bg-card">
            <div className="flex items-center gap-3 mb-4">
                <div className="h-11 w-11 rounded-xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center">
                    <Send className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                    <h3 className="text-sm font-extrabold text-foreground">Conectar Telegram</h3>
                    <p className="text-xs text-muted-foreground">Consulta el ERP y recibe avisos desde el bot @{BOT_USERNAME}</p>
                </div>
            </div>

            {status.linked ? (
                <div className="space-y-3">
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-4 flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300">
                        <Check className="h-4 w-4" />
                        <span className="text-sm font-bold">Cuenta vinculada {status.telegramUsername ? `(@${status.telegramUsername})` : ''}</span>
                    </div>
                    <Button variant="outline" className="gap-2 text-rose-600 hover:text-rose-700" disabled={pending} onClick={disconnect}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                        Desconectar
                    </Button>
                </div>
            ) : status.pendingCode ? (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Abre Telegram, escribe al bot <a href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noopener noreferrer" className="text-primary font-bold hover:underline">@{BOT_USERNAME}</a> y envía:
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 bg-muted rounded-lg px-4 py-3 text-sm font-mono font-bold text-center tracking-widest">
                            /vincular {status.pendingCode}
                        </code>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                                navigator.clipboard.writeText(`/vincular ${status.pendingCode}`)
                                setCopied(true)
                                setTimeout(() => setCopied(false), 2000)
                            }}
                        >
                            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Este código caduca a los 15 minutos.</p>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={generate}>Generar otro código</Button>
                </div>
            ) : (
                <Button className="gap-2 font-bold" disabled={pending} onClick={generate}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Generar código de vinculación
                </Button>
            )}
        </div>
    )
}

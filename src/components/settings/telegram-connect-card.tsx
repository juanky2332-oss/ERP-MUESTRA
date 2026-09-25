'use client'

import { useState, useTransition } from 'react'
import { Send, Copy, Check, Loader2, Unlink, BellRing } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { generateTelegramLinkCode, disconnectTelegram, setTelegramAviso } from '@/actions/telegram'
import { AVISOS, preferencias, type ClaveAviso, type Preferencias } from '@/lib/telegram/preferencias'

interface Status {
    linked: boolean
    pendingCode: string | null
    pendingExpiresAt: string | null
    telegramUsername: string | null
    linkedAt: string | null
    notificaciones?: Preferencias
}

const BOT_USERNAME = 'ERP_PRUEBA_bot'

export function TelegramConnectCard({ initialStatus }: { initialStatus: Status }) {
    const [status, setStatus] = useState(initialStatus)
    const [pending, startTransition] = useTransition()
    const [copied, setCopied] = useState(false)
    const [avisos, setAvisos] = useState<Preferencias>(preferencias(initialStatus.notificaciones))
    const [guardando, setGuardando] = useState<string | null>(null)

    async function cambiarAviso(clave: keyof Preferencias, activo: boolean) {
        const antes = avisos
        setAvisos({ ...avisos, [clave]: activo })
        setGuardando(clave)
        const res = await setTelegramAviso(clave, activo)
        setGuardando(null)
        if (res.success && res.notificaciones) {
            setAvisos(res.notificaciones)
            if (clave === 'avisos_diarios') toast.success(activo ? 'Avisos diarios activados' : 'Avisos diarios desactivados')
        } else {
            setAvisos(antes)
            toast.error(res.error || 'No se pudo guardar')
        }
    }

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
                    <div className="rounded-xl border p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <BellRing className="h-4 w-4 text-primary" />
                                <div>
                                    <p className="text-sm font-bold">Avisos diarios de pendientes</p>
                                    <p className="text-xs text-muted-foreground">Cada mañana a las 8:00: resumen, facturas vencidas o por vencer, gastos por revisar y presupuestos que caducan.</p>
                                </div>
                            </div>
                            <Switch checked={avisos.avisos_diarios} disabled={guardando !== null} onCheckedChange={v => cambiarAviso('avisos_diarios', v)} aria-label="Avisos diarios de pendientes" />
                        </div>
                        <div className={`grid sm:grid-cols-2 gap-2 pt-3 border-t ${avisos.avisos_diarios ? '' : 'opacity-50'}`}>
                            {(Object.keys(AVISOS) as ClaveAviso[]).map(k => (
                                <label key={k} className="flex items-center justify-between gap-2 text-xs font-semibold rounded-lg bg-muted/50 px-3 py-2">
                                    {AVISOS[k]}
                                    <Switch checked={avisos[k]} disabled={guardando !== null || (!avisos.avisos_diarios && k !== 'cobros')} onCheckedChange={v => cambiarAviso(k, v)} />
                                </label>
                            ))}
                        </div>
                        {!avisos.avisos_diarios && <p className="text-xs text-muted-foreground">Apagado: no recibirás el mensaje de las 8:00. Los avisos al registrar un cobro siguen según su propio interruptor.</p>}
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

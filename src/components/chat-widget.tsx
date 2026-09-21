'use client'

import { useState, useRef, useEffect } from "react"
import { Send, X, Minimize2, Mic, MicOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Message = {
    role: 'user' | 'assistant' | 'system'
    content: string
}

export function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: 'Hola, soy ARIA. ¿En qué puedo ayudarte hoy?' }
    ])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isRecording, setIsRecording] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isOpen])

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node) && isOpen) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [isOpen])

    const handleSubmit = async (e?: React.FormEvent, voiceTranscript?: string) => {
        e?.preventDefault()

        const messageContent = voiceTranscript || input
        if (!messageContent.trim() || isLoading) return

        const userMsg: Message = { role: 'user', content: messageContent }
        setMessages(prev => [...prev, userMsg])
        setInput("")
        setIsLoading(true)

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
                })
            })

            const data = await response.json()
            if (data.content) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
            }
        } catch (err) {
            console.error(err)
            setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error de comunicación con Empresa X. Inténtalo de nuevo.' }])
        } finally {
            setIsLoading(false)
        }
    }

    // Voice Recording Functions
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

            // Detect supported mimeType
            let mimeType = 'audio/webm'
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus'
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4' // iOS specific
            } else if (MediaRecorder.isTypeSupported('audio/acc')) {
                mimeType = 'audio/acc'
            }

            const mediaRecorder = new MediaRecorder(stream, { mimeType })
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorder.onstop = async () => {
                // Blur active element to close keyboard on mobile if open
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur()
                }

                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
                // Pass the actual mimeType used
                await transcribeAudio(audioBlob, mimeType)
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorder.start()
            setIsRecording(true)
            toast.info("🎤 Escuchando...")
        } catch (error) {
            console.error('Error accessing microphone:', error)
            toast.error("❌ No se puede acceder al micrófono. Verifica los permisos.")
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
            setIsTranscribing(true)
        }
    }

    const transcribeAudio = async (audioBlob: Blob, mimeType: string) => {
        try {
            const formData = new FormData()
            // Append with a generic name but correct extension will be handled by mimeType on server ideally,
            // or we send the extension explicitly.
            const extension = mimeType.includes('mp4') ? 'mp4' : 'webm'
            formData.append('audio', audioBlob, `recording.${extension}`)
            formData.append('mimeType', mimeType)

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            })

            const data = await response.json()

            if (data.text) {
                toast.success("✅ Entendido")
                await handleSubmit(undefined, data.text)
            } else {
                toast.error("❌ No he podido entender el audio.")
            }
        } catch (error) {
            console.error('Transcription error:', error)
            toast.error("❌ Error en el servidor de transcripción.")
        } finally {
            setIsTranscribing(false)
        }
    }

    // Structured formatter for "square" responses with icons and spacing
    const formatMessage = (content: string) => {
        return content.split('\n').map((line, lineIdx) => {
            if (!line.trim()) return <div key={lineIdx} className="h-2" />

            return (
                <div key={lineIdx} className="mb-0.5">
                    {line.split(/(\*\*.*?\*\*)/g).map((part, i) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={i} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>
                        }
                        return <span key={i}>{part}</span>
                    })}
                </div>
            )
        })
    }

    const BrandingFooter = () => (
        <div className="w-full text-center pointer-events-auto">
            <p className="text-[10px] text-gray-400 font-medium inline-block shadow-sm">
                powered by <a href="https://www.flownexion.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#1E88E5] transition-colors font-semibold">Flownexion</a>
            </p>
        </div>
    )

    if (!isOpen) {
        return (
            <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end gap-2 pointer-events-none">
                <Button
                    onClick={() => setIsOpen(true)}
                    className="h-14 w-14 md:h-16 md:w-16 rounded-full shadow-2xl bg-white hover:bg-gray-50 border-4 border-[#1E88E5]/20 p-0 relative group transition-all duration-500 hover:scale-110 active:scale-95 pointer-events-auto"
                >
                    <div className="absolute inset-0 rounded-full overflow-hidden p-1.5 bg-gradient-to-br from-[#4338ca] to-[#6366f1] flex items-center justify-center group-hover:rotate-12 transition-transform duration-500">
                        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-label="ARIA">
                            <rect x="4" y="8" width="16" height="12" rx="4" fill="white" />
                            <rect x="10.5" y="2" width="3" height="5" rx="1.5" fill="white" />
                            <circle cx="12" cy="3.2" r="1.6" fill="white" />
                            <circle cx="9" cy="14" r="1.6" fill="#4338ca" />
                            <circle cx="15" cy="14" r="1.6" fill="#4338ca" />
                            <path d="M9 17.5c1 1 5 1 6 0" stroke="#4338ca" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500 border-2 border-white"></span>
                    </span>
                </Button>
                <BrandingFooter />
            </div>
        )
    }

    return (
        <div ref={containerRef} className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end gap-4 max-w-[calc(100vw-2rem)]">
            <Card className="w-[calc(100vw-2rem)] sm:w-[350px] md:w-[450px] h-[80vh] sm:h-[650px] shadow-[0_20px_50px_rgba(30,136,229,0.15)] border-0 ring-1 ring-black/5 flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-500 bg-white/95 backdrop-blur-md rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-[#1E88E5]/10 to-[#1E88E5]/5 p-4 sm:p-5 flex flex-row justify-between items-center border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 relative drop-shadow-md rounded-full overflow-hidden bg-gradient-to-br from-[#4338ca] to-[#6366f1] flex items-center justify-center">
                            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-label="ARIA">
                                <rect x="4" y="8" width="16" height="12" rx="4" fill="white" />
                                <rect x="10.5" y="2" width="3" height="5" rx="1.5" fill="white" />
                                <circle cx="12" cy="3.2" r="1.6" fill="white" />
                                <circle cx="9" cy="14" r="1.6" fill="#4338ca" />
                                <circle cx="15" cy="14" r="1.6" fill="#4338ca" />
                                <path d="M9 17.5c1 1 5 1 6 0" stroke="#4338ca" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div className="flex flex-col">
                            <h3 className="font-extrabold text-gray-800 tracking-tight">ARIA</h3>
                            <p className="text-[10px] text-[#1E88E5] font-bold uppercase tracking-widest flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                Taller Conectado Pro
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-white/70 rounded-full text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setIsOpen(false)}>
                        <Minimize2 className="h-5 w-5" />
                    </Button>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide" ref={scrollRef}>
                    {messages.map((m, i) => (
                        <div key={i} className={cn(
                            "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
                            m.role === 'user' ? "justify-end" : "justify-start"
                        )}>
                            <div className={cn(
                                "max-w-[88%] rounded-2xl px-5 py-4 text-sm shadow-sm ring-1",
                                m.role === 'user'
                                    ? "bg-[#1E88E5] text-white ring-[#1E88E5]/20 rounded-br-sm"
                                    : "bg-gray-50 text-gray-800 ring-gray-100 rounded-bl-sm"
                            )}>
                                {formatMessage(m.content)}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-gray-50 rounded-2xl px-5 py-4 rounded-bl-sm flex items-center gap-1.5 ring-1 ring-gray-100 shadow-sm">
                                <div className="w-1.5 h-1.5 bg-[#1E88E5]/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-1.5 h-1.5 bg-[#1E88E5]/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-1.5 h-1.5 bg-[#1E88E5]/60 rounded-full animate-bounce" />
                            </div>
                        </div>
                    )}
                    {isTranscribing && (
                        <div className="flex justify-center">
                            <div className="bg-blue-50/80 px-4 py-2 rounded-full text-[11px] font-bold text-[#1E88E5] border border-blue-100 flex items-center gap-2 animate-pulse">
                                🎤 PROCESANDO AUDIO...
                            </div>
                        </div>
                    )}
                </CardContent>

                <CardFooter className="p-5 border-t bg-gray-50/30">
                    <form onSubmit={handleSubmit} className="flex gap-3 w-full">
                        <div className="relative flex-1">
                            <Input
                                placeholder="Escribe o pulsa el micro..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={isRecording || isTranscribing}
                                className="h-12 w-full border-gray-200 focus-visible:ring-[#1E88E5] focus-visible:ring-offset-0 bg-white shadow-inner rounded-xl pr-10"
                            />
                        </div>

                        <Button
                            type="button"
                            size="icon"
                            onClick={isRecording ? stopRecording : startRecording}
                            disabled={isLoading || isTranscribing}
                            className={cn(
                                "h-12 w-12 rounded-xl shadow-lg transition-all duration-500 shrink-0",
                                isRecording
                                    ? "bg-red-500 hover:bg-red-600 animate-pulse scale-105"
                                    : "bg-white border border-gray-200 text-gray-500 hover:text-[#1E88E5] hover:bg-gray-50"
                            )}
                        >
                            {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                        </Button>

                        <Button
                            type="submit"
                            size="icon"
                            disabled={isLoading || !input.trim() || isRecording || isTranscribing}
                            className="h-12 w-12 bg-[#1E88E5] hover:bg-[#1565C0] text-white shadow-lg rounded-xl shrink-0 transition-transform active:scale-90"
                        >
                            <Send className="h-6 w-6" />
                        </Button>
                    </form>
                </CardFooter>
            </Card>
            <BrandingFooter />
        </div>
    )
}

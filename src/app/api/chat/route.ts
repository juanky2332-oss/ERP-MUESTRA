import { NextResponse } from "next/server"
import { getContexto, mensajeError, ErrorPermiso } from "@/lib/auth"
import { runErpAssistant, type ChatMessage } from "@/lib/ai/erp-assistant"

export const maxDuration = 60

export async function POST(req: Request) {
    try {
        const ctx = await getContexto()
        const { messages, transcript } = await req.json()

        const historial: ChatMessage[] = (Array.isArray(messages) ? messages : [])
            .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .slice(-16)
            .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000), accion_id: m.accion_id }))
        if (transcript) historial.push({ role: 'user', content: String(transcript) })

        const r = await runErpAssistant(ctx, historial)
        return NextResponse.json({ role: 'assistant', content: r.texto, accion: r.accion || null, ejecutada: r.ejecutada || null, archivos: r.archivos?.length ? r.archivos : null })
    } catch (error) {
        console.error("Chat Error:", error)
        const status = error instanceof ErrorPermiso ? 401 : 500
        return NextResponse.json({ role: 'assistant', content: "❌ " + mensajeError(error) }, { status })
    }
}

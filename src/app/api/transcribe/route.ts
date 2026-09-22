import { OpenAI } from "openai"
import { NextResponse } from "next/server"
import { getContexto } from "@/lib/auth"
import { registrarUsoIA } from "@/lib/ai/uso"

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req: Request) {
    try {
        const ctx = await getContexto()
        const formData = await req.formData()
        const audioFile = formData.get('audio') as File

        if (!audioFile) {
            return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
        }

        // RECONSTRUCCIÓN DEL ARCHIVO: 
        // Extraemos el nombre y tipo dinámico que envía el frontend (mp4, webm, etc.)
        // y creamos un nuevo File. Esto soluciona el problema de compatibilidad con OpenAI.
        const fileName = audioFile.name || 'recording.webm'
        const fileType = audioFile.type || 'audio/webm'
        const fileForOpenAI = new File([audioFile], fileName, { type: fileType })

        // Use OpenAI Whisper API for transcription
        const transcription = await openai.audio.transcriptions.create({
            file: fileForOpenAI,
            model: 'whisper-1',
            language: 'es', // Force Spanish
            prompt: "ERP. Facturas, presupuestos, albaranes, gastos, cobros, vencimientos, clientes, proveedores."
        })

        registrarUsoIA(ctx, { accion: 'transcripcion', modelo: 'whisper-1', costeFijo: Math.max(0.1, audioFile.size / 16000 / 60) * 0.006 }).catch(() => { })
        return NextResponse.json({ text: transcription.text })

    } catch (error) {
        console.error('Transcription error:', error)
        return NextResponse.json({ error: 'Failed to transcribe audio' }, { status: 500 })
    }
}

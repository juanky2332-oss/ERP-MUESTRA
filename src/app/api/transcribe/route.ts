import { OpenAI } from "openai"
import { NextResponse } from "next/server"

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req: Request) {
    try {
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
            prompt: "Empresa X. Taller, facturas, presupuestos, albaranes, gastos. Habla coloquial de taller."
        })

        return NextResponse.json({ text: transcription.text })

    } catch (error) {
        console.error('Transcription error:', error)
        return NextResponse.json({ error: 'Failed to transcribe audio' }, { status: 500 })
    }
}

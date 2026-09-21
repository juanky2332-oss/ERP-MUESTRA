import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { runErpAssistant } from "@/lib/ai/erp-assistant"

export async function POST(req: Request) {
    try {
        const { messages, transcript } = await req.json()
        const supabase = await createClient()

        const processedMessages = transcript
            ? [...messages, { role: "user", content: transcript }]
            : messages

        const content = await runErpAssistant(supabase, processedMessages)

        return NextResponse.json({ role: 'assistant', content })
    } catch (error) {
        console.error("Chat Error:", error)
        return NextResponse.json({
            role: 'assistant',
            content: "❌ Error de sistema. Inténtalo de nuevo."
        }, { status: 500 })
    }
}

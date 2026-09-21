import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

export async function generateEmbedding(text: string) {
    try {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text.replace(/\n/g, ' '),
        })
        return response.data[0].embedding
    } catch (error) {
        console.error('Error generating embedding:', error)
        throw error
    }
}

export async function storeDocumentEmbedding(
    content: string,
    metadata: any
) {
    const supabase = await createClient()

    if (!content || content.length < 5) return

    // Generate embedding
    const embedding = await generateEmbedding(content)

    // Store in DB
    const { error } = await supabase.from('document_embeddings').insert({
        content,
        embedding,
        metadata
    })

    if (error) {
        console.error('Error storing embedding:', error)
        throw error // Re-throw to handle upstream if needed
    } else {
        console.log('--- EMBEDDING STORED CORRECTLY ---')
    }
}

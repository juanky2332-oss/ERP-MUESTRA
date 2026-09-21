import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from './embeddings'

export async function searchSimilarDocuments(query: string, limit = 5) {
    const supabase = await createClient()

    // 1. Generate embedding for the question
    const queryEmbedding = await generateEmbedding(query)

    // 2. Call Supabase RPC function
    const { data: documents, error } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5, // Similarity threshold
        match_count: limit,
    })

    if (error) {
        console.error('Error in RAG search:', error)
        return []
    }

    return documents
}

'use server'

import { storeDocumentEmbedding } from '@/lib/ai/embeddings'
import { processDocumentWithOCR } from '@/actions/ocr' // Use the one we already fixed if possible, or independent logic.

export async function ingestDocument(
    text: string | null,
    publicUrl: string,
    metadata: any
) {
    console.log('--- INGESTING DOCUMENT ---', metadata.filename);

    let contentToEmbed = text;

    // If no text provided (e.g. skipped OCR in UI), we might want to force OCR here.
    // For now, if no text, we assume we cannot embed effectively or we try to run OCR from the URL.
    if (!contentToEmbed && publicUrl) {
        try {
            // Re-use logic? Or assume text is mandatory?
            // Let's try to get text if missing.
            console.log('--- MISSING TEXT, ATTEMPTING SERVER-SIDE OCR FOR EMBEDDING ---');
            const result = await processDocumentWithOCR(publicUrl);
            if (result.success && result.text) {
                contentToEmbed = result.text;
            }
        } catch (e) {
            console.error('Error auto-OCR during ingestion:', e);
        }
    }

    if (contentToEmbed) {
        await storeDocumentEmbedding(contentToEmbed, {
            publicUrl,
            ...metadata
        });
        return { success: true };
    }

    return { success: false, error: 'No text available for embedding' };
}

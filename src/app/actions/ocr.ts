'use server'

import OpenAI from 'openai'
import { getContexto } from '@/lib/auth'
import { REGLAS_PARTES } from '@/lib/ocr-prompts'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

export async function processDocumentWithOCR(formData: FormData) {
    try {
        await getContexto()
        const file = formData.get('file') as File
        const type = formData.get('type') as string // 'gasto' | 'albaran_firmado'

        if (!file) {
            return { success: false, error: 'No se ha proporcionado ningún archivo.' }
        }

        if (!process.env.OPENAI_API_KEY) {
            return { success: false, error: 'Clave de API de OpenAI no configurada.' }
        }

        // Convert file to base64
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const base64Image = buffer.toString('base64')
        const dataUrl = `data:${file.type};base64,${base64Image}`

        let systemPrompt = "Eres un asistente administrativo experto. Tu tarea es extraer datos estructurados de documentos escaneados."
        let userPrompt = "Analiza esta imagen y extrae los datos en formato JSON."

        if (type === 'gasto') {
            systemPrompt += ` El documento es una factura o ticket de compra.

${REGLAS_PARTES}

Extrae los siguientes campos: emisor_nombre, emisor_cif, receptor_nombre, receptor_cif, proveedor (copia de emisor_nombre), proveedor_cif (copia de emisor_cif), fecha (YYYY-MM-DD), concepto (breve descripción), base_imponible (número), iva_porcentaje (número), iva_importe (número), total (número). Si hay retención, inclúyela. IMPORTANTE: Añade un campo 'raw_text' con todo el texto legible del documento para indexación. Devuelve solo un JSON válido sin bloques de código.`
        } else if (type === 'albaran_firmado') {
            systemPrompt += " El documento es un albarán de entrega firmado. Extrae: numero_albaran, cliente, fecha, y confirma si parece estar firmado (campo 'firmado': true/false). IMPORTANTE: Añade un campo 'raw_text' con todo el texto legible del documento o un resumen detallado. Devuelve solo JSON válido."
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: userPrompt },
                        {
                            type: "image_url",
                            image_url: {
                                "url": dataUrl,
                            },
                        },
                    ],
                },
            ],
            max_tokens: 1000,
            response_format: { type: "json_object" }
        })

        const content = response.choices[0].message.content
        if (!content) throw new Error('No se obtuvo respuesta de OpenAI')

        const data = JSON.parse(content)
        return { success: true, data, text: data.raw_text || data.concepto }

    } catch (error: any) {
        console.error('OCR Error:', error)
        return { success: false, error: error.message || 'Error al procesar el documento.' }
    }
}

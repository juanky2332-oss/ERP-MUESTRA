import 'server-only'

import OpenAI from 'openai'
import { CAMPOS_JSON, REGLAS_PARTES } from '@/lib/ocr-prompts'
const pdf = require('pdf-extraction')

/** Modelo usado para leer documentos. Configurable sin tocar código. */
const MODELO_OCR = process.env.OPENAI_MODEL_OCR || 'gpt-4o'

/** Longitud mínima de texto para dar por buena la extracción de un PDF. */
const MIN_TEXTO_PDF = 40

const PROMPT_PDF = `Extrae información estructurada de este documento ERP (Presupuesto, Albarán, Factura o Gasto).

${REGLAS_PARTES}

REQUISITO DE MÁXIMA PRIORIDAD: **Concepto/Descripción**
Localiza el cuerpo central del documento (entre el encabezado y los totales).
- Captura el TEXTO que describe el trabajo, servicio o material.
- **REGLA DE LONGITUD**: Si hay mucho texto o muchas líneas de detalle, haz un RESUMEN CON SENTIDO que permita entender de qué trata el documento sin que sea excesivamente largo.
- Si es corto, captúralo tal cual.
- NO omitas información técnica crítica, pero evita redundancias.
- Si hay varias líneas, únelas con " | ".
- Es vital que el usuario entienda el propósito del documento de un vistazo.

Otros requisitos de extracción:
1. **Número de Documento**: Identificador principal (Ej: 'Factura nº 123', 'Albarán 50').
2. **Nº Pedido/Nº Solicitud/Ref**: Solo números de pedido (450000), códigos OCC, o referencias de proyecto. Deja VACÍO si no hay una referencia clara del cliente. NUNCA pongas aquí el número del documento.
3. **Datos Financieros**: Extrae Base Imponible, IVA (porcentaje e importe) y Total.
4. **Fecha**: Formato ISO (YYYY-MM-DD).

RESPONDE SOLO EN JSON:
${CAMPOS_JSON}`

const PROMPT_IMAGEN = `Extrae información estructurada de este documento ERP (Presupuesto, Albarán, Factura o Gasto).

${REGLAS_PARTES}

OBJETIVO PRINCIPAL: **Concepto/Descripción** (Campo: 'concepto')
- Este es el campo MÁS IMPORTANTE.
- Busca la columna "DESCRIPCION", "CONCEPTO" o el cuerpo central del documento.
- Extrae el texto COMPLETO de la descripción de la línea principal.
- Ejemplo: Si dice "erp prueba de nuevo", DEBES extraer "erp prueba de nuevo".
- Si hay varias líneas, resume inteligentemente o únelas con " | ".
- NO omitas el contenido principal. Si la descripción es larga, CAPTURA LO ESENCIAL.
- En un ticket de compra (supermercado, gasolinera, ferretería) resume los artículos comprados.

Otros requisitos:
1. **Número de Documento**: (Ej: 'Factura nº 123', 'Albarán 50'). ES OBLIGATORIO. Si no lo encuentras, busca cerca de la fecha o arriba a la derecha. NO inventes.
2. **Nº Pedido/Ref**: (Ej: '450000', 'erp'). NUNCA pongas aquí el número del documento.
3. **Importes**: Base, IVA, Total.
4. **Fecha**: YYYY-MM-DD.

JSON FORMAT:
${CAMPOS_JSON}
- raw_text: String (TRANSCRIPCIÓN COMPLETA O RESUMEN DETALLADO DEL TEXTO VISIBLE EN EL DOCUMENTO)`

/** ¿El fichero es realmente un PDF? Se mira la cabecera, no sólo el content-type. */
function esPdf(buffer: Buffer, contentType: string): boolean {
    if (contentType.includes('pdf')) return true
    return buffer.subarray(0, 5).toString('latin1') === '%PDF-'
}

/**
 * Extrae el texto de un PDF.
 *
 * Devuelve null si el PDF no se puede parsear. Es habitual con PDFs generados
 * por escáneres o TPVs: lanzan errores del tipo "bad XRef entry" (el índice
 * interno del PDF está mal). Antes ese error abortaba todo el OCR; ahora sólo
 * significa que hay que leerlo por otra vía.
 */
async function extraerTextoPdf(buffer: Buffer): Promise<string | null> {
    try {
        const pdfData = await pdf(buffer)
        const texto = typeof pdfData?.text === 'string' ? pdfData.text : ''
        return texto.trim().length >= MIN_TEXTO_PDF ? texto : null
    } catch (e: any) {
        console.warn('--- OCR: PDF SIN TEXTO EXTRAÍBLE ---', e?.message || e)
        return null
    }
}

/** Parsea la respuesta JSON del modelo. */
function parsearRespuesta(content: string | null | undefined) {
    if (!content) throw new Error('Respuesta vacía de la IA')
    return JSON.parse(content)
}

/**
 * Lee un documento (PDF o imagen) con IA y devuelve los datos estructurados.
 * Recibe el contenido ya descargado: nunca descarga URLs arbitrarias.
 */
export async function leerDocumentoConIA(buffer: Buffer, contentType: string): Promise<{ success: boolean; data?: any; text?: string; error?: string; tokens?: { entrada: number; salida: number } }> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.error('--- OCR ERROR: OPENAI_API_KEY NO DETECTADA ---');
        return { success: false, error: 'API Key missing' }
    }

    const client = new OpenAI({ apiKey });

    try {
        console.log('Tipo de archivo detectado:', contentType);

        if (esPdf(buffer, contentType)) {
            // --- 1º intento: leer el texto incrustado en el PDF (rápido y barato) ---
            const extractedText = await extraerTextoPdf(buffer)

            if (extractedText) {
                console.log('--- OCR: ENVIANDO TEXTO EXTRAÍDO A IA ---');
                const aiResponse = await client.chat.completions.create({
                    model: MODELO_OCR,
                    messages: [
                        { role: "system", content: PROMPT_PDF },
                        { role: "user", content: extractedText }
                    ],
                    response_format: { type: "json_object" }
                });

                const jsonData = parsearRespuesta(aiResponse.choices[0].message.content);
                return { success: true, data: jsonData, text: extractedText };
            }

            // --- 2º intento: mandar el PDF entero a la IA ---
            // Cubre los PDFs escaneados (sin texto) y los dañados. La IA los ve
            // como imágenes, así que también lee tickets fotografiados.
            console.log('--- OCR: PDF SIN TEXTO, ENVIANDO EL FICHERO A LA IA ---');
            try {
                const aiResponse = await client.chat.completions.create({
                    model: MODELO_OCR,
                    messages: [
                        { role: "system", content: PROMPT_IMAGEN },
                        {
                            role: "user",
                            content: [
                                {
                                    type: "file",
                                    file: {
                                        filename: 'documento.pdf',
                                        file_data: `data:application/pdf;base64,${buffer.toString('base64')}`,
                                    },
                                },
                                { type: "text", text: "Extrae los datos de este documento." },
                            ] as any,
                        },
                    ],
                    response_format: { type: "json_object" },
                });

                const jsonData = parsearRespuesta(aiResponse.choices[0].message.content);
                return { success: true, data: jsonData, text: jsonData.raw_text || jsonData.concepto };
            } catch (errorPdfIA: any) {
                console.error('--- OCR: LA IA TAMPOCO PUDO LEER EL PDF ---', errorPdfIA?.message);
                return {
                    success: false,
                    error: 'No se ha podido leer este PDF (está escaneado o su estructura interna está dañada). Sube una foto o una captura de pantalla del documento y volverá a funcionar.',
                };
            }
        }

        // --- FLUJO PARA IMÁGENES ---
        const dataUrl = `data:${contentType || 'image/jpeg'};base64,${buffer.toString('base64')}`;

        console.log('--- OCR: ENVIANDO IMAGEN A OPENAI (VISIÓN) ---');

        const aiResponse = await client.chat.completions.create({
            model: MODELO_OCR,
            messages: [
                { role: "system", content: PROMPT_IMAGEN },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Extrae los datos de esta imagen." },
                        { type: "image_url", image_url: { url: dataUrl } },
                    ],
                },
            ],
            response_format: { type: "json_object" },
            max_tokens: 1000,
        });

        const content = aiResponse.choices[0].message.content;
        console.log('--- OCR: RESULTADO ---');
        console.log(content);

        const jsonData = parsearRespuesta(content);
        return { success: true, data: jsonData, text: jsonData.raw_text || jsonData.concepto };

    } catch (error: any) {
        console.error('--- OCR: ERROR CRÍTICO ---');
        console.error(error);
        return { success: false, error: error.message || 'Error procesando documento' };
    }
}

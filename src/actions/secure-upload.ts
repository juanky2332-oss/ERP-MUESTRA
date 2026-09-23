'use server'

import { getContexto, assertPermiso, mensajeError } from '@/lib/auth'
import { leerDocumentoConIA } from '@/lib/ocr/leer'
import { subirArchivo } from '@/lib/archivos-servidor'
import { vincularProveedor } from '@/lib/gastos/servidor'
import { auditar } from '@/lib/auditoria'
import { storeDocumentEmbedding } from '@/lib/ai/embeddings'
import { revalidatePath } from 'next/cache'
import { getNextSequenceNumber } from '@/lib/sequences'
import { resolveExpenseSupplier } from '@/lib/expense-supplier'

/** Resultado del alta de un gasto por OCR. */
type ProcessExpenseResult =
    | { success: true; proveedor: string; revisarProveedor: boolean }
    | { success: false; error: string }

export async function processExpense(formData: FormData): Promise<ProcessExpenseResult> {
    let ctx
    try { ctx = await getContexto(); assertPermiso(ctx, 'gastos') } catch (e) { return { success: false, error: mensajeError(e) } }
    const supabase = ctx.supabase
    const file = formData.get('file') as File

    if (!file) {
        return { success: false, error: 'No se recibió ningún archivo' }
    }

    try {
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const filename = `expense_${Date.now()}_${sanitizedName}`

        // 1. Subida privada a la carpeta de la empresa
        const buffer = Buffer.from(await file.arrayBuffer())
        const subido = await subirArchivo(ctx, 'gastos', 'gastos', buffer, file.type || 'application/octet-stream', file.name.split('.').pop() || 'pdf')
        const publicUrl = subido.url

        // 2. OCR directamente sobre el contenido
        const ocrResult = await leerDocumentoConIA(buffer, file.type || '')
        if (!ocrResult.success) {
            return { success: false, error: `Error OCR: ${ocrResult.error}` }
        }

        const ocrData = ocrResult.data || {}

        // 3. AI Embedding
        try {
            const documentText = ocrResult.text || ocrData.descripcion || ocrData.concepto || 'gasto sin texto';
            await storeDocumentEmbedding(documentText, {
                filename: filename,
                type: 'gasto',
                publicUrl: publicUrl,
                ...ocrData
            });
        } catch (embedError) {
            console.error('--- ERROR GENERATING EMBEDDING ---', embedError);
        }

        // 4. Create DB Entry
        const seqNumero = await getNextSequenceNumber('gasto', supabase)
        const documentNumber = ocrData.numero || 'S/N'
        const combinedNumero = `${seqNumero} / ${documentNumber}`

        // El proveedor NO se toma tal cual de la IA: se decide con reglas fijas
        // que impiden que la propia empresa quede registrada como proveedor.
        const supplier = resolveExpenseSupplier(ocrData)
        console.log('--- GASTO: PROVEEDOR RESUELTO ---', supplier)

        const referencia = ocrData.numero_pedido_ref || ''

        const payload = {
            numero: combinedNumero,
            fecha: ocrData.fecha || new Date().toISOString(),
            proveedor: supplier.proveedor,
            proveedor_cif: supplier.proveedor_cif,
            descripcion: ocrData.concepto || ocrData.descripcion || 'Gasto importado',
            base_imponible: Number(ocrData.base_imponible) || 0,
            iva_importe: Number(ocrData.iva_importe) || 0,
            iva_porcentaje: Number(ocrData.iva_porcentaje) || 21,
            total: (Number(ocrData.total) || 0) === 0 && (Number(ocrData.base_imponible) || 0) > 0
                ? (Number(ocrData.base_imponible) || 0) + (Number(ocrData.iva_importe) || 0)
                : (Number(ocrData.total) || 0),
            factura_url: publicUrl,
            archivo_url: publicUrl,
            proveedor_id: await vincularProveedor(ctx, supplier.proveedor, supplier.proveedor_cif),
            origen: 'app',
            revisado: !supplier.revisar,
            // Se escriben las dos columnas: 'referencia_pedido' es la que muestra
            // el listado y 'referencia' se mantiene por compatibilidad histórica.
            referencia_pedido: referencia,
            referencia,
            // Traza de la decisión, para poder auditar por qué se eligió ese proveedor.
            ocr_data: {
                ...ocrData,
                _proveedor_resuelto: supplier,
            },
        }

        const { data: gastoCreado, error: dbError } = await supabase
            .from('gastos')
            .insert(payload)
            .select('id, numero, total')
            .single()

        if (dbError) {
            return { success: false, error: `Error guardando gasto: ${dbError.message}` }
        }
        await auditar(ctx, 'gasto_registrado', { tipo: 'gasto', id: gastoCreado.id, ref: gastoCreado.numero }, { proveedor: supplier.proveedor, total: gastoCreado.total, origen: 'ocr' })

        revalidatePath('/gastos')
        return {
            success: true,
            proveedor: supplier.proveedor,
            revisarProveedor: supplier.revisar,
        }

    } catch (e: any) {
        console.error('Process Expense Error:', e)
        return { success: false, error: e.message }
    }
}

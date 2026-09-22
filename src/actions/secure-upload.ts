'use server'

import { getContexto, assertPermiso, mensajeError } from '@/lib/auth'
import { leerDocumentoConIA } from '@/lib/ocr/leer'
import { subirArchivo } from '@/lib/archivos-servidor'
import { vincularProveedor } from '@/lib/gastos/servidor'
import { auditar } from '@/lib/auditoria'
import { storeDocumentEmbedding } from '@/lib/ai/embeddings'
import { revalidatePath } from 'next/cache'
import { getNextSequenceNumber } from '@/lib/sequences'
import { PROVEEDOR_PENDIENTE, resolveDocumentClient, resolveExpenseSupplier } from '@/lib/expense-supplier'

export async function uploadSignedAlbaranAction(formData: FormData) {
    let ctx
    try { ctx = await getContexto(); assertPermiso(ctx, 'documentos') } catch (e) { return { success: false, error: mensajeError(e) } }
    const supabase = ctx.supabase
    const file = formData.get('file') as File

    if (!file) {
        return { success: false, error: 'No se recibió ningún archivo' }
    }

    try {
        // 1. Subida privada a la carpeta de la empresa
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const filename = `signed_${Date.now()}_${sanitizedName}`
        const buffer = Buffer.from(await file.arrayBuffer())
        const subido = await subirArchivo(ctx, 'albaranes-firmados', 'albaranes', buffer, file.type || 'application/octet-stream', file.name.split('.').pop() || 'pdf')
        const publicUrl = subido.url

        // 2. OCR directamente sobre el contenido (sin URLs públicas)
        const ocrResult = await leerDocumentoConIA(buffer, file.type || '')

        if (!ocrResult.success) {
            return { success: false, error: `Error OCR: ${ocrResult.error}` }
        }

        const ocrData = ocrResult.data || {}

        // --- 4. Store Embedding for AI (RAG) ---
        try {
            const documentText = ocrResult.text || ocrData.concepto || 'documento sin texto';
            await storeDocumentEmbedding(documentText, {
                filename: filename,
                type: 'albaran_firmado',
                publicUrl: publicUrl,
                ...ocrData
            });
        } catch (embedError) {
            console.error('--- ERROR GENERATING EMBEDDING ---', embedError);
        }

        // 5. Insert into Database
        // Validate OCR Number
        let documentNumber = ocrData.numero;
        if (!documentNumber || documentNumber === 'S/N' || documentNumber.length < 2) {
            console.warn('--- OCR WARNING: Número no detectado. Generando ID temporal. ---');
            documentNumber = `SCAN-${Date.now()}`;
        }

        // Check if number already exists and make it unique if needed
        const { data: existing } = await supabase
            .from('albaranes')
            .select('numero')
            .eq('numero', documentNumber)
            .maybeSingle()

        if (existing) {
            // Number exists, append timestamp to make it unique
            const timestamp = Date.now().toString().slice(-6)
            documentNumber = `${documentNumber}-${timestamp}`
            console.log(`--- Número duplicado detectado. Nuevo número: ${documentNumber} ---`)
        }

        // En un albarán firmado el emisor somos nosotros: el dato que interesa
        // es la contraparte (el cliente), nunca la propia empresa.
        const cliente = resolveDocumentClient(ocrData)

        const payload = {
            numero: documentNumber,
            fecha: ocrData.fecha || new Date().toISOString(),
            cliente_razon_social: cliente.proveedor === PROVEEDOR_PENDIENTE
                ? 'REVISAR - Cliente no identificado'
                : cliente.proveedor,
            cliente_cif: cliente.proveedor_cif || '',
            pedido_referencia: ocrData.numero_pedido_ref || '',
            subtotal: Number(ocrData.base_imponible) || 0,
            base_imponible: Number(ocrData.base_imponible) || 0,
            iva_importe: Number(ocrData.iva_importe) || 0,
            total: Number(ocrData.total) || 0,
            documento_firmado_url: publicUrl,
            estado_vida: 'Pendiente',
            es_enviado: false,
            descripcion: ocrData.concepto || 'Albarán Firmado Importado'
        }

        const { data: dbData, error: dbError } = await supabase
            .from('albaranes')
            .insert([payload])
            .select()
            .single()

        if (dbError) {
            console.error('Database Insert Error:', dbError)
            return { success: false, error: `Error guardando en base de datos: ${dbError.message}` }
        }

        revalidatePath('/albaranes-firmados')
        return { success: true, data: dbData }

    } catch (e: any) {
        console.error('Server Action Critical Error:', e)
        return { success: false, error: e.message || 'Error desconocido en el servidor' }
    }
}

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

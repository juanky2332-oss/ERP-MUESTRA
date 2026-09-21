'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getNextSequenceNumber } from '@/lib/sequences'

export async function createDocument(data: any, type: 'presupuesto' | 'albaran' | 'factura') {
    const supabase = await createClient()

    try {
        // Crear una copia limpia de los datos y extraer info de origen
        const { source_document_id, source_document_type, ...cleanData } = data

        const payloadToInsert = { ...cleanData }
        delete (payloadToInsert as any).source_document_id
        delete (payloadToInsert as any).source_document_type

        // Generar número si no existe
        const numero = await getNextSequenceNumber(type, supabase)

        // ESTADOS ARRAY + LEGACY
        const payload = {
            ...payloadToInsert,
            numero: numero,
            statuses: ['pendiente'], // New Array Logic
            estado_vida: 'Pendiente', // Keep for safety until full migration
            created_at: new Date().toISOString(),
            fecha: payloadToInsert.fecha || new Date().toISOString(),
        }

        // Insert document
        const tableMap = {
            'presupuesto': 'presupuestos',
            'albaran': 'albaranes',
            'factura': 'facturas'
        }

        const { data: insertedDoc, error } = await supabase
            .from(tableMap[type])
            .insert(payload)
            .select()
            .single()

        if (error) throw error

        // Handle source document status update (AUTOMATISMO)
        if (source_document_id && source_document_type) {
            const sourceTableMap: Record<string, string> = {
                'presupuesto': 'presupuestos',
                'albaran': 'albaranes'
            }

            if (sourceTableMap[source_document_type]) {
                // Fetch current statuses first to append safely
                const { data: sourceDoc } = await supabase
                    .from(sourceTableMap[source_document_type])
                    .select('statuses')
                    .eq('id', source_document_id)
                    .single()

                const currentStatuses = sourceDoc?.statuses || []
                const newStatus = 'traspasado'

                if (!currentStatuses.includes(newStatus)) {
                    const updatePayload = {
                        statuses: [...currentStatuses.filter(s => s !== 'pendiente'), newStatus]
                    }

                    console.log(`Actualizando documento origen ${source_document_type} ${source_document_id}:`, updatePayload)

                    const { error: updateError } = await supabase
                        .from(sourceTableMap[source_document_type])
                        .update(updatePayload)
                        .eq('id', source_document_id)

                    if (updateError) {
                        console.error(`Error actualizando documento origen ${sourceTableMap[source_document_type]}:`, updateError)
                    }

                    // Also track in history table (best effort)
                    await supabase.from('document_status').insert({
                        document_type: source_document_type,
                        document_id: source_document_id,
                        status: newStatus
                    })
                }

                revalidatePath(`/${sourceTableMap[source_document_type]}`)
            }
        }

        // Initialize history for new document
        await supabase.from('document_status').insert({
            document_type: type,
            document_id: insertedDoc.id,
            status: 'pendiente'
        })

        revalidatePath(`/${tableMap[type]}`)
        return { success: true, data: insertedDoc }
    } catch (e) {
        console.error('Error creating document:', e)
        return { success: false, error: e }
    }
}

export async function updateDocument(id: string, data: any, type: 'presupuesto' | 'albaran' | 'factura') {
    const supabase = await createClient()

    const tableMap = {
        'presupuesto': 'presupuestos',
        'albaran': 'albaranes',
        'factura': 'facturas'
    }

    // Clean data
    const cleanUpdateData = { ...data }
    delete (cleanUpdateData as any).source_document_id
    delete (cleanUpdateData as any).source_document_type

    // Compatibility mapping
    if (type === 'factura' && cleanUpdateData.enviado !== undefined && cleanUpdateData.enviada === undefined) {
        cleanUpdateData.enviada = cleanUpdateData.enviado
    }

    try {
        console.log(`Actualizando ${type} ${id}:`, cleanUpdateData)

        // 1. History Logging: Check if statuses changed
        if (cleanUpdateData.statuses && Array.isArray(cleanUpdateData.statuses)) {
            try {
                const { data: currentDoc } = await supabase
                    .from(tableMap[type])
                    .select('statuses')
                    .eq('id', id)
                    .single()

                const oldStatuses: string[] = currentDoc?.statuses || []
                const newStatuses: string[] = cleanUpdateData.statuses

                // Find newly added statuses
                const addedStatuses = newStatuses.filter(s => !oldStatuses.includes(s))

                // Insert only new statuses into history
                if (addedStatuses.length > 0) {
                    const historyInserts = addedStatuses.map(status => ({
                        document_type: type,
                        document_id: id,
                        status: status,
                        created_by: 'system' // or fetch user if available (can be improved later)
                    }))

                    await supabase.from('document_status').insert(historyInserts)
                }
            } catch (historyError) {
                console.error('Error logging status history:', historyError)
                // Don't block main update
            }
        }

        // 2. Perform Update
        const { error } = await supabase
            .from(tableMap[type])
            .update(cleanUpdateData)
            .eq('id', id)

        if (error) throw error

        revalidatePath(`/${tableMap[type]}`)
        return { success: true }
    } catch (e) {
        console.error(`Error en updateDocument (${type}):`, e)
        return { success: false, error: e }
    }
}
export async function deleteDocument(id: string, type: 'presupuesto' | 'albaran' | 'factura') {
    const supabase = await createClient()

    const tableMap = {
        'presupuesto': 'presupuestos',
        'albaran': 'albaranes',
        'factura': 'facturas'
    }

    const { error } = await supabase
        .from(tableMap[type])
        .delete()
        .eq('id', id)

    if (error) return { success: false, error }

    revalidatePath(`/${tableMap[type]}`)
    return { success: true }
}

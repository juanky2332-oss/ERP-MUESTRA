'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getNextSequenceNumber } from '@/lib/sequences'

export async function createExpense(data: any) {
    const supabase = await createClient()

    try {
        // Generate 'G' sequence number
        const seqNumero = await getNextSequenceNumber('gasto', supabase)
        const originalNumero = data.numero || 'S/N'
        const combinedNumero = `${seqNumero} / ${originalNumero}`

        const payload = {
            ...data,
            numero: combinedNumero,
            referencia: data.referencia === data.numero ? '' : (data.referencia || ''),
            importe: data.importe || data.total || 0,
            base_imponible: data.base_imponible || data.subtotal || 0,
            iva_porcentaje: data.iva_porcentaje || 21,
            iva_importe: data.iva_importe || 0,
            proveedor_cif: data.proveedor_cif || '',
            created_at: new Date().toISOString()
        }

        const { data: insertedDoc, error } = await supabase
            .from('gastos')
            .insert(payload)
            .select()
            .single()

        if (error) throw error

        revalidatePath('/gastos')
        return { success: true, data: insertedDoc }
    } catch (e) {
        console.error('Error creating expense:', e)
        return { success: false, error: e }
    }
}
export async function updateExpense(id: string, data: any) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('gastos')
        .update(data)
        .eq('id', id)

    if (error) return { success: false, error }

    revalidatePath('/gastos')
    return { success: true }
}

export async function deleteExpense(id: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('gastos')
        .delete()
        .eq('id', id)

    if (error) return { success: false, error }

    revalidatePath('/gastos')
    return { success: true }
}

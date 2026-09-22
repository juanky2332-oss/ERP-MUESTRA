'use server'

import { revalidatePath } from 'next/cache'
import { getContexto, assertPermiso, mensajeError } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { crearGasto, vincularProveedor } from '@/lib/gastos/servidor'

export async function createExpense(data: any) {
    try {
        const ctx = await getContexto()
        const inserted = await crearGasto(ctx, {
            ...data,
            total: data.total ?? data.importe,
            base_imponible: data.base_imponible ?? data.subtotal,
            archivo_url: data.archivo_url || data.factura_url || null,
        })
        revalidatePath('/gastos')
        return { success: true, data: inserted }
    } catch (e) {
        console.error('Error creating expense:', e)
        return { success: false, error: { message: mensajeError(e) } }
    }
}

export async function updateExpense(id: string, data: any) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'gastos')
        const update = { ...data }
        if (update.proveedor !== undefined && !update.proveedor_id) {
            update.proveedor_id = await vincularProveedor(ctx, update.proveedor, update.proveedor_cif)
        }
        const { data: antes } = await ctx.supabase.from('gastos').select('numero, total, proveedor').eq('id', id).maybeSingle()
        const { error } = await ctx.supabase.from('gastos').update(update).eq('id', id)
        if (error) throw error
        await auditar(ctx, 'gasto_editado', { tipo: 'gasto', id, ref: antes?.numero }, { antes, cambios: data })
        revalidatePath('/gastos')
        return { success: true }
    } catch (e) {
        return { success: false, error: { message: mensajeError(e) } }
    }
}

export async function deleteExpense(id: string) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'gastos')
        const { data: antes } = await ctx.supabase.from('gastos').select('numero, total, proveedor').eq('id', id).maybeSingle()
        const { error } = await ctx.supabase.from('gastos').delete().eq('id', id)
        if (error) throw error
        await auditar(ctx, 'gasto_eliminado', { tipo: 'gasto', id, ref: antes?.numero }, antes || {})
        revalidatePath('/gastos')
        return { success: true }
    } catch (e) {
        return { success: false, error: { message: mensajeError(e) } }
    }
}

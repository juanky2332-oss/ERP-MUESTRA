'use server'

import { revalidatePath } from 'next/cache'
import { requirePermiso, mensajeError } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { configFiscal, MODELOS, periodoFiscal, type ConfigFiscal } from '@/lib/fiscal/calendario'
import { librosDelPeriodo } from '@/lib/fiscal/servidor'

/** Guarda régimen, modelos y días de aviso (solo propietario/administrador). */
export async function guardarConfigFiscal(datos: Partial<ConfigFiscal>) {
    try {
        const ctx = await requirePermiso('ajustes')
        const ids = new Set(MODELOS.map(m => m.id))
        const modelos = Object.fromEntries(Object.entries(datos.modelos || {}).filter(([k, v]) => ids.has(k as any) && typeof v === 'boolean'))
        const cfg = configFiscal({ ...datos, modelos })
        const { error } = await ctx.supabase.from('empresas').update({ fiscal: cfg }).eq('id', ctx.empresaId)
        if (error) throw new Error(error.message)
        await auditar(ctx, 'fiscal_configurado', { tipo: 'empresa', id: ctx.empresaId }, cfg as any)
        revalidatePath('/fiscal'); revalidatePath('/')
        return { success: true as const, cfg }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/** «Ya se lo he entregado al asesor»: apaga el aviso de ese periodo (web y Telegram). */
export async function marcarEntregado(clave: string, periodo: string) {
    try {
        const ctx = await requirePermiso('fiscal')
        if (!periodoFiscal(periodo) || !clave.startsWith(periodo + '|')) throw new Error('Periodo no válido.')
        const { error } = await ctx.supabase.from('fiscal_entregas').upsert({ empresa_id: ctx.empresaId, clave, periodo, usuario_id: ctx.userId, usuario_nombre: ctx.nombre, entregado_at: new Date().toISOString() }, { onConflict: 'empresa_id,clave' })
        if (error) throw new Error(error.message)
        await auditar(ctx, 'fiscal_entregado_asesor', { tipo: 'periodo_fiscal', ref: clave })
        revalidatePath('/fiscal'); revalidatePath('/')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function desmarcarEntregado(clave: string) {
    try {
        const ctx = await requirePermiso('fiscal')
        const { error } = await ctx.supabase.from('fiscal_entregas').delete().eq('clave', clave)
        if (error) throw new Error(error.message)
        await auditar(ctx, 'fiscal_entrega_deshecha', { tipo: 'periodo_fiscal', ref: clave })
        revalidatePath('/fiscal'); revalidatePath('/')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/** Deja constancia de cada paquete generado (quién, cuándo, totales y huella). */
export async function registrarExportacion(p: { periodo: string; destino: 'carpeta' | 'zip'; numArchivos: number; huella: string }) {
    try {
        const ctx = await requirePermiso('fiscal')
        const { libros } = await librosDelPeriodo(ctx, p.periodo)
        const totales = { ...libros.totales, iva: libros.modelo303, huella: String(p.huella || '').slice(0, 64) }
        const { error } = await ctx.supabase.from('fiscal_exportaciones').insert({
            empresa_id: ctx.empresaId, periodo: p.periodo, destino: p.destino === 'carpeta' ? 'carpeta' : 'zip',
            num_emitidas: libros.emitidas.length, num_recibidas: libros.recibidas.length, num_archivos: Math.max(0, Math.round(Number(p.numArchivos) || 0)),
            totales, anomalias: libros.anomalias.length, usuario_id: ctx.userId, usuario_nombre: ctx.nombre,
        })
        if (error) throw new Error(error.message)
        await auditar(ctx, 'fiscal_paquete_generado', { tipo: 'periodo_fiscal', ref: p.periodo }, { destino: p.destino, archivos: p.numArchivos, huella: totales.huella })
        revalidatePath('/fiscal')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

import 'server-only'
import type { Contexto } from '@/lib/auth'

/**
 * Registra una acción en la tabla de auditoría (no se puede editar ni borrar
 * desde la app). Nunca bloquea la operación principal si falla el registro.
 */
export async function auditar(
    ctx: Contexto,
    accion: string,
    entidad: { tipo: string; id?: string | null; ref?: string | null },
    detalle?: Record<string, unknown>
) {
    try {
        await ctx.supabase.from('auditoria').insert({
            empresa_id: ctx.empresaId,
            usuario_id: ctx.userId,
            usuario_nombre: ctx.nombre,
            origen: ctx.origen,
            accion,
            entidad: entidad.tipo,
            entidad_id: entidad.id || null,
            entidad_ref: entidad.ref || null,
            detalle: detalle || null,
        })
    } catch (e) {
        console.warn('No se pudo registrar auditoría:', accion, e)
    }
}

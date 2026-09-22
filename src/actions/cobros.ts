'use server'

import { revalidatePath } from 'next/cache'
import { getContexto, requirePermiso, mensajeError } from '@/lib/auth'
import { tienePermiso } from '@/lib/permisos'
import { registrarCobro, resumenCobros, borradorReclamacion, anularCobro, confirmarCobroPropuesto, CAMPOS_FACTURA_COBRO, conInfo } from '@/lib/cobros/servidor'
import { enviarDocumentoPorCorreo, emailsDeCliente } from '@/lib/documentos/servidor'
import { auditar } from '@/lib/auditoria'
import { notificarCobroTelegram } from '@/lib/telegram/notificaciones'
import { hoyISO } from '@/lib/cobros/vencimientos'
import { urlProtegida } from '@/lib/archivos-servidor'

function refrescar() {
    revalidatePath('/')
    revalidatePath('/facturas')
    revalidatePath('/cobros')
    revalidatePath('/agenda')
}

export async function registrarCobroAction(input: {
    facturaId: string
    importe?: number | null
    fecha?: string | null
    metodo?: string | null
    referencia?: string | null
    nota?: string | null
    justificantePath?: string | null
    idempotencyKey?: string | null
}) {
    try {
        const ctx = await getContexto()
        const res = await registrarCobro(ctx, input)
        if (!res.duplicado) {
            notificarCobroTelegram(ctx, res).catch(e => console.warn('Aviso Telegram de cobro:', e))
        }
        refrescar()
        return { success: true as const, ...res }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function getResumenCobrosAction() {
    try {
        const ctx = await getContexto()
        if (!tienePermiso(ctx.rol, 'economico') && !tienePermiso(ctx.rol, 'ver')) throw new Error('Sin permiso')
        const r = await resumenCobros(ctx)
        return { success: true as const, data: r, puedeCobrar: tienePermiso(ctx.rol, 'cobros'), puedeVerEconomico: tienePermiso(ctx.rol, 'economico') }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function getFacturaCobroAction(facturaId: string) {
    try {
        const ctx = await getContexto()
        const [{ data: f }, { data: cobros }, { data: historial }] = await Promise.all([
            ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).eq('id', facturaId).maybeSingle(),
            ctx.supabase.from('cobros').select('*').eq('factura_id', facturaId).order('created_at', { ascending: false }),
            ctx.supabase.from('notificaciones_historial').select('id, created_at, asunto, destinatario, tipo_documento, usuario_nombre, resultado, motivo').eq('documento_id', facturaId).order('created_at', { ascending: false }).limit(20),
        ])
        if (!f) throw new Error('Factura no encontrada')
        return { success: true as const, factura: conInfo(f), cobros: cobros || [], historial: historial || [], puedeCobrar: tienePermiso(ctx.rol, 'cobros') }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function anularCobroAction(cobroId: string, motivo?: string) {
    try {
        const ctx = await getContexto()
        await anularCobro(ctx, cobroId, motivo)
        refrescar()
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function confirmarCobroPropuestoAction(cobroId: string) {
    try {
        const ctx = await getContexto()
        await confirmarCobroPropuesto(ctx, cobroId)
        refrescar()
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function getBorradorReclamacionAction(facturaId: string) {
    try {
        const ctx = await requirePermiso('cobros')
        const b = await borradorReclamacion(ctx, facturaId)
        const destinatarios = await emailsDeCliente(ctx, b.factura.cliente_id, b.factura.cliente_email)
        return { success: true as const, ...b, destinatarios }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/** Envía la reclamación tras la confirmación explícita en el modal. */
export async function enviarReclamacionAction(input: { facturaId: string; destinatarios: string[]; cc?: string[]; asunto: string; cuerpo: string }) {
    try {
        const ctx = await requirePermiso('cobros')
        const res = await enviarDocumentoPorCorreo(ctx, {
            tipo: 'factura',
            documentoId: input.facturaId,
            destinatarios: input.destinatarios,
            cc: input.cc,
            asunto: input.asunto,
            cuerpo: input.cuerpo,
            motivo: 'reclamacion',
        })
        const { data: f } = await ctx.supabase.from('facturas').select('reminder_count').eq('id', input.facturaId).maybeSingle()
        await ctx.supabase.from('facturas').update({ last_reminder_at: new Date().toISOString(), reminder_count: (f?.reminder_count || 0) + 1 }).eq('id', input.facturaId)
        refrescar()
        return { success: true as const, ...res }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/** Cambia a mano la fecha de vencimiento (queda marcada como manual y auditada). */
export async function cambiarVencimientoAction(facturaId: string, fecha: string | null) {
    try {
        const ctx = await getContexto()
        if (!tienePermiso(ctx.rol, 'cobros') && !tienePermiso(ctx.rol, 'documentos')) throw new Error('No tienes permiso para cambiar vencimientos.')
        const { data: antes } = await ctx.supabase.from('facturas').select('numero, fecha_vencimiento').eq('id', facturaId).maybeSingle()
        const { error } = await ctx.supabase.from('facturas').update({ fecha_vencimiento: fecha || null, vencimiento_manual: true }).eq('id', facturaId)
        if (error) throw error
        await auditar(ctx, 'vencimiento_cambiado', { tipo: 'factura', id: facturaId, ref: antes?.numero }, { antes: antes?.fecha_vencimiento, despues: fecha })
        refrescar()
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/**
 * Aviso emergente al entrar: devuelve las facturas vencidas o que vencen hoy
 * solo si hay algo nuevo desde la última vez que se mostró hoy.
 */
export async function getAvisoCobrosAction(forzar = false) {
    try {
        const ctx = await getContexto()
        if (!tienePermiso(ctx.rol, 'economico')) return { success: true as const, mostrar: false }
        const r = await resumenCobros(ctx)
        const lista = [...r.vencidas, ...r.venceHoy]
        if (lista.length === 0) return { success: true as const, mostrar: false }

        const hoy = hoyISO()
        const firma = hoy + ':' + lista.map(f => f.id).sort().join(',')
        const { data: visto } = await ctx.supabase.from('avisos_mostrados').select('firma').eq('usuario_id', ctx.userId).eq('clave', 'cobros').maybeSingle()

        // Se muestra una vez al día, o de nuevo si aparecen facturas vencidas nuevas.
        const idsVistos = new Set((visto?.firma || '').split(':')[1]?.split(',') || [])
        const hayNuevas = lista.some(f => !idsVistos.has(f.id))
        const mostrar = forzar || !visto || !visto.firma?.startsWith(hoy) || hayNuevas

        return {
            success: true as const,
            mostrar,
            firma,
            total: r.vencidoTotal + r.venceHoy.reduce((a, f) => a + f.info.pendiente, 0),
            vencidas: r.vencidas.length,
            venceHoy: r.venceHoy.length,
            facturas: lista.slice(0, 6).map(f => ({ id: f.id, numero: f.numero, cliente: f.cliente_razon_social, pendiente: f.info.pendiente, etiqueta: f.info.etiqueta, visual: f.info.visual })),
            restantes: Math.max(0, lista.length - 6),
        }
    } catch (e) {
        return { success: false as const, error: mensajeError(e), mostrar: false }
    }
}

export async function marcarAvisoCobrosVistoAction(firma: string) {
    try {
        const ctx = await getContexto()
        await ctx.supabase.from('avisos_mostrados').upsert({ usuario_id: ctx.userId, empresa_id: ctx.empresaId, clave: 'cobros', firma, mostrado_at: new Date().toISOString() })
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/** Sube un justificante de pago al almacenamiento privado y devuelve su ruta. */
export async function subirJustificanteAction(formData: FormData) {
    try {
        const ctx = await getContexto()
        const file = formData.get('file') as File | null
        if (!file || file.size === 0) throw new Error('No se ha recibido ningún archivo.')
        if (file.size > 10 * 1024 * 1024) throw new Error('El archivo supera 10 MB.')
        const permitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
        if (!permitidos.includes(file.type)) throw new Error('Formato no permitido. Usa JPG, PNG, WEBP, HEIC o PDF.')
        const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
        const path = `${ctx.empresaId}/cobros/${hoyISO()}-${crypto.randomUUID()}.${ext}`
        const { error } = await ctx.supabase.storage.from('justificantes').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
        if (error) throw error
        return { success: true as const, path: urlProtegida('justificantes', path) }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

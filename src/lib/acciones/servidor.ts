import 'server-only'
import type { Contexto } from '@/lib/auth'
import { assertPermiso, ErrorPermiso } from '@/lib/auth'
import { tienePermiso } from '@/lib/permisos'
import { formatCurrency } from '@/lib/utils'
import { enviarDocumentoPorCorreo, NOMBRE, type TipoDocumento } from '@/lib/documentos/servidor'
import { registrarCobro } from '@/lib/cobros/servidor'
import { crearGasto } from '@/lib/gastos/servidor'
import { etiquetaMetodo } from '@/lib/cobros/vencimientos'
import { getNextSequenceNumber } from '@/lib/sequences'
import { auditar } from '@/lib/auditoria'
import { notificarCobroTelegram } from '@/lib/telegram/notificaciones'

/**
 * ACCIONES PENDIENTES DE CONFIRMACIÓN
 *
 * Todo lo que tiene efecto real (enviar un correo, registrar un cobro, crear
 * un gasto o un presupuesto) se hace en dos pasos:
 *   1. La IA / Telegram / la web PREPARA la acción: se guarda en
 *      acciones_pendientes exactamente qué se va a hacer, con qué datos.
 *   2. El usuario CONFIRMA (botón o "sí" inmediato) y el servidor ejecuta esos
 *      datos guardados, no lo que diga el modelo en ese momento.
 * Una acción solo se ejecuta una vez (cambio de estado atómico), caduca a los
 * 30 minutos y solo la puede confirmar el usuario que la creó.
 */

export type TipoAccion = 'email_documento' | 'reclamacion' | 'cobro' | 'gasto' | 'presupuesto'

export interface Accion {
    id: string
    tipo: TipoAccion
    resumen: string
    payload: any
    estado: string
    expira_at: string
    usuario_id: string
}

export async function crearAccion(ctx: Contexto, tipo: TipoAccion, payload: any, resumen: string): Promise<Accion> {
    // Solo una acción pendiente por usuario y tipo: la nueva sustituye a la anterior.
    await ctx.supabase.from('acciones_pendientes')
        .update({ estado: 'cancelada', resuelta_at: new Date().toISOString() })
        .eq('usuario_id', ctx.userId).eq('tipo', tipo).eq('estado', 'pendiente')

    const { data, error } = await ctx.supabase.from('acciones_pendientes').insert({
        empresa_id: ctx.empresaId,
        usuario_id: ctx.userId,
        tipo,
        payload,
        resumen,
        origen: ctx.origen,
    }).select('*').single()
    if (error) throw new Error('No se pudo preparar la acción: ' + error.message)
    return data
}

export async function getAccion(ctx: Contexto, id: string): Promise<Accion | null> {
    const { data } = await ctx.supabase.from('acciones_pendientes').select('*').eq('id', id).eq('usuario_id', ctx.userId).maybeSingle()
    return data
}

export async function actualizarPayload(ctx: Contexto, id: string, cambios: Record<string, any>): Promise<Accion | null> {
    const a = await getAccion(ctx, id)
    if (!a || a.estado !== 'pendiente') return null
    const payload = { ...a.payload, ...cambios }
    const resumen = describirAccion(a.tipo, payload)
    await ctx.supabase.from('acciones_pendientes').update({ payload, resumen, expira_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }).eq('id', id)
    return { ...a, payload, resumen }
}

/** Última acción pendiente y vigente del usuario (para confirmar con un "sí"). */
export async function ultimaAccionPendiente(ctx: Contexto): Promise<Accion | null> {
    const { data } = await ctx.supabase.from('acciones_pendientes')
        .select('*').eq('usuario_id', ctx.userId).eq('estado', 'pendiente')
        .gt('expira_at', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
    return data
}

export async function cancelarAccion(ctx: Contexto, id: string) {
    await ctx.supabase.from('acciones_pendientes')
        .update({ estado: 'cancelada', resuelta_at: new Date().toISOString() })
        .eq('id', id).eq('usuario_id', ctx.userId).eq('estado', 'pendiente')
}

export interface ResultadoAccion {
    ok: boolean
    mensaje: string
    yaEjecutada?: boolean
    datos?: any
}

/** Ejecuta una acción confirmada. Idempotente: un segundo clic no repite nada. */
export async function ejecutarAccion(ctx: Contexto, id: string): Promise<ResultadoAccion> {
    const accion = await getAccion(ctx, id)
    if (!accion) return { ok: false, mensaje: 'Esta acción no existe o no es tuya.' }
    if (accion.estado === 'confirmada') return { ok: true, yaEjecutada: true, mensaje: 'Esta acción ya se había ejecutado. No se ha repetido.' }
    if (accion.estado !== 'pendiente') return { ok: false, mensaje: `Esta acción ya no está disponible (${accion.estado}).` }
    if (new Date(accion.expira_at) < new Date()) {
        await ctx.supabase.from('acciones_pendientes').update({ estado: 'caducada' }).eq('id', id)
        return { ok: false, mensaje: 'Esta confirmación ha caducado (30 min). Vuelve a pedirlo y te preparo una nueva.' }
    }

    // Bloqueo atómico: solo una petición pasa de 'pendiente' a 'ejecutando'.
    const { data: bloqueada } = await ctx.supabase.from('acciones_pendientes')
        .update({ estado: 'ejecutando' }).eq('id', id).eq('estado', 'pendiente').select('id')
    if (!bloqueada || bloqueada.length === 0) return { ok: true, yaEjecutada: true, mensaje: 'Esta acción ya se está procesando.' }

    try {
        const r = await ejecutarSegunTipo(ctx, accion)
        await ctx.supabase.from('acciones_pendientes').update({ estado: 'confirmada', resultado: r.datos || { mensaje: r.mensaje }, resuelta_at: new Date().toISOString() }).eq('id', id)
        return r
    } catch (e: any) {
        const msg = e instanceof ErrorPermiso ? e.message : (e?.message || 'Error inesperado')
        // Si falla, vuelve a quedar pendiente para poder corregir y reintentar.
        await ctx.supabase.from('acciones_pendientes').update({ estado: 'pendiente', resultado: { error: msg } }).eq('id', id)
        return { ok: false, mensaje: '❌ ' + msg }
    }
}

async function ejecutarSegunTipo(ctx: Contexto, a: Accion): Promise<ResultadoAccion> {
    const p = a.payload
    switch (a.tipo) {
        case 'email_documento':
        case 'reclamacion': {
            if (a.tipo === 'reclamacion') assertPermiso(ctx, 'cobros')
            const r = await enviarDocumentoPorCorreo(ctx, {
                tipo: p.tipo as TipoDocumento,
                documentoId: p.documentoId,
                destinatarios: p.destinatarios,
                cc: p.cc,
                asunto: p.asunto,
                cuerpo: p.cuerpo,
                motivo: a.tipo === 'reclamacion' ? 'reclamacion' : 'envio',
            })
            if (a.tipo === 'reclamacion') {
                const { data: f } = await ctx.supabase.from('facturas').select('reminder_count').eq('id', p.documentoId).maybeSingle()
                await ctx.supabase.from('facturas').update({ last_reminder_at: new Date().toISOString(), reminder_count: (f?.reminder_count || 0) + 1 }).eq('id', p.documentoId)
            }
            return {
                ok: true,
                mensaje: `✅ Correo enviado a ${r.destinatarios.join(', ')} con ${NOMBRE[p.tipo as TipoDocumento].toLowerCase()} ${r.numero} en PDF adjunto. Queda registrado en el historial de correos.`,
                datos: r,
            }
        }
        case 'cobro': {
            const r = await registrarCobro(ctx, {
                facturaId: p.facturaId,
                importe: p.importe ?? null,
                fecha: p.fecha || null,
                metodo: p.metodo || null,
                nota: p.nota || null,
                referencia: p.referencia || null,
                justificantePath: p.justificante || null,
                idempotencyKey: `accion-${a.id}`,
            })
            if (!r.duplicado) notificarCobroTelegram(ctx, r).catch(() => { })
            const f = r.factura
            if (r.estado === 'propuesto') {
                return { ok: true, mensaje: `📨 Tu rol no permite confirmar cobros, así que he registrado una PROPUESTA de cobro de ${formatCurrency(r.importe)} para ${f.numero}. Administración la revisará.`, datos: { estado: r.estado } }
            }
            const estadoTxt = f.info.estado === 'pagada' ? 'PAGADA ✅' : `parcialmente pagada (pendiente ${formatCurrency(f.info.pendiente)})`
            return {
                ok: true,
                mensaje: `✅ Cobro de ${formatCurrency(r.importe)} registrado en ${f.numero}${p.metodo ? ` (${etiquetaMetodo(p.metodo)})` : ''}. La factura queda ${estadoTxt}.`,
                datos: { importe: r.importe, estado: f.info.estado, pendiente: f.info.pendiente },
            }
        }
        case 'gasto': {
            if (p.iva_porcentaje === null || p.iva_porcentaje === undefined) {
                if (!(Number(p.base_imponible) > 0 && p.iva_importe !== null && p.iva_importe !== undefined)) {
                    throw new Error('Falta el IVA del gasto. Indícalo antes de confirmar.')
                }
            }
            const g = await crearGasto(ctx, { ...p, origen: ctx.origen === 'telegram' ? 'telegram' : 'ia', revisado: !!p.categoria })
            return { ok: true, mensaje: `✅ Gasto ${g.numero} guardado: ${g.proveedor} · ${formatCurrency(Number(g.total))}${g.categoria ? ` · ${g.categoria}` : ''}.`, datos: { id: g.id, numero: g.numero } }
        }
        case 'presupuesto': {
            assertPermiso(ctx, 'presupuestos')
            const { data: contacto } = await ctx.supabase.from('contactos').select('*').eq('id', p.clienteId).maybeSingle()
            if (!contacto) throw new Error('El cliente ya no existe.')
            const numero = await getNextSequenceNumber('presupuesto', ctx.supabase)
            const { data: ins, error } = await ctx.supabase.from('presupuestos').insert({
                empresa_id: ctx.empresaId,
                numero,
                fecha: new Date().toISOString().slice(0, 10),
                fecha_validez: p.fecha_validez || null,
                cliente_id: contacto.id,
                cliente_razon_social: contacto.razon_social,
                cliente_cif: contacto.cif,
                cliente_direccion: contacto.direccion,
                cliente_telefono: contacto.telefono,
                cliente_email: contacto.email,
                cliente_codigo_postal: contacto.codigo_postal,
                cliente_ciudad: contacto.ciudad,
                cliente_provincia: contacto.provincia,
                lineas: p.lineas,
                subtotal: p.base,
                base_imponible: p.base,
                iva_porcentaje: p.ivaPct,
                iva_importe: p.ivaImporte,
                total: p.total,
                observaciones: p.observaciones || null,
                statuses: ['pendiente'],
                estado_vida: 'Pendiente',
                estado: 'borrador',
            }).select('id, numero, total').single()
            if (error) throw new Error('No se pudo crear el presupuesto: ' + error.message)
            await ctx.supabase.from('document_status').insert({ document_type: 'presupuesto', document_id: ins.id, status: 'pendiente', created_by: ctx.nombre })
            await auditar(ctx, 'documento_creado', { tipo: 'presupuesto', id: ins.id, ref: ins.numero }, { total: ins.total, cliente: contacto.razon_social, origen: 'ia' })
            return { ok: true, mensaje: `✅ Presupuesto ${ins.numero} creado en borrador para ${contacto.razon_social} por ${formatCurrency(Number(ins.total))}. No se ha enviado a nadie: revísalo en el ERP.`, datos: ins }
        }
    }
    return { ok: false, mensaje: 'Tipo de acción desconocido.' }
}

/** Texto de confirmación que ve el usuario antes de pulsar "Confirmar". */
export function describirAccion(tipo: TipoAccion, p: any): string {
    switch (tipo) {
        case 'email_documento':
            return `📧 Enviar ${NOMBRE[p.tipo as TipoDocumento]?.toLowerCase()} ${p.numero} (${p.cliente})\n` +
                `Para: ${(p.destinatarios || []).join(', ')}${p.cc?.length ? `\nCC: ${p.cc.join(', ')}` : ''}\n` +
                `Asunto: ${p.asunto}\nAdjunto: PDF de ${p.numero}\n\n${p.cuerpo}`
        case 'reclamacion':
            return `📧 Reclamar pago de ${p.numero} (${p.cliente})\nPendiente: ${formatCurrency(p.pendiente)} · ${p.etiqueta}\n` +
                `Para: ${(p.destinatarios || []).join(', ')}\nAsunto: ${p.asunto}\n\n${p.cuerpo}`
        case 'cobro': {
            const esTotal = p.importe === null || p.importe === undefined || Math.abs(Number(p.importe) - Number(p.pendiente)) < 0.01
            return `💰 Factura ${p.numero}\nCliente: ${p.cliente}\n\nTotal: ${formatCurrency(p.total)}\nCobrado hasta ahora: ${formatCurrency(p.cobrado)}\nPendiente: ${formatCurrency(p.pendiente)}\n\n` +
                (esTotal ? `¿Confirmas que se ha cobrado el importe pendiente de ${formatCurrency(p.pendiente)}?` : `¿Confirmas un pago parcial de ${formatCurrency(p.importe)}? Quedarían pendientes ${formatCurrency(Number(p.pendiente) - Number(p.importe))}.`) +
                `\nMétodo: ${p.metodo ? etiquetaMetodo(p.metodo) : 'sin indicar'}${p.justificante ? '\n📎 Justificante adjunto' : ''}`
        }
        case 'gasto':
            return `🧾 Nuevo gasto\nProveedor: ${p.proveedor || 'sin identificar'}\nFecha: ${p.fecha || 'hoy'}\nConcepto: ${p.concepto || '—'}\n` +
                `Base: ${p.base_imponible != null ? formatCurrency(Number(p.base_imponible)) : '—'} · IVA: ${p.iva_porcentaje != null ? p.iva_porcentaje + '%' : 'sin indicar'}` +
                `${p.iva_importe != null ? ` (${formatCurrency(Number(p.iva_importe))})` : ''}\nTotal: ${formatCurrency(Number(p.total) || 0)}\nCategoría: ${p.categoria || 'sin clasificar'}${p.archivo_url ? '\n📎 Documento original guardado' : ''}`
        case 'presupuesto':
            return `📄 Presupuesto (borrador) para ${p.cliente}\n` +
                (p.lineas || []).map((l: any) => `• ${l.descripcion}: ${l.cantidad} × ${formatCurrency(l.precio_unitario)}`).join('\n') +
                `\nBase: ${formatCurrency(p.base)} · IVA ${p.ivaPct}%: ${formatCurrency(p.ivaImporte)}\nTotal: ${formatCurrency(p.total)}`
    }
    return ''
}

export function puedeConfirmarCobro(ctx: Contexto) {
    return tienePermiso(ctx.rol, 'cobros')
}

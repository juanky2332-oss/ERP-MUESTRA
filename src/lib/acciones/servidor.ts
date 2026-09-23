import 'server-only'
import type { Contexto } from '@/lib/auth'
import { assertPermiso, ErrorPermiso } from '@/lib/auth'
import { tienePermiso } from '@/lib/permisos'
import { formatCurrency } from '@/lib/utils'
import { enviarDocumentoPorCorreo, pdfDeDocumento, nombreArchivo, TABLA, NOMBRE, type TipoDocumento } from '@/lib/documentos/servidor'
import { enviarCorreo, getEmpresa, registrarEnvio } from '@/lib/email/mailer'
import { registrarCobro } from '@/lib/cobros/servidor'
import { crearGasto } from '@/lib/gastos/servidor'
import { etiquetaMetodo } from '@/lib/cobros/vencimientos'
import { getNextSequenceNumber } from '@/lib/sequences'
import { auditar } from '@/lib/auditoria'
import { notificarCobroTelegram } from '@/lib/telegram/notificaciones'
import { crearDocumento } from '@/lib/documentos/crear'
import { registrarFirmado, etiquetaTipo } from '@/lib/firmados/servidor'

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

export type TipoAccion = 'email_documento' | 'email_libre' | 'reclamacion' | 'cobro' | 'gasto' | 'presupuesto' | 'documento' | 'convertir' | 'estado_presupuesto' | 'firmado'

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
        case 'email_libre': {
            assertPermiso(ctx, 'enviar')
            // Solo se adjunta lo que quedó en la acción (y eso solo entra si el usuario lo pidió).
            const adjuntos = []
            for (const a of (p.adjuntos || []) as { tipo: TipoDocumento; documentoId: string }[]) {
                const { data: doc } = await ctx.supabase.from(TABLA[a.tipo]).select('*').eq('id', a.documentoId).maybeSingle()
                if (!doc) throw new Error('Uno de los documentos a adjuntar ya no existe.')
                adjuntos.push({ filename: nombreArchivo(doc, a.tipo), content: await pdfDeDocumento(doc, a.tipo, ctx), contentType: 'application/pdf' })
            }
            const empresa = await getEmpresa(ctx)
            const res = await enviarCorreo({ to: p.destinatarios, cc: p.cc, subject: p.asunto, cuerpo: p.cuerpo, attachments: adjuntos }, empresa)
            await registrarEnvio(ctx, {
                destinatario: res.cc.length ? `${res.to.join(', ')} (CC: ${res.cc.join(', ')})` : res.to.join(', '),
                tipo_documento: p.tipoDestinatario === 'proveedor' ? 'Correo a proveedor' : 'Correo',
                numero_documento: (p.adjuntos || []).map((a: any) => a.numero).join(', ') || null,
                asunto: p.asunto,
                mensaje: p.cuerpo,
                motivo: 'correo',
            })
            await auditar(ctx, 'correo_enviado', { tipo: p.tipoDestinatario || 'correo', ref: p.destinatarioNombre || res.to.join(', ') }, { to: res.to, asunto: p.asunto, adjuntos: adjuntos.map(a => a.filename) })
            return { ok: true, mensaje: `✅ Correo enviado a ${res.to.join(', ')}${adjuntos.length ? ` con ${adjuntos.map(a => a.filename).join(', ')}` : ' (sin adjuntos)'}. Queda registrado en el historial de correos.`, datos: { to: res.to } }
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
        case 'documento': {
            // Albarán o factura nuevos para un cliente (mismo alta que la web)
            const { data: c } = await ctx.supabase.from('contactos').select('*').eq('id', p.clienteId).maybeSingle()
            if (!c) throw new Error('El cliente ya no existe.')
            const doc = await crearDocumento(ctx, {
                empresa_id: ctx.empresaId, fecha: new Date().toISOString().slice(0, 10),
                cliente_id: c.id, cliente_razon_social: c.razon_social, cliente_cif: c.cif, cliente_direccion: c.direccion, cliente_telefono: c.telefono,
                cliente_email: c.email_facturacion || c.email, cliente_codigo_postal: c.codigo_postal, cliente_ciudad: c.ciudad, cliente_provincia: c.provincia,
                pedido_referencia: p.pedido_referencia || null, lineas: p.lineas, subtotal: p.base, base_imponible: p.base,
                iva_porcentaje: p.ivaPct, iva_importe: p.ivaImporte, total: p.total, observaciones: p.observaciones || null,
            }, p.tipoDoc)
            return { ok: true, mensaje: `✅ ${NOMBRE[p.tipoDoc as TipoDocumento]} ${doc.numero} creado para ${c.razon_social} por ${formatCurrency(Number(doc.total))}.${p.tipoDoc === 'factura' && doc.fecha_vencimiento ? ` Vence el ${new Date(doc.fecha_vencimiento).toLocaleDateString('es-ES')}.` : ''} No se ha enviado a nadie.`, datos: { id: doc.id, numero: doc.numero, tipo: p.tipoDoc } }
        }
        case 'convertir': {
            // Presupuesto → albarán, albarán → factura (o presupuesto → factura)
            const { data: o } = await ctx.supabase.from(TABLA[p.origenTipo as TipoDocumento]).select('*').eq('id', p.origenId).maybeSingle()
            if (!o) throw new Error('El documento de origen ya no existe.')
            const campos = ['cliente_id', 'cliente_razon_social', 'cliente_cif', 'cliente_direccion', 'cliente_telefono', 'cliente_email', 'cliente_codigo_postal', 'cliente_ciudad', 'cliente_provincia', 'pedido_referencia', 'lineas', 'subtotal', 'base_imponible', 'iva_porcentaje', 'iva_importe', 'total', 'observaciones']
            const datos: any = { empresa_id: ctx.empresaId, fecha: new Date().toISOString().slice(0, 10) }
            for (const k of campos) if (o[k] !== undefined) datos[k] = o[k]
            if (p.origenTipo === 'presupuesto' && p.destino === 'factura') datos.presupuesto_id = o.id
            else { datos.source_document_id = o.id; datos.source_document_type = p.origenTipo }
            const doc = await crearDocumento(ctx, datos, p.destino)
            if (p.origenTipo === 'presupuesto') await ctx.supabase.from('presupuestos').update({ aceptado: true, rechazado: false }).eq('id', o.id)
            return { ok: true, mensaje: `✅ ${NOMBRE[p.origenTipo as TipoDocumento]} ${o.numero} convertido en ${NOMBRE[p.destino as TipoDocumento].toLowerCase()} ${doc.numero} (${formatCurrency(Number(doc.total))}).${p.firmado ? ' La firma del albarán queda unida a la factura.' : ''}`, datos: { id: doc.id, numero: doc.numero, tipo: p.destino } }
        }
        case 'estado_presupuesto': {
            assertPermiso(ctx, 'presupuestos')
            const { error } = await ctx.supabase.from('presupuestos').update(p.aceptado ? { aceptado: true, rechazado: false } : { aceptado: false, rechazado: true }).eq('id', p.presupuestoId)
            if (error) throw new Error(error.message)
            await auditar(ctx, p.aceptado ? 'presupuesto_aceptado' : 'presupuesto_rechazado', { tipo: 'presupuesto', id: p.presupuestoId, ref: p.numero })
            return { ok: true, mensaje: `✅ Presupuesto ${p.numero} marcado como ${p.aceptado ? 'ACEPTADO' : 'RECHAZADO'}.`, datos: { id: p.presupuestoId } }
        }
        case 'firmado': {
            assertPermiso(ctx, 'documentos')
            const d = p.destino
            await registrarFirmado(ctx, { archivo_url: p.archivo_url, archivo_nombre: p.archivo_nombre, archivo_tipo: p.archivo_tipo, datos: p.datos || {}, albaran_id: d?.tipo === 'albaran' ? d.id : null, factura_id: d?.tipo === 'factura' ? d.id : null, origen: ctx.origen === 'telegram' ? 'telegram' : 'ia' })
            return { ok: true, mensaje: d ? `✅ ${etiquetaTipo(p.datos?.tipo)} firmado unido a ${d.tipo === 'albaran' ? 'albarán' : 'factura'} ${d.numero}${d.factura_numero ? ` y a su factura ${d.factura_numero}` : ''}. Queda en el expediente.` : `✅ ${etiquetaTipo(p.datos?.tipo)} firmado guardado. Queda pendiente de unir (en la web: Albaranes y partes firmados).`, datos: { destino: d || null } }
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
        case 'email_libre':
            return `📧 Correo a ${p.destinatarioNombre || (p.destinatarios || []).join(', ')}\n` +
                `Para: ${(p.destinatarios || []).join(', ')}${p.cc?.length ? `\nCC: ${p.cc.join(', ')}` : ''}\n` +
                `Asunto: ${p.asunto}\nAdjuntos: ${(p.adjuntos || []).length ? p.adjuntos.map((a: any) => `PDF de ${a.numero}`).join(', ') : 'ninguno'}\n\n${p.cuerpo}`
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
        case 'documento':
            return `${p.tipoDoc === 'factura' ? '🧾 Factura' : '📦 Albarán'} nuevo para ${p.cliente}\n` +
                (p.lineas || []).map((l: any) => `• ${l.descripcion}: ${l.cantidad} × ${formatCurrency(l.precio_unitario)}`).join('\n') +
                `\nBase: ${formatCurrency(p.base)} · IVA ${p.ivaPct}%: ${formatCurrency(p.ivaImporte)}\nTotal: ${formatCurrency(p.total)}${p.pedido_referencia ? `\nSu referencia: ${p.pedido_referencia}` : ''}`
        case 'convertir':
            return `🔁 Convertir ${NOMBRE[p.origenTipo as TipoDocumento]?.toLowerCase()} ${p.origenNumero} (${p.cliente}) en ${NOMBRE[p.destino as TipoDocumento]?.toLowerCase()}\nImporte: ${formatCurrency(Number(p.total) || 0)}${p.firmado ? '\n✍️ El albarán está firmado: la firma pasará a la factura' : ''}`
        case 'estado_presupuesto':
            return `📝 Marcar presupuesto ${p.numero} (${p.cliente}) como ${p.aceptado ? 'ACEPTADO ✅' : 'RECHAZADO ❌'}`
        case 'firmado': {
            const d = p.datos || {}
            return `✍️ ${etiquetaTipo(d.tipo)} firmado${d.numero_documento ? ' ' + d.numero_documento : ''}\nCliente: ${d.cliente || 'sin identificar'}${d.firmante_nombre ? `\nFirmado por: ${d.firmante_nombre}` : ''}${d.fecha_documento ? `\nFecha: ${d.fecha_documento.split('-').reverse().join('/')}` : ''}` +
                `${d.firmado === false ? '\n⚠️ No se ve firma en el documento' : ''}${d.incidencias ? `\n⚠️ Incidencias: ${d.incidencias}` : ''}\n\n` +
                (p.destino ? `Unir a: ${p.destino.tipo === 'albaran' ? 'albarán' : 'factura'} ${p.destino.numero}${p.destino.factura_numero ? ` (y factura ${p.destino.factura_numero})` : ''}` : 'Sin unir (quedará pendiente de unir)')
        }
    }
    return ''
}

export function puedeConfirmarCobro(ctx: Contexto) {
    return tienePermiso(ctx.rol, 'cobros')
}

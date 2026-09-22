'use server'

import { revalidatePath } from 'next/cache'
import { getContexto, assertPermiso, mensajeError } from '@/lib/auth'
import { tienePermiso } from '@/lib/permisos'
import { auditar } from '@/lib/auditoria'
import { CAMPOS_FACTURA_COBRO, conInfo } from '@/lib/cobros/servidor'
import { rangoDiaMadrid } from '@/lib/cobros/vencimientos'

export interface ItemAgenda {
    id: string
    origen: 'evento' | 'vencimiento' | 'presupuesto'
    titulo: string
    tipo: string
    estado: string
    inicio: string          // ISO
    fin?: string | null
    todoElDia: boolean
    fecha: string           // YYYY-MM-DD (Madrid)
    clienteId?: string | null
    clienteNombre?: string | null
    direccion?: string | null
    notas?: string | null
    importe?: number | null
    visual?: string          // para vencimientos: vencida, pronto, pagada...
    etiqueta?: string
    usuarioId?: string | null
    facturaId?: string | null
    presupuestoId?: string | null
    proveedorId?: string | null
}

const fechaMadrid = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

/** Agenda entre dos fechas: eventos + vencimientos de facturas + caducidad de presupuestos. */
export async function listarAgenda(desde: string, hasta: string) {
    try {
        const ctx = await getContexto()
        const r1 = rangoDiaMadrid(desde), r2 = rangoDiaMadrid(hasta)
        const eco = tienePermiso(ctx.rol, 'economico')

        const [{ data: eventos }, { data: facturas }, { data: presus }, { data: usuarios }] = await Promise.all([
            ctx.supabase.from('eventos').select('*, contactos(razon_social)').gte('inicio', r1.desde).lte('inicio', r2.hasta).order('inicio'),
            eco ? ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).gte('fecha_vencimiento', desde).lte('fecha_vencimiento', hasta).or('anulada.is.null,anulada.eq.false') : Promise.resolve({ data: [] as any[] }),
            ctx.supabase.from('presupuestos').select('id, numero, cliente_id, cliente_razon_social, total, fecha_validez, statuses, aceptado, rechazado').gte('fecha_validez', desde).lte('fecha_validez', hasta).eq('aceptado', false).eq('rechazado', false),
            ctx.supabase.from('perfiles').select('user_id, nombre, email'),
        ])

        const items: ItemAgenda[] = []
        for (const e of eventos || []) {
            items.push({
                id: e.id, origen: 'evento', titulo: e.titulo, tipo: e.tipo, estado: e.estado, inicio: e.inicio, fin: e.fin,
                todoElDia: !!e.todo_el_dia, fecha: fechaMadrid(e.inicio), clienteId: e.cliente_id, clienteNombre: e.contactos?.razon_social || null,
                direccion: e.direccion, notas: e.notas, importe: e.importe != null ? Number(e.importe) : null, usuarioId: e.usuario_id,
                facturaId: e.factura_id, presupuestoId: e.presupuesto_id, proveedorId: e.proveedor_id,
            })
        }
        for (const f of facturas || []) {
            const fc = conInfo(f)
            items.push({
                id: 'fac-' + f.id, origen: 'vencimiento', titulo: `Factura ${f.numero}`, tipo: 'vencimiento_factura',
                estado: fc.info.estado, inicio: `${f.fecha_vencimiento}T08:00:00`, todoElDia: true, fecha: f.fecha_vencimiento,
                clienteId: f.cliente_id, clienteNombre: f.cliente_razon_social, importe: fc.info.estado === 'pagada' ? fc.info.total : fc.info.pendiente,
                visual: fc.info.visual, etiqueta: fc.info.etiqueta, facturaId: f.id,
            })
        }
        for (const p of presus || []) {
            if ((p.statuses || []).includes('traspasado')) continue
            items.push({
                id: 'pre-' + p.id, origen: 'presupuesto', titulo: `Caduca presupuesto ${p.numero}`, tipo: 'seguimiento_presupuesto', estado: 'pendiente',
                inicio: `${p.fecha_validez}T08:00:00`, todoElDia: true, fecha: p.fecha_validez, clienteId: p.cliente_id, clienteNombre: p.cliente_razon_social,
                importe: Number(p.total), presupuestoId: p.id,
            })
        }
        items.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.todoElDia === b.todoElDia ? a.inicio.localeCompare(b.inicio) : a.todoElDia ? -1 : 1))
        return { success: true as const, items, usuarios: usuarios || [], yo: ctx.userId, puedeEditar: tienePermiso(ctx.rol, 'agenda') }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function guardarEvento(datos: any) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'agenda')
        if (!datos.titulo?.trim()) throw new Error('El título es obligatorio.')
        if (!datos.inicio) throw new Error('La fecha es obligatoria.')
        const payload: any = {
            titulo: datos.titulo.trim(),
            tipo: datos.tipo || 'cita',
            estado: datos.estado || 'pendiente',
            inicio: new Date(datos.inicio).toISOString(),
            fin: datos.fin ? new Date(datos.fin).toISOString() : null,
            todo_el_dia: !!datos.todo_el_dia,
            cliente_id: datos.cliente_id || null,
            proveedor_id: datos.proveedor_id || null,
            factura_id: datos.factura_id || null,
            presupuesto_id: datos.presupuesto_id || null,
            direccion: datos.direccion?.trim() || null,
            notas: datos.notas?.trim() || null,
            importe: datos.importe ? Number(String(datos.importe).replace(',', '.')) : null,
            usuario_id: datos.usuario_id || ctx.userId,
            updated_at: new Date().toISOString(),
        }
        let antes: any = null
        if (datos.id) antes = (await ctx.supabase.from('eventos').select('inicio, estado').eq('id', datos.id).maybeSingle()).data
        if (antes && antes.inicio !== payload.inicio && payload.estado === antes.estado && antes.estado !== 'completado') payload.estado = 'reprogramado'
        const { data, error } = datos.id
            ? await ctx.supabase.from('eventos').update(payload).eq('id', datos.id).select().single()
            : await ctx.supabase.from('eventos').insert({ ...payload, empresa_id: ctx.empresaId, creado_por: ctx.userId }).select().single()
        if (error) throw error
        await auditar(ctx, datos.id ? (antes?.inicio !== payload.inicio ? 'evento_reprogramado' : 'evento_editado') : 'evento_creado', { tipo: 'evento', id: data.id, ref: data.titulo }, { inicio: data.inicio, estado: data.estado })
        revalidatePath('/agenda')
        return { success: true as const, data }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function cambiarEstadoEvento(id: string, estado: string) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'agenda')
        const { data, error } = await ctx.supabase.from('eventos').update({ estado, updated_at: new Date().toISOString() }).eq('id', id).select('titulo').single()
        if (error) throw error
        await auditar(ctx, `evento_${estado}`, { tipo: 'evento', id, ref: data.titulo })
        revalidatePath('/agenda')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function eliminarEvento(id: string) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'agenda')
        const { data } = await ctx.supabase.from('eventos').select('titulo').eq('id', id).maybeSingle()
        const { error } = await ctx.supabase.from('eventos').delete().eq('id', id)
        if (error) throw error
        await auditar(ctx, 'evento_eliminado', { tipo: 'evento', id, ref: data?.titulo })
        revalidatePath('/agenda')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

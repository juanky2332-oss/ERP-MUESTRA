'use server'

import { revalidatePath } from 'next/cache'
import { getContexto, assertPermiso, mensajeError } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { CAMPOS_FACTURA_COBRO, conInfo } from '@/lib/cobros/servidor'
import { condicionDeCliente, describirCondicion, etiquetaMetodo } from '@/lib/cobros/vencimientos'

const limpio = (v: any) => (typeof v === 'string' ? (v.trim() || null) : v ?? null)

// ─────────────── Proveedores ───────────────

const CAMPOS_PROVEEDOR = ['razon_social', 'cif', 'email', 'telefono', 'direccion', 'codigo_postal', 'ciudad', 'provincia', 'persona_contacto', 'metodo_pago', 'dias_pago', 'condiciones_pago', 'categoria_habitual', 'notas', 'activo'] as const

export async function guardarProveedor(datos: any) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'clientes')
        const payload: any = {}
        for (const k of CAMPOS_PROVEEDOR) if (k in datos) payload[k] = limpio(datos[k])
        if (!payload.razon_social && !datos.id) throw new Error('El nombre del proveedor es obligatorio.')
        if (payload.cif) payload.cif = String(payload.cif).toUpperCase().replace(/[^A-Z0-9]/g, '')
        if (payload.dias_pago != null) payload.dias_pago = Number(payload.dias_pago) || null
        payload.updated_at = new Date().toISOString()

        const q = datos.id
            ? ctx.supabase.from('proveedores').update(payload).eq('id', datos.id).select().single()
            : ctx.supabase.from('proveedores').insert({ ...payload, empresa_id: ctx.empresaId }).select().single()
        const { data, error } = await q
        if (error) throw new Error(error.code === '23505' ? 'Ya existe un proveedor con ese CIF.' : error.message)
        await auditar(ctx, datos.id ? 'proveedor_editado' : 'proveedor_creado', { tipo: 'proveedor', id: data.id, ref: data.razon_social }, payload)
        revalidatePath('/proveedores')
        return { success: true as const, data }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function fichaProveedor(id: string) {
    try {
        const ctx = await getContexto()
        const [{ data: p }, { data: gastos }, { data: productos }] = await Promise.all([
            ctx.supabase.from('proveedores').select('*').eq('id', id).maybeSingle(),
            ctx.supabase.from('gastos').select('id, numero, fecha, concepto, descripcion, categoria, total, archivo_url, factura_url').eq('proveedor_id', id).order('fecha', { ascending: false }).limit(100),
            ctx.supabase.from('catalogo').select('id, nombre, referencia, precio_coste, activo').eq('proveedor_id', id).order('nombre'),
        ])
        if (!p) throw new Error('Proveedor no encontrado')
        const total = (gastos || []).reduce((a: number, g: any) => a + Number(g.total || 0), 0)
        return { success: true as const, proveedor: p, gastos: gastos || [], productos: productos || [], totalCompras: total }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

// ─────────────── Catálogo ───────────────

const CAMPOS_CATALOGO = ['tipo', 'nombre', 'referencia', 'descripcion', 'categoria', 'unidad', 'precio_coste', 'precio_venta', 'iva_porcentaje', 'proveedor_id', 'imagen_url', 'activo', 'notas'] as const

export async function guardarItemCatalogo(datos: any) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'catalogo')
        const payload: any = {}
        for (const k of CAMPOS_CATALOGO) if (k in datos) payload[k] = limpio(datos[k])
        if (!payload.nombre && !datos.id) throw new Error('El nombre es obligatorio.')
        for (const k of ['precio_coste', 'precio_venta', 'iva_porcentaje']) if (k in payload) payload[k] = Number(String(payload[k] ?? 0).replace(',', '.')) || 0
        payload.updated_at = new Date().toISOString()

        let antes: any = null
        if (datos.id) antes = (await ctx.supabase.from('catalogo').select('precio_venta, precio_coste, iva_porcentaje').eq('id', datos.id).maybeSingle()).data
        const q = datos.id
            ? ctx.supabase.from('catalogo').update(payload).eq('id', datos.id).select().single()
            : ctx.supabase.from('catalogo').insert({ ...payload, empresa_id: ctx.empresaId }).select().single()
        const { data, error } = await q
        if (error) throw error
        await auditar(ctx, datos.id ? 'catalogo_editado' : 'catalogo_creado', { tipo: 'catalogo', id: data.id, ref: data.nombre }, antes ? { antes, despues: payload } : payload)
        revalidatePath('/catalogo')
        return { success: true as const, data }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

// ─────────────── Clientes ───────────────

/** Guarda solo las condiciones de pago y datos ampliados de un cliente. */
export async function guardarCondicionesCliente(clienteId: string, datos: any) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'clientes')
        const campos = ['metodo_pago', 'metodo_pago_alternativo', 'condicion_pago_tipo', 'condicion_pago_dias', 'condicion_pago_dia_mes', 'condicion_pago_meses', 'condicion_pago_texto', 'condicion_pago_activa', 'notas_internas', 'referencia', 'email_facturacion', 'persona_contacto']
        const payload: any = {}
        for (const k of campos) if (k in datos) payload[k] = limpio(datos[k])
        for (const k of ['condicion_pago_dias', 'condicion_pago_dia_mes', 'condicion_pago_meses']) if (k in payload && payload[k] != null) payload[k] = Number(payload[k])
        const { error } = await ctx.supabase.from('contactos').update(payload).eq('id', clienteId)
        if (error) throw error
        await auditar(ctx, 'cliente_condiciones_editadas', { tipo: 'cliente', id: clienteId }, payload)
        revalidatePath('/contactos')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function archivarCliente(clienteId: string, archivado: boolean) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'clientes')
        const { data, error } = await ctx.supabase.from('contactos').update({ archivado }).eq('id', clienteId).select('razon_social').single()
        if (error) throw error
        await auditar(ctx, archivado ? 'cliente_archivado' : 'cliente_reactivado', { tipo: 'cliente', id: clienteId, ref: data.razon_social })
        revalidatePath('/contactos')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/** Ficha completa del cliente: resumen económico e historial de todo. */
export async function fichaCliente(clienteId: string) {
    try {
        const ctx = await getContexto()
        const [c, fac, pre, alb, cob, personas, direcciones, eventos] = await Promise.all([
            ctx.supabase.from('contactos').select('*').eq('id', clienteId).maybeSingle(),
            ctx.supabase.from('facturas').select(CAMPOS_FACTURA_COBRO).eq('cliente_id', clienteId).order('fecha', { ascending: false }).limit(200),
            ctx.supabase.from('presupuestos').select('id, numero, fecha, total, statuses, aceptado, rechazado, fecha_validez').eq('cliente_id', clienteId).order('fecha', { ascending: false }).limit(50),
            ctx.supabase.from('albaranes').select('id, numero, fecha, total, statuses').eq('cliente_id', clienteId).order('fecha', { ascending: false }).limit(50),
            ctx.supabase.from('cobros').select('id, fecha, importe, metodo, estado, factura_id, origen').eq('cliente_id', clienteId).neq('estado', 'anulado').order('fecha', { ascending: false }).limit(50),
            ctx.supabase.from('contacto_personas').select('*').eq('cliente_id', clienteId).order('principal', { ascending: false }),
            ctx.supabase.from('contacto_direcciones').select('*').eq('cliente_id', clienteId),
            ctx.supabase.from('eventos').select('id, titulo, inicio, tipo').eq('cliente_id', clienteId).order('inicio', { ascending: false }).limit(1),
        ])
        if (!c.data) throw new Error('Cliente no encontrado')
        const cliente = c.data
        const facturas = (fac.data || []).filter((f: any) => !f.anulada).map((f: any) => conInfo(f))
        const numeros = facturas.map((f: any) => f.numero).concat((pre.data || []).map((p: any) => p.numero))
        const { data: correos } = numeros.length
            ? await ctx.supabase.from('notificaciones_historial').select('id, created_at, asunto, tipo_documento, numero_documento, destinatario').in('numero_documento', numeros).order('created_at', { ascending: false }).limit(30)
            : { data: [] }

        const facturado = facturas.reduce((a: number, f: any) => a + f.info.total, 0)
        const cobrado = facturas.reduce((a: number, f: any) => a + f.info.cobrado, 0)
        const vencidas = facturas.filter((f: any) => f.info.visual === 'vencida')
        const cond = condicionDeCliente(cliente)
        const ultimoContacto = [cliente.ultimo_contacto, correos?.[0]?.created_at, eventos.data?.[0]?.inicio].filter(Boolean).sort().pop() || null

        return {
            success: true as const,
            cliente,
            resumen: {
                facturado: Math.round(facturado * 100) / 100,
                cobrado: Math.round(cobrado * 100) / 100,
                pendiente: Math.round((facturado - cobrado) * 100) / 100,
                vencidas: vencidas.length,
                vencidoImporte: Math.round(vencidas.reduce((a: number, f: any) => a + f.info.pendiente, 0) * 100) / 100,
                metodo: cliente.metodo_pago ? etiquetaMetodo(cliente.metodo_pago) : 'Sin indicar',
                plazo: cliente.condicion_pago_texto || describirCondicion(cond),
                ultimaFactura: facturas[0] ? { numero: facturas[0].numero, fecha: facturas[0].fecha } : null,
                ultimoCobro: cob.data?.[0] || null,
                ultimoContacto,
            },
            facturas,
            presupuestos: pre.data || [],
            albaranes: alb.data || [],
            cobros: cob.data || [],
            correos: correos || [],
            personas: personas.data || [],
            direcciones: direcciones.data || [],
        }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function guardarPersonaContacto(datos: any) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'clientes')
        if (!datos.nombre?.trim()) throw new Error('El nombre es obligatorio.')
        const payload = { cliente_id: datos.cliente_id, nombre: datos.nombre.trim(), cargo: limpio(datos.cargo), email: limpio(datos.email), telefono: limpio(datos.telefono), principal: !!datos.principal, empresa_id: ctx.empresaId }
        const { error } = datos.id
            ? await ctx.supabase.from('contacto_personas').update(payload).eq('id', datos.id)
            : await ctx.supabase.from('contacto_personas').insert(payload)
        if (error) throw error
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function guardarDireccion(datos: any) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'clientes')
        if (!datos.direccion?.trim()) throw new Error('La dirección es obligatoria.')
        const payload = { cliente_id: datos.cliente_id, tipo: datos.tipo || 'envio', direccion: datos.direccion.trim(), codigo_postal: limpio(datos.codigo_postal), ciudad: limpio(datos.ciudad), provincia: limpio(datos.provincia), empresa_id: ctx.empresaId }
        const { error } = datos.id
            ? await ctx.supabase.from('contacto_direcciones').update(payload).eq('id', datos.id)
            : await ctx.supabase.from('contacto_direcciones').insert(payload)
        if (error) throw error
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function eliminarSubregistro(tabla: 'contacto_personas' | 'contacto_direcciones', id: string) {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'clientes')
        if (!['contacto_personas', 'contacto_direcciones'].includes(tabla)) throw new Error('Tabla no válida')
        const { error } = await ctx.supabase.from(tabla).delete().eq('id', id)
        if (error) throw error
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

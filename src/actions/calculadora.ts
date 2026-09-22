'use server'

import { revalidatePath } from 'next/cache'
import { getContexto, assertPermiso, mensajeError } from '@/lib/auth'
import { tienePermiso } from '@/lib/permisos'
import { auditar } from '@/lib/auditoria'
import { obtenerMercado } from '@/lib/calculadora/mercado'
import { MATERIALES, INDICES_REFERENCIA, precioConMercado, type Material } from '@/lib/calculadora/materiales'
import { createDocument } from '@/actions/documents'

/** Configuración de la calculadora de la empresa + cotizaciones de hoy. */
export async function getCalculadora() {
    try {
        const ctx = await getContexto()
        const [{ data: cfg }, mercado, { data: historial }] = await Promise.all([
            ctx.supabase.from('calculadora_config').select('*').eq('empresa_id', ctx.empresaId).maybeSingle(),
            obtenerMercado(),
            ctx.supabase.from('calculos_piezas').select('id, nombre, precio_unidad, cantidad, created_at, entrada, presupuesto_id').order('created_at', { ascending: false }).limit(15),
        ])
        return {
            success: true as const,
            config: cfg || { precios: {}, materiales_extra: [], tarifas: {}, parametros: {} },
            mercado,
            historial: historial || [],
            puedeEditar: ctx.rol !== 'lectura',
            puedePresupuestar: tienePermiso(ctx.rol, 'presupuestos'),
        }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

async function guardarConfig(ctx: any, cambios: Record<string, any>) {
    const { data: actual } = await ctx.supabase.from('calculadora_config').select('*').eq('empresa_id', ctx.empresaId).maybeSingle()
    const fila = { empresa_id: ctx.empresaId, precios: {}, materiales_extra: [], tarifas: {}, parametros: {}, ...(actual || {}), ...cambios, updated_at: new Date().toISOString() }
    const { error } = await ctx.supabase.from('calculadora_config').upsert(fila)
    if (error) throw error
}

/** Precio propio de un material (el de tu proveedor). Guarda la cotización del día para poder actualizarlo luego con el mercado. */
export async function guardarPrecioMaterial(materialId: string, precioKg: number) {
    try {
        const ctx = await getContexto()
        if (ctx.rol === 'lectura') throw new Error('Solo lectura')
        if (!(precioKg > 0) || precioKg > 10000) throw new Error('Precio no válido')
        const { data: actual } = await ctx.supabase.from('calculadora_config').select('precios').eq('empresa_id', ctx.empresaId).maybeSingle()
        const mercado = await obtenerMercado()
        const precios = { ...(actual?.precios || {}), [materialId]: { precioKg: Math.round(precioKg * 100) / 100, indiceRef: { ...INDICES_REFERENCIA, ...Object.fromEntries(Object.entries(mercado.cotizaciones).filter(([, v]) => v)) }, fecha: new Date().toISOString().slice(0, 10) } }
        await guardarConfig(ctx, { precios })
        await auditar(ctx, 'calculadora_precio_material', { tipo: 'material', ref: materialId }, { precioKg })
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/**
 * Actualiza TODOS los precios que siguen una cotización (acero, aluminio,
 * cobre, latón) al mercado de hoy. Solo se mueve la parte del precio que
 * depende del metal.
 */
export async function actualizarPreciosConMercado() {
    try {
        const ctx = await getContexto()
        if (ctx.rol === 'lectura') throw new Error('Solo lectura')
        const mercado = await obtenerMercado()
        if (!Object.values(mercado.cotizaciones).some(Boolean)) throw new Error('No se han podido obtener cotizaciones ahora mismo. Inténtalo más tarde.')
        const { data: actual } = await ctx.supabase.from('calculadora_config').select('precios, materiales_extra').eq('empresa_id', ctx.empresaId).maybeSingle()
        const propios = actual?.precios || {}
        const todos: Material[] = [...MATERIALES, ...((actual?.materiales_extra || []) as Material[])]
        const nuevos: Record<string, any> = { ...propios }
        const cambios: { material: string; antes: number; despues: number }[] = []
        const hoyRef = { ...INDICES_REFERENCIA, ...Object.fromEntries(Object.entries(mercado.cotizaciones).filter(([, v]) => v)) }
        for (const m of todos) {
            if (!m.indice || !m.sensibilidad) continue
            const base = propios[m.id]?.precioKg ?? m.precioKg
            const ref = propios[m.id]?.indiceRef ?? INDICES_REFERENCIA
            const despues = precioConMercado(base, m.indice, m.sensibilidad, mercado.cotizaciones, ref)
            if (Math.abs(despues - base) >= 0.01) cambios.push({ material: m.nombre, antes: base, despues })
            nuevos[m.id] = { precioKg: despues, indiceRef: hoyRef, fecha: new Date().toISOString().slice(0, 10) }
        }
        await guardarConfig(ctx, { precios: nuevos })
        await auditar(ctx, 'calculadora_precios_mercado', { tipo: 'calculadora' }, { cambios: cambios.length, cotizaciones: mercado.cotizaciones })
        return { success: true as const, cambios }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function restablecerPrecioMaterial(materialId: string) {
    try {
        const ctx = await getContexto()
        const { data: actual } = await ctx.supabase.from('calculadora_config').select('precios').eq('empresa_id', ctx.empresaId).maybeSingle()
        const precios = { ...(actual?.precios || {}) }
        delete precios[materialId]
        await guardarConfig(ctx, { precios })
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function guardarTarifasYParametros(tarifas: Record<string, number>, parametros: Record<string, any>) {
    try {
        const ctx = await getContexto()
        if (ctx.rol === 'lectura') throw new Error('Solo lectura')
        await guardarConfig(ctx, { tarifas, parametros })
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function guardarMaterialPropio(m: Material) {
    try {
        const ctx = await getContexto()
        if (ctx.rol === 'lectura') throw new Error('Solo lectura')
        if (!m.nombre?.trim() || !(m.densidad > 0) || !(m.precioKg >= 0)) throw new Error('Nombre, densidad y precio son obligatorios.')
        const { data: actual } = await ctx.supabase.from('calculadora_config').select('materiales_extra').eq('empresa_id', ctx.empresaId).maybeSingle()
        const lista: Material[] = (actual?.materiales_extra || []).filter((x: Material) => x.id !== m.id)
        lista.push({ ...m, id: m.id || 'propio_' + crypto.randomUUID().slice(0, 8), indice: m.indice || null, sensibilidad: Number(m.sensibilidad) || 0, maquinabilidad: Number(m.maquinabilidad) || 1, viruta: Number(m.viruta) || 0 })
        await guardarConfig(ctx, { materiales_extra: lista })
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function eliminarMaterialPropio(id: string) {
    try {
        const ctx = await getContexto()
        const { data: actual } = await ctx.supabase.from('calculadora_config').select('materiales_extra').eq('empresa_id', ctx.empresaId).maybeSingle()
        await guardarConfig(ctx, { materiales_extra: (actual?.materiales_extra || []).filter((x: Material) => x.id !== id) })
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/** Guarda el cálculo en el historial y, si se pide, crea un presupuesto borrador con la línea. */
export async function guardarCalculo(datos: {
    nombre: string
    entrada: any
    resultado: any
    precioUnidad: number
    cantidad: number
    descripcionLinea: string
    crearPresupuesto?: { clienteId: string; ivaPct?: number } | null
    anadirCatalogo?: boolean
}) {
    try {
        const ctx = await getContexto()
        if (ctx.rol === 'lectura') throw new Error('Solo lectura')
        let presupuesto: any = null

        if (datos.crearPresupuesto?.clienteId) {
            assertPermiso(ctx, 'presupuestos')
            const { data: c } = await ctx.supabase.from('contactos').select('*').eq('id', datos.crearPresupuesto.clienteId).maybeSingle()
            if (!c) throw new Error('Cliente no encontrado')
            const iva = datos.crearPresupuesto.ivaPct ?? 21
            const base = Math.round(datos.precioUnidad * datos.cantidad * 100) / 100
            const ivaImporte = Math.round(base * iva) / 100
            const { data: emp } = await ctx.supabase.from('empresas').select('condiciones_presupuesto').eq('id', ctx.empresaId).maybeSingle()
            const r = await createDocument({
                fecha: new Date().toISOString().slice(0, 10),
                fecha_validez: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                cliente_id: c.id, cliente_razon_social: c.razon_social, cliente_cif: c.cif, cliente_direccion: c.direccion,
                cliente_telefono: c.telefono, cliente_email: c.email, cliente_codigo_postal: c.codigo_postal, cliente_ciudad: c.ciudad, cliente_provincia: c.provincia,
                lineas: [{ descripcion: datos.descripcionLinea, cantidad: datos.cantidad, precio_unitario: datos.precioUnidad, importe: base }],
                subtotal: base, base_imponible: base, iva_porcentaje: iva, iva_importe: ivaImporte, total: Math.round((base + ivaImporte) * 100) / 100,
                observaciones: emp?.condiciones_presupuesto || null,
                estado: 'borrador',
            }, 'presupuesto')
            if (!r.success) throw new Error((r.error as any)?.message || 'No se pudo crear el presupuesto')
            presupuesto = r.data
        }

        if (datos.anadirCatalogo) {
            const precioCoste = Math.round((datos.resultado?.costeUnidad || 0) * 100) / 100
            const { error } = await ctx.supabase.from('catalogo').insert({
                empresa_id: ctx.empresaId, tipo: 'producto', nombre: datos.nombre || 'Pieza mecanizada', descripcion: datos.descripcionLinea,
                categoria: 'Piezas mecanizadas', unidad: 'ud', precio_coste: precioCoste, precio_venta: datos.precioUnidad, iva_porcentaje: 21,
                notas: 'Creado desde la calculadora de mecanizado',
            })
            if (error) throw error
        }

        const { data: calc, error } = await ctx.supabase.from('calculos_piezas').insert({
            empresa_id: ctx.empresaId, nombre: datos.nombre || 'Pieza', entrada: datos.entrada, resultado: datos.resultado,
            precio_unidad: datos.precioUnidad, cantidad: datos.cantidad, presupuesto_id: presupuesto?.id || null,
            cliente_id: datos.crearPresupuesto?.clienteId || null, usuario_id: ctx.userId,
        }).select('id').single()
        if (error) throw error
        await auditar(ctx, 'calculo_pieza_guardado', { tipo: 'calculo', id: calc.id, ref: datos.nombre }, { precioUnidad: datos.precioUnidad, cantidad: datos.cantidad, presupuesto: presupuesto?.numero || null })
        revalidatePath('/calculadora')
        return { success: true as const, id: calc.id, presupuesto: presupuesto ? { id: presupuesto.id, numero: presupuesto.numero } : null }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

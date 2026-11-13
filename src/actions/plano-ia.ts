'use server'

// Presupuesto desde plano con IA (motor de IndunexIA Presupuestos dentro del ERP).
// La IA solo lee y mide; los kilos salen de la geometría y los euros de las tarifas de la empresa,
// del catálogo del ERP (precio de coste) o del precio de mercado del día.

import { revalidatePath } from 'next/cache'
import { getContexto, assertPermiso, mensajeError } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { comprobarCupoIA, registrarUsoIA } from '@/lib/ai/uso'
import { moduloActivo } from '@/lib/modulos'
import { crearDocumento } from '@/lib/documentos/crear'
import { leerDocumento } from '@/lib/plano-ia/ia'
import { leerMercado, actualizarMercado, precioComponente } from '@/lib/plano-ia/mercado'
import { aLineas, claveCatalogo, type Ajustes, type Mercado } from '@/lib/plano-ia/partidas'
import { totales, recalcularMaterial, ventaLinea, r2, type Linea } from '@/lib/plano-ia/calculo'
import { sectorDe, SECTORES } from '@/lib/plano-ia/sectores'

const TIPOS = /^(image\/(jpeg|png|webp)|application\/pdf)$/
const MAX_BYTES = 4 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AjustesPlano = Ajustes & { sector?: string }

export interface PlanoIA {
    id: string; titulo: string; sector: string; cliente_id: string | null; cliente_nombre: string | null; lineas: Linea[]; cantidad: number; margen: number; iva: number;
    dudas: string[]; supuestos: string[]; notas: string; formato: 'unico' | 'desglosado'; concepto: string; base: number; total: number; resumen: string;
    archivos: { ruta: string; nombre: string; tipo: string }[]; presupuesto_id: string | null; presupuesto_numero: string | null; ms: number | null; created_at: string
}

async function ctxPlanos(escribir = false) {
    const ctx = await getContexto()
    assertPermiso(ctx, 'presupuestos')
    if (escribir && ctx.rol === 'lectura') throw new Error('Tu usuario es de solo lectura.')
    const { data: emp } = await ctx.supabase.from('empresas').select('modulos').eq('id', ctx.empresaId).maybeSingle()
    if (!moduloActivo(emp?.modulos, 'presupuesto_plano')) throw new Error('El módulo «Presupuesto desde plano» no está activo en tu empresa.')
    return ctx
}

async function ajustesDe(ctx: any): Promise<AjustesPlano> {
    const { data } = await ctx.supabase.from('calculadora_config').select('parametros').eq('empresa_id', ctx.empresaId).maybeSingle()
    return { margen: 30, iva: 21, formato: 'unico', usarMercado: true, largoBarra: 6000, chapaA: 3000, chapaB: 1500, sector: 'calderia', ...(data?.parametros?.plano_ia || {}) }
}

/** Catálogo del ERP como lista de precios de coste para los componentes que lea la IA. */
async function catalogoDe(ctx: any) {
    const { data } = await ctx.supabase.from('catalogo').select('nombre, referencia, precio_coste').eq('activo', true).gt('precio_coste', 0).limit(5000)
    const m = new Map<string, number>()
    for (const x of data || []) {
        m.set(claveCatalogo(x.nombre), Number(x.precio_coste))
        if (x.referencia) m.set(claveCatalogo(x.nombre, x.referencia), Number(x.precio_coste))
    }
    return m
}

function formatear(p: any, presupuestoNumero: string | null = null, clienteNombre: string | null = null): PlanoIA {
    return {
        id: p.id, titulo: p.titulo, sector: p.sector, cliente_id: p.cliente_id, cliente_nombre: clienteNombre, lineas: p.lineas || [], cantidad: Number(p.cantidad) || 1,
        margen: Number(p.margen), iva: Number(p.iva), dudas: p.dudas || [], supuestos: p.supuestos || [], notas: p.notas || '', formato: p.formato === 'desglosado' ? 'desglosado' : 'unico',
        concepto: p.concepto || '', base: Number(p.base) || 0, total: Number(p.total) || 0, resumen: p.lectura?.resumen || '', archivos: p.archivos || [],
        presupuesto_id: p.presupuesto_id, presupuesto_numero: presupuestoNumero, ms: p.ms, created_at: p.created_at,
    }
}

const conceptoPorDefecto = (titulo: string, cantidad: number) =>
    `${cantidad > 1 ? `${cantidad} uds. de ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}` : titulo} según plano y medidas facilitadas. Incluye material, mano de obra y acabados indicados.`

// ───────────────────────────── Lectura ─────────────────────────────

export async function leerPlanoIA(form: FormData): Promise<{ success: true; id: string } | { success: false; error: string }> {
    try {
        const ctx = await ctxPlanos(true)
        const cupo = await comprobarCupoIA(ctx)
        if (!cupo.ok) throw new Error(cupo.mensaje)
        const archivos = form.getAll('archivo').filter((f): f is File => typeof f === 'object' && !!(f as File).size)
        if (!archivos.length) throw new Error('Sube al menos un plano, foto o PDF.')
        if (archivos.length > 4) throw new Error('Máximo 4 archivos por presupuesto.')
        let total = 0
        for (const a of archivos) {
            if (!TIPOS.test(a.type)) throw new Error(`«${a.name}»: solo JPG, PNG, WEBP o PDF.`)
            total += a.size
        }
        if (total > MAX_BYTES) throw new Error('Los archivos pasan de 4 MB en total. Reduce la foto o divide el PDF.')

        const ajustes = await ajustesDe(ctx)
        const s = sectorDe(String(form.get('sector') || ajustes.sector || 'calderia'))
        const indicaciones = String(form.get('indicaciones') || '').slice(0, 1500)
        const clienteId = String(form.get('cliente_id') || '')
        const datos = await Promise.all(archivos.map(async a => ({ nombre: a.name, tipo: a.type, datos: Buffer.from(await a.arrayBuffer()) })))

        const { lectura, modelo, tokens, ms } = await leerDocumento(datos, s, indicaciones)
        registrarUsoIA(ctx, { accion: 'plano_ia', modelo: 'gpt-4o', tokensEntrada: tokens.entrada, tokensSalida: tokens.salida }).catch(() => { })
        const mercado = ajustes.usarMercado !== false ? await leerMercado().then(m => m.precios).catch(() => null) : null
        const lineas = aLineas(lectura, s, ajustes, await catalogoDe(ctx), mercado)
        const cantidad = Math.max(1, Math.round(Number(form.get('cantidad')) || lectura.cantidad_conjuntos || 1))
        const margen = ajustes.margen ?? s.margen
        const iva = ajustes.iva ?? 21
        const t = totales(lineas, cantidad, margen, iva)
        const titulo = lectura.titulo || 'Presupuesto desde plano'

        const { data: fila, error } = await ctx.supabase.from('planos_presupuestos').insert({
            empresa_id: ctx.empresaId, titulo, sector: s.id, cliente_id: UUID.test(clienteId) ? clienteId : null, lectura, lineas, cantidad, margen, iva,
            dudas: lectura.dudas || [], supuestos: lectura.supuestos || [], formato: ajustes.formato === 'desglosado' ? 'desglosado' : 'unico',
            concepto: conceptoPorDefecto(titulo, cantidad), base: t.base, total: t.total, modelo, ms, creado_por: ctx.userId,
        }).select('id').single()
        if (error) throw error

        // Los planos se guardan en el almacén privado de la empresa
        const subidos: { ruta: string; nombre: string; tipo: string }[] = []
        for (const [i, a] of datos.entries()) {
            const ext = a.tipo === 'application/pdf' ? 'pdf' : a.tipo.split('/')[1].replace('jpeg', 'jpg')
            const ruta = `${ctx.empresaId}/planos/${fila.id}/${i + 1}.${ext}`
            const up = await ctx.supabase.storage.from('documentos').upload(ruta, a.datos, { contentType: a.tipo, upsert: true })
            if (!up.error) subidos.push({ ruta, nombre: a.nombre.slice(0, 120), tipo: a.tipo })
        }
        if (subidos.length) await ctx.supabase.from('planos_presupuestos').update({ archivos: subidos }).eq('id', fila.id)
        await auditar(ctx, 'plano_ia_leido', { tipo: 'plano', id: fila.id, ref: titulo }, { sector: s.id, lineas: lineas.length, dudas: lectura.dudas?.length || 0 })
        revalidatePath('/planos')
        return { success: true, id: fila.id }
    } catch (e) {
        return { success: false, error: mensajeError(e) }
    }
}

// ───────────────────────────── Consultar ─────────────────────────────

export async function getPlanosIA() {
    try {
        const ctx = await ctxPlanos()
        const { data, error } = await ctx.supabase.from('planos_presupuestos')
            .select('id, titulo, sector, cantidad, base, total, created_at, presupuesto_id, cliente_id, dudas, archivos')
            .order('created_at', { ascending: false }).limit(100)
        if (error) throw error
        const ids = [...new Set((data || []).map((x: any) => x.cliente_id).filter(Boolean))]
        const pids = [...new Set((data || []).map((x: any) => x.presupuesto_id).filter(Boolean))]
        const [{ data: cl }, { data: pr }] = await Promise.all([
            ids.length ? ctx.supabase.from('contactos').select('id, razon_social').in('id', ids) : Promise.resolve({ data: [] }),
            pids.length ? ctx.supabase.from('presupuestos').select('id, numero').in('id', pids) : Promise.resolve({ data: [] }),
        ])
        const cn = new Map((cl || []).map((c: any) => [c.id, c.razon_social]))
        const pn = new Map((pr || []).map((p: any) => [p.id, p.numero]))
        return {
            success: true as const,
            planos: (data || []).map((x: any) => ({ ...x, base: Number(x.base), total: Number(x.total), cliente: cn.get(x.cliente_id) || null, presupuesto_numero: pn.get(x.presupuesto_id) || null, n_dudas: (x.dudas || []).length, miniatura: (x.archivos || []).find((a: any) => a.tipo?.startsWith('image/'))?.ruta || null })),
            ajustes: await ajustesDe(ctx),
            sectores: SECTORES.map(s => ({ id: s.id, nombre: s.nombre, icono: s.icono, descripcion: s.descripcion, documentos: s.documentos })),
            puedeEditar: ctx.rol !== 'lectura',
        }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function getPlanoIA(id: string) {
    try {
        if (!UUID.test(id)) throw new Error('Presupuesto no encontrado')
        const ctx = await ctxPlanos()
        const { data: p } = await ctx.supabase.from('planos_presupuestos').select('*').eq('id', id).maybeSingle()
        if (!p) throw new Error('Presupuesto no encontrado')
        const [{ data: pr }, { data: cl }] = await Promise.all([
            p.presupuesto_id ? ctx.supabase.from('presupuestos').select('numero').eq('id', p.presupuesto_id).maybeSingle() : Promise.resolve({ data: null }),
            p.cliente_id ? ctx.supabase.from('contactos').select('razon_social').eq('id', p.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
        ])
        const mercado = await leerMercado().catch(() => ({ precios: {} as Mercado, actualizado: null }))
        return { success: true as const, plano: formatear(p, pr?.numero || null, cl?.razon_social || null), ajustes: await ajustesDe(ctx), mercado: mercado.precios, mercadoActualizado: mercado.actualizado, puedeEditar: ctx.rol !== 'lectura' }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

// ───────────────────────────── Guardar ─────────────────────────────

const limpiarLinea = (l: Linea, sobremedida: number): Linea => {
    const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0)
    const base: Linea = {
        id: String(l.id || '').slice(0, 40) || `l${Math.random().toString(36).slice(2, 9)}`,
        grupo: (['material', 'operacion', 'componente', 'extra'].includes(l.grupo) ? l.grupo : 'extra') as Linea['grupo'],
        clave: String(l.clave || 'otro').slice(0, 120), descripcion: String(l.descripcion || '').slice(0, 300), detalle: String(l.detalle || '').slice(0, 500),
        cantidad: r2(n(l.cantidad)), unidad: String(l.unidad || 'ud').slice(0, 10), precio: r2(n(l.precio)), porLote: !!l.porLote,
        origen: (['cota', 'texto', 'deducido', 'estimado', 'manual'].includes(l.origen) ? l.origen : 'manual') as Linea['origen'],
        confianza: (['alta', 'media', 'baja'].includes(l.confianza) ? l.confianza : 'alta') as Linea['confianza'],
        geo: l.geo || null, piezas: l.piezas ? Math.max(1, Math.round(n(l.piezas))) : undefined, materialId: l.materialId || null,
    }
    return base.grupo === 'material' && base.geo ? recalcularMaterial(base, sobremedida) : base
}

export async function guardarPlanoIA(id: string, c: Partial<PlanoIA>) {
    try {
        if (!UUID.test(id)) throw new Error('Presupuesto no encontrado')
        const ctx = await ctxPlanos(true)
        const { data: p } = await ctx.supabase.from('planos_presupuestos').select('*').eq('id', id).maybeSingle()
        if (!p) throw new Error('Presupuesto no encontrado')
        const s = sectorDe(p.sector)
        const lineas = Array.isArray(c.lineas) ? c.lineas.slice(0, 200).map(l => limpiarLinea(l, s.sobremedida)) : p.lineas
        const cantidad = Math.max(1, Math.min(100000, Math.round(Number(c.cantidad ?? p.cantidad) || 1)))
        const margen = Math.max(0, Math.min(500, Number(c.margen ?? p.margen) || 0))
        const iva = Math.max(0, Math.min(30, Number(c.iva ?? p.iva) || 0))
        const t = totales(lineas, cantidad, margen, iva)
        const lista = (v: unknown, def: string[]) => (Array.isArray(v) ? v.slice(0, 20).map(x => String(x).slice(0, 300)) : def)
        const clienteId = c.cliente_id === null ? null : c.cliente_id && UUID.test(c.cliente_id) ? c.cliente_id : p.cliente_id
        const { error } = await ctx.supabase.from('planos_presupuestos').update({
            titulo: String(c.titulo ?? p.titulo).slice(0, 200) || 'Presupuesto', cliente_id: clienteId, lineas, cantidad, margen, iva,
            notas: String(c.notas ?? p.notas).slice(0, 3000), dudas: lista(c.dudas, p.dudas), supuestos: lista(c.supuestos, p.supuestos),
            formato: c.formato === 'unico' || c.formato === 'desglosado' ? c.formato : p.formato, concepto: String(c.concepto ?? p.concepto).slice(0, 1000),
            base: t.base, total: t.total, updated_at: new Date().toISOString(),
        }).eq('id', id)
        if (error) throw error
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function borrarPlanoIA(id: string) {
    try {
        if (!UUID.test(id)) throw new Error('Presupuesto no encontrado')
        const ctx = await ctxPlanos(true)
        const { data: p } = await ctx.supabase.from('planos_presupuestos').select('archivos, titulo').eq('id', id).maybeSingle()
        if (!p) throw new Error('Presupuesto no encontrado')
        const rutas = (p.archivos || []).map((a: any) => a.ruta)
        if (rutas.length) await ctx.supabase.storage.from('documentos').remove(rutas)
        await ctx.supabase.from('planos_presupuestos').delete().eq('id', id)
        await auditar(ctx, 'plano_ia_borrado', { tipo: 'plano', id, ref: p.titulo }, {})
        revalidatePath('/planos')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function guardarAjustesPlano(a: AjustesPlano) {
    try {
        const ctx = await ctxPlanos(true)
        const n = (v: unknown, min: number, max: number, def: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def }
        const limpio: AjustesPlano = {
            sector: SECTORES.some(s => s.id === a.sector) ? a.sector : 'calderia',
            margen: n(a.margen, 0, 500, 30), iva: n(a.iva, 0, 30, 21), manoObra: n(a.manoObra, 0, 500, 0),
            formato: a.formato === 'desglosado' ? 'desglosado' : 'unico', usarMercado: a.usarMercado !== false,
            largoBarra: n(a.largoBarra, 500, 20000, 6000), chapaA: n(a.chapaA, 500, 6000, 3000), chapaB: n(a.chapaB, 500, 3000, 1500),
            tarifas: Object.fromEntries(Object.entries(a.tarifas || {}).filter(([k, v]) => /^[a-z_.0-9]{2,60}$/.test(k) && Number(v) > 0).map(([k, v]) => [k, Math.round(Number(v) * 100) / 100])),
        }
        const { data: actual } = await ctx.supabase.from('calculadora_config').select('*').eq('empresa_id', ctx.empresaId).maybeSingle()
        const fila = { empresa_id: ctx.empresaId, precios: {}, materiales_extra: [], tarifas: {}, parametros: {}, ...(actual || {}), updated_at: new Date().toISOString() }
        fila.parametros = { ...(fila.parametros || {}), plano_ia: limpio }
        const { error } = await ctx.supabase.from('calculadora_config').upsert(fila)
        if (error) throw error
        return { success: true as const, ajustes: limpio }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

// ───────────────────────────── Mercado ─────────────────────────────

export async function actualizarMercadoPlano() {
    try {
        const ctx = await ctxPlanos(true)
        const r = await actualizarMercado(false)
        if (r.nuevo) registrarUsoIA(ctx, { accion: 'plano_mercado', modelo: 'gpt-4o-mini', costeFijo: 0.06 }).catch(() => { })
        return { success: true as const, precios: r.precios, actualizado: r.actualizado, nuevo: r.nuevo }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function precioMercadoComponente(descripcion: string, unidad: string) {
    try {
        const ctx = await ctxPlanos(true)
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
        const { count } = await ctx.supabase.from('ia_uso').select('id', { count: 'exact', head: true }).eq('accion', 'plano_precio').gte('created_at', hoy.toISOString())
        if ((count || 0) >= 40) throw new Error('Has llegado a las 40 búsquedas de precio de hoy. Mañana vuelves a tenerlas.')
        const r = await precioComponente(descripcion, unidad)
        registrarUsoIA(ctx, { accion: 'plano_precio', modelo: 'gpt-4o-mini', costeFijo: 0.01 }).catch(() => { })
        return { success: true as const, ...r }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

// ───────────────────── Pasar a presupuesto del ERP ─────────────────────

export async function pasarAPresupuestoERP(id: string) {
    try {
        if (!UUID.test(id)) throw new Error('Presupuesto no encontrado')
        const ctx = await ctxPlanos(true)
        const { data: p } = await ctx.supabase.from('planos_presupuestos').select('*').eq('id', id).maybeSingle()
        if (!p) throw new Error('Presupuesto no encontrado')
        if (!p.cliente_id) throw new Error('Elige antes el cliente.')
        const lineas: Linea[] = p.lineas || []
        const cantidad = Number(p.cantidad) || 1, margen = Number(p.margen), iva = Number(p.iva)
        const t = totales(lineas, cantidad, margen, iva)
        if (!(t.base > 0)) throw new Error('El presupuesto está a 0 €: revisa precios y cantidades.')

        let lineasDoc: { descripcion: string; cantidad: number; precio_unitario: number }[]
        if (p.formato === 'desglosado') {
            lineasDoc = lineas.filter(l => l.cantidad > 0 && l.precio > 0).map(l => {
                const veces = l.porLote ? 1 : cantidad
                const venta = ventaLinea(l, cantidad, margen)
                const q = r2(l.cantidad * veces)
                const unit = r2(venta / q)
                // Si el precio unitario redondeado no cuadra con el importe, va como una partida cerrada
                return r2(unit * q) === venta && l.unidad !== 'kg'
                    ? { descripcion: l.descripcion, cantidad: q, precio_unitario: unit }
                    : { descripcion: `${l.descripcion} (${q.toLocaleString('es-ES')} ${l.unidad})`, cantidad: 1, precio_unitario: venta }
            })
        } else {
            const unit = r2(t.base / cantidad)
            lineasDoc = r2(unit * cantidad) === t.base
                ? [{ descripcion: p.concepto || p.titulo, cantidad, precio_unitario: unit }]
                : [{ descripcion: p.concepto || p.titulo, cantidad: 1, precio_unitario: t.base }]
        }
        const { data: c } = await ctx.supabase.from('contactos').select('*').eq('id', p.cliente_id).maybeSingle()
        if (!c) throw new Error('El cliente ya no existe.')
        const observaciones = [p.notas?.trim(), 'Presupuesto calculado desde plano.'].filter(Boolean).join('\n')
        const doc = await crearDocumento(ctx, {
            cliente_id: c.id, cliente_razon_social: c.razon_social, cliente_cif: c.cif, cliente_direccion: c.direccion, cliente_telefono: c.telefono, cliente_email: c.email,
            cliente_codigo_postal: c.codigo_postal, cliente_ciudad: c.ciudad, cliente_provincia: c.provincia,
            fecha: new Date(), lineas: lineasDoc, iva_porcentaje: iva, estado: 'borrador', observaciones,
        }, 'presupuesto')
        await ctx.supabase.from('planos_presupuestos').update({ presupuesto_id: doc.id, updated_at: new Date().toISOString() }).eq('id', id)
        await auditar(ctx, 'plano_ia_a_presupuesto', { tipo: 'presupuesto', id: doc.id, ref: doc.numero }, { plano: id, base: t.base })
        revalidatePath('/presupuestos'); revalidatePath('/planos'); revalidatePath('/')
        return { success: true as const, presupuestoId: doc.id as string, numero: doc.numero as string }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

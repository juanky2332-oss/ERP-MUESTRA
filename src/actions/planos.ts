'use server'

import { getContexto, assertPermiso, mensajeError } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { comprobarCupoIA, registrarUsoIA } from '@/lib/ai/uso'
import { rankingCatalogo } from '@/lib/ai/catalogo-busqueda'
import { leerPlanoConIA } from '@/lib/planos/leer'
import type { LecturaPlano, ModoPlano } from '@/lib/planos/tipos'

const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']

export interface CoincidenciaCatalogo { id: string; nombre: string; referencia: string | null; precio_venta: number; iva_porcentaje: number | null; unidad: string | null }

/**
 * Lee un plano / foto / esquema y lo deja listo para presupuestar.
 * En los esquemas, cada componente se busca en el catálogo de la empresa:
 * el precio solo sale de ahí (si no está, queda «sin precio»).
 */
export async function leerPlano(form: FormData): Promise<{ success: true; lectura: LecturaPlano; catalogo: Record<number, CoincidenciaCatalogo[]> } | { success: false; error: string }> {
    try {
        const ctx = await getContexto()
        assertPermiso(ctx, 'presupuestos')
        const cupo = await comprobarCupoIA(ctx)
        if (!cupo.ok) throw new Error(cupo.mensaje)

        const archivo = form.get('archivo') as File | null
        if (!archivo || !archivo.size) throw new Error('Sube una foto, un PDF o una captura del plano.')
        if (!TIPOS_OK.includes(archivo.type)) throw new Error('Formato no admitido: usa JPG, PNG, WEBP o PDF.')
        if (archivo.size > 4 * 1024 * 1024) throw new Error('El archivo pasa de 4 MB. Si es una foto, se reduce sola; si es un PDF, exporta solo la hoja del plano.')
        const modo = (String(form.get('modo') || 'auto') as ModoPlano | 'auto')
        const nota = String(form.get('nota') || '').slice(0, 1000)

        const { data: cfg } = await ctx.supabase.from('calculadora_config').select('materiales_extra').eq('empresa_id', ctx.empresaId).maybeSingle()
        const buffer = Buffer.from(await archivo.arrayBuffer())
        const { lectura, tokens, modelo } = await leerPlanoConIA(buffer, archivo.type, { modo, nota, materialesExtra: cfg?.materiales_extra || [] })
        registrarUsoIA(ctx, { accion: 'plano_' + lectura.modo, modelo, tokensEntrada: tokens.entrada, tokensSalida: tokens.salida }).catch(() => { })

        const catalogo: Record<number, CoincidenciaCatalogo[]> = {}
        if (lectura.modo === 'esquema' && lectura.esquema?.componentes?.length) {
            const { data: items } = await ctx.supabase.from('catalogo').select('id, nombre, referencia, descripcion, categoria, precio_venta, iva_porcentaje, unidad').eq('activo', true).limit(5000)
            lectura.esquema.componentes.forEach((c, i) => {
                const texto = [c.marca_ref, c.descripcion, c.caracteristicas].filter(Boolean).join(' ')
                catalogo[i] = rankingCatalogo(items || [], texto).slice(0, 5).map((x: any) => ({ id: x.id, nombre: x.nombre, referencia: x.referencia, precio_venta: Number(x.precio_venta) || 0, iva_porcentaje: x.iva_porcentaje, unidad: x.unidad }))
            })
        }
        await auditar(ctx, 'plano_leido', { tipo: 'plano', ref: archivo.name }, { modo: lectura.modo, faltan: lectura.faltan?.length || 0, elementos: lectura.conjunto?.elementos?.length ?? lectura.esquema?.componentes?.length ?? 1 })
        return { success: true, lectura, catalogo }
    } catch (e) {
        return { success: false, error: mensajeError(e) }
    }
}

/** Busca en el catálogo para cambiar a mano el artículo de un componente. */
export async function buscarEnCatalogo(texto: string): Promise<CoincidenciaCatalogo[]> {
    try {
        const ctx = await getContexto()
        const { data: items } = await ctx.supabase.from('catalogo').select('id, nombre, referencia, descripcion, categoria, precio_venta, iva_porcentaje, unidad').eq('activo', true).limit(5000)
        return rankingCatalogo(items || [], texto).slice(0, 8).map((x: any) => ({ id: x.id, nombre: x.nombre, referencia: x.referencia, precio_venta: Number(x.precio_venta) || 0, iva_porcentaje: x.iva_porcentaje, unidad: x.unidad }))
    } catch {
        return []
    }
}

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { MATERIALES } from './calculo.ts'
import type { Mercado } from './partidas.ts'

// Precio de mercado de los materiales: la IA busca en la web el precio de compra de hoy en España (almacén de metales,
// sin IVA) y lo guarda con su fuente. Lo comparten todas las empresas y se refresca como mucho una vez cada 12 h.

const MODELO_WEB = process.env.OPENAI_MODEL_WEB || 'gpt-5.4-mini'
const HORAS_CACHE = 12

export async function leerMercado(): Promise<{ precios: Mercado; actualizado: string | null }> {
    const { data } = await supabaseAdmin.from('plano_mercado').select('*')
    const precios: Mercado = {}
    let ultimo: string | null = null
    for (const f of data || []) {
        precios[f.material] = { eurKg: Number(f.eur_kg), min: f.min == null ? null : Number(f.min), max: f.max == null ? null : Number(f.max), fuente: f.fuente || '', url: f.url, fecha: f.actualizado }
        if (!ultimo || f.actualizado > ultimo) ultimo = f.actualizado
    }
    return { precios, actualizado: ultimo }
}

async function preguntarConWeb(sistema: string, pregunta: string): Promise<{ texto: string; fuentes: { url: string }[] }> {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('Falta OPENAI_API_KEY en el servidor.')
    const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            model: MODELO_WEB,
            reasoning: { effort: 'low' },
            tools: [{ type: 'web_search', user_location: { type: 'approximate', country: 'ES' } }],
            max_output_tokens: 12000,
            input: [{ role: 'system', content: sistema }, { role: 'user', content: pregunta }],
        }),
        signal: AbortSignal.timeout(150000),
    }).catch((e: Error) => {
        throw new Error(e.name === 'TimeoutError' ? 'La consulta de precios ha tardado demasiado. Prueba de nuevo en un momento.' : 'No se ha podido consultar el mercado.')
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`No se ha podido consultar el mercado (${j?.error?.message || r.status}).`)
    let texto = ''
    const fuentes: { url: string }[] = []
    for (const o of j.output || []) {
        if (o.type !== 'message') continue
        for (const c of o.content || []) {
            if (c.type !== 'output_text') continue
            texto += c.text || ''
            for (const a of c.annotations || []) if (a.type === 'url_citation' && a.url) fuentes.push({ url: a.url })
        }
    }
    return { texto, fuentes }
}

export function extraerJson<T>(texto: string): T | null {
    const i = texto.indexOf('{'), f = texto.lastIndexOf('}')
    if (i < 0 || f <= i) return null
    try { return JSON.parse(texto.slice(i, f + 1)) as T } catch { return null }
}

const FAMILIAS = [['s275', 's355', 'galvanizado', 'c45', '42crmo4'], ['inox304', 'inox316'], ['al6082', 'al5754', 'al7075'], ['laton', 'bronce', 'cobre'], ['fundicion', 'titanio'], ['pom', 'pa6', 'pehd']]
type PrecioWeb = { id: string; eur_kg: number | null; min?: number | null; max?: number | null; fuente?: string; url?: string | null }

async function buscarFamilia(ids: string[]) {
    const lista = ids.map(id => `- ${id}: ${MATERIALES.find(m => m.id === id)!.nombre}`).join('\n')
    const { texto, fuentes } = await preguntarConWeb(
        `Eres el comprador de un taller metalúrgico español. Busca en la web el precio de compra ACTUAL (hoy, ${new Date().toLocaleDateString('es-ES')}) en almacenes y distribuidores de España para un taller pequeño o mediano (pedidos de cientos de kilos en barras, tubos o chapas comerciales), en €/kg SIN IVA.
VALE: tarifas de almacenes de hierros y metales para profesionales, distribuidores y boletines de precios de producto laminado en España. Si un distribuidor da precio por metro o por pieza, conviértelo con el peso teórico.
NO VALE: chatarra o reciclaje, materia prima sin transformar (granza, lingote, cátodo, LME a secas), bricolaje, tramos de menos de 1 m ni licitaciones con mano de obra.
Si no hay tarifa de almacén pero sí índice de materia prima, suma el margen típico de transformación y almacén y dilo en "fuente". Haz pocas búsquedas y sé breve. Nunca inventes: si no encuentras nada fiable, eur_kg = null.
Responde SOLO con JSON: {"precios":[{"id":"<id>","eur_kg":<número o null>,"min":<número o null>,"max":<número o null>,"fuente":"<de dónde sale, en 1 frase>","url":"<url o null>"}]}`,
        `Materiales (usa estos id):\n${lista}`,
    )
    return { precios: extraerJson<{ precios?: PrecioWeb[] }>(texto)?.precios || [], fuentes }
}

export async function actualizarMercado(forzar = false) {
    const actual = await leerMercado()
    if (!forzar && actual.actualizado && Date.now() - new Date(actual.actualizado).getTime() < HORAS_CACHE * 3600_000) return { ...actual, nuevo: false }
    const inicio = new Date().toISOString()
    const resultados = await Promise.allSettled(FAMILIAS.map(buscarFamilia))
    let guardados = 0
    for (const r of resultados) {
        if (r.status !== 'fulfilled') { console.error('[mercado]', r.reason); continue }
        for (const p of r.value.precios) {
            const m = MATERIALES.find(x => x.id === p.id)
            const v = Number(p.eur_kg)
            // Filtro de cordura: fuera lo que se aleja mucho de la referencia de almacén.
            if (!m || !Number.isFinite(v) || v <= 0 || v < m.eurKg * 0.5 || v > m.eurKg * 2.2) continue
            const num = (x: unknown) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null)
            const url = typeof p.url === 'string' && /^https?:\/\//.test(p.url) ? p.url.slice(0, 500) : r.value.fuentes[0]?.url || null
            await supabaseAdmin.from('plano_mercado').upsert({ material: m.id, eur_kg: Math.round(v * 100) / 100, min: num(p.min), max: num(p.max), fuente: String(p.fuente || '').slice(0, 300), url, actualizado: new Date().toISOString() })
            guardados++
        }
    }
    if (!guardados) throw new Error('No se ha encontrado ningún precio fiable ahora mismo. Se mantienen los anteriores.')
    await supabaseAdmin.from('plano_mercado').delete().lt('actualizado', inicio)
    return { ...(await leerMercado()), nuevo: true, guardados }
}

/** Precio de mercado de un componente o material comercial (un contactor, un cilindro, una rueda…). */
export async function precioComponente(descripcion: string, unidad: string) {
    const d = descripcion.trim().slice(0, 300)
    if (d.length < 3) throw new Error('Escribe qué componente es para buscar su precio.')
    const { texto, fuentes } = await preguntarConWeb(
        `Eres el comprador de una empresa industrial española. Buscas en la web el precio de compra actual en España (distribuidor o tienda profesional, SIN IVA, en euros) del artículo que te piden, por ${unidad || 'ud'}.
Si hay referencia exacta, búscala; si no, el equivalente más habitual y dilo. Nunca inventes: si no encuentras un precio real, eur = null.
Responde SOLO con JSON: {"eur":<número o null>,"min":<número o null>,"max":<número o null>,"articulo":"<qué has encontrado exactamente>","fuente":"<tienda o web>","url":"<url o null>"}`,
        d,
    )
    const j = extraerJson<{ eur: number | null; articulo?: string; fuente?: string; url?: string | null }>(texto)
    const eur = Number(j?.eur)
    if (!j || !Number.isFinite(eur) || eur <= 0) throw new Error('No se ha encontrado un precio fiable para este artículo. Pídelo a tu proveedor.')
    return {
        eur: Math.round(eur * 100) / 100, articulo: String(j.articulo || d).slice(0, 300), fuente: String(j.fuente || '').slice(0, 200),
        url: typeof j.url === 'string' && /^https?:\/\//.test(j.url) ? j.url : fuentes[0]?.url || null, fecha: new Date().toISOString(),
    }
}

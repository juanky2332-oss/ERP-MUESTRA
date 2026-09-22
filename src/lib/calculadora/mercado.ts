import 'server-only'
import { INDICES_REFERENCIA, type Cotizaciones } from './materiales'

/**
 * Cotizaciones de mercado de las materias primas (sin clave de API):
 * - Yahoo Finance: futuros COMEX de aluminio (ALI=F, USD/t), cobre (HG=F,
 *   USD/lb), zinc (ZNC=F, USD/t) y acero bobina en caliente (HRC=F, USD/short ton).
 * - Frankfurter (BCE): cambio USD→EUR.
 * Se cachean 3 horas. Si una fuente falla, se devuelve lo que haya.
 */

export interface Mercado {
    actualizado: string
    usdEur: number | null
    cotizaciones: Cotizaciones
    eurKg: { aluminio: number | null; cobre: number | null; zinc: number | null; acero: number | null }
    variacion: { aluminio: number | null; cobre: number | null; zinc: number | null; acero: number | null }
    fuentes: string[]
    errores: string[]
}

const SIMBOLOS = { aluminio: 'ALI=F', cobre: 'HG=F', zinc: 'ZNC=F', acero: 'HRC=F' } as const

async function yahoo(simbolo: string): Promise<number | null> {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=5d&interval=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (ERP calculadora)' },
        next: { revalidate: 10800 },
    })
    if (!res.ok) throw new Error(`${simbolo} HTTP ${res.status}`)
    const j = await res.json()
    const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice
    return typeof p === 'number' && p > 0 ? p : null
}

async function usdEur(): Promise<number | null> {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR', { next: { revalidate: 10800 } })
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`)
    const j = await res.json()
    return j?.rates?.EUR || null
}

export async function obtenerMercado(): Promise<Mercado> {
    const errores: string[] = []
    const cot: Cotizaciones = {}
    const tareas = Object.entries(SIMBOLOS).map(async ([k, s]) => {
        try { (cot as any)[k] = await yahoo(s) } catch (e: any) { errores.push(e?.message || String(e)) }
    })
    let fx: number | null = null
    tareas.push((async () => { try { fx = await usdEur() } catch (e: any) { errores.push(e?.message || String(e)) } })())
    await Promise.all(tareas)

    const tipo = fx || 0.87
    const eurKg = {
        aluminio: cot.aluminio ? r3(cot.aluminio / 1000 * tipo) : null,
        cobre: cot.cobre ? r3(cot.cobre * 2.20462 * tipo) : null,
        zinc: cot.zinc ? r3(cot.zinc / 1000 * tipo) : null,
        acero: cot.acero ? r3(cot.acero / 907.185 * tipo) : null,
    }
    const varia = (k: keyof typeof SIMBOLOS) => (cot[k] ? Math.round((Number(cot[k]) / (INDICES_REFERENCIA as any)[k] - 1) * 1000) / 10 : null)
    return {
        actualizado: new Date().toISOString(),
        usdEur: fx,
        cotizaciones: cot,
        eurKg,
        variacion: { aluminio: varia('aluminio'), cobre: varia('cobre'), zinc: varia('zinc'), acero: varia('acero') },
        fuentes: ['COMEX/CME vía Yahoo Finance (ALI=F, HG=F, ZNC=F, HRC=F)', 'BCE vía Frankfurter (USD→EUR)'],
        errores,
    }
}

const r3 = (x: number) => Math.round(x * 1000) / 1000

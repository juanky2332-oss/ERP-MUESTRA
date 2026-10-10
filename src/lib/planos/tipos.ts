/**
 * Presupuesto desde plano o foto: tipos, esquema de respuesta de la IA y
 * cálculos puros (sin base de datos; se testean con `npm test`).
 *
 * Tres modos:
 *   - pieza:    plano de una pieza mecanizada → se abre en la calculadora.
 *   - conjunto: calderería / inoxidable (mesas, bastidores, soportes...) →
 *               despiece con kg de cada elemento + corte, plegado, soldadura
 *               y acabado con las tarifas del taller.
 *   - esquema:  esquema eléctrico, neumático o hidráulico → lista de
 *               materiales con precios del catálogo (nunca inventados).
 *
 * Regla de oro: la IA solo EXTRAE lo que se ve. Las medidas que no aparecen
 * vuelven a null y se preguntan; los precios salen de las tarifas del taller
 * o del catálogo.
 */

import type { FormaId } from '../calculadora/calculo.ts'

export type ModoPlano = 'pieza' | 'conjunto' | 'esquema'
export type OrigenDato = 'cota' | 'texto' | 'deducido'

export interface PiezaLeida {
    nombre: string
    material_texto: string | null
    material_id: string | null
    forma: FormaId | null
    medidas: Record<string, number | null>
    cantidad: number | null
    tolerancias: string[]
    tratamientos: string[]
    acabado: string | null
    taladros: { d: number; prof: number; n: number }[]
    notas: string[]
}

export interface ElementoConjunto {
    nombre: string
    forma: FormaId
    material_id: string | null
    medidas: Record<string, number | null>
    cantidad: number
    origen: OrigenDato
    nota?: string | null
}

export interface ProcesosConjunto {
    corte_metros: number | null
    perforaciones: number | null
    plegados: number | null
    soldadura_metros: number | null
    soldadura_tipo: 'TIG' | 'MIG' | null
    acabado: 'pulido' | 'satinado' | 'pintura' | 'galvanizado' | 'ninguno' | null
    acabado_m2: number | null
    montaje_horas: number | null
}

export interface ConjuntoLeido {
    nombre: string
    cantidad: number | null
    material_texto: string | null
    material_id: string | null
    elementos: ElementoConjunto[]
    procesos: ProcesosConjunto
    notas: string[]
}

export interface ComponenteEsquema {
    descripcion: string
    tipo: string
    caracteristicas: string | null
    marca_ref: string | null
    cantidad: number
    designacion: string | null
    confianza: 'alta' | 'media' | 'baja'
}

export interface EsquemaLeido {
    titulo: string
    tipo_esquema: 'electrico' | 'neumatico' | 'hidraulico' | 'otro'
    componentes: ComponenteEsquema[]
    notas: string[]
}

export interface LecturaPlano {
    modo: ModoPlano
    legible: boolean
    faltan: string[]
    pieza?: PiezaLeida
    conjunto?: ConjuntoLeido
    esquema?: EsquemaLeido
}

/** Tarifas de calderería del taller (editables en la pantalla). */
export interface TarifasCalderia {
    /** €/m de corte según espesor (láser/plasma), por tramos de espesor en mm. */
    corte: { hastaMm: number; eurM: number }[]
    perforacion: number
    plegado: number
    soldaduraTIG: number
    soldaduraMIG: number
    pulidoM2: number
    pinturaM2: number
    galvanizadoKg: number
    montajeHora: number
    margen: number
}

export const TARIFAS_CALDERIA_DEFECTO: TarifasCalderia = {
    corte: [{ hastaMm: 1.5, eurM: 1.2 }, { hastaMm: 3, eurM: 1.8 }, { hastaMm: 6, eurM: 3 }, { hastaMm: 10, eurM: 5 }, { hastaMm: 20, eurM: 9 }, { hastaMm: 999, eurM: 15 }],
    perforacion: 0.15,
    plegado: 1.5,
    soldaduraTIG: 22,
    soldaduraMIG: 12,
    pulidoM2: 28,
    pinturaM2: 18,
    galvanizadoKg: 0.9,
    montajeHora: 35,
    margen: 30,
}

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0 }
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

export function eurCortePorMetro(t: TarifasCalderia, espesorMm: number): number {
    const tramo = [...t.corte].sort((a, b) => a.hastaMm - b.hastaMm).find(x => espesorMm <= x.hastaMm + 1e-9)
    return tramo ? tramo.eurM : (t.corte[t.corte.length - 1]?.eurM || 0)
}

export interface LineaCosteConjunto { concepto: string; detalle: string; importe: number }

export interface ResultadoConjunto {
    kgTotal: number
    costeMaterial: number
    lineas: LineaCosteConjunto[]
    costeUnidad: number
    precioUnidad: number
    cantidad: number
    precioLote: number
    beneficioLote: number
    incompletos: string[]
}

/**
 * Precio de un conjunto de calderería: material (kg × €/kg de cada elemento,
 * que se calcula fuera con la calculadora) + procesos con las tarifas.
 * `kgElemento` y `precioKgElemento` vienen ya resueltos por elemento.
 */
export function precioConjunto(
    elementos: { nombre: string; cantidad: number; kgUnidad: number; precioKg: number; espesorMm?: number | null }[],
    procesos: ProcesosConjunto,
    t: TarifasCalderia,
    cantidadConjuntos: number,
): ResultadoConjunto {
    const lineas: LineaCosteConjunto[] = []
    const incompletos: string[] = []
    let kg = 0, costeMaterial = 0
    for (const e of elementos) {
        const kgE = n(e.kgUnidad) * n(e.cantidad)
        if (!kgE) incompletos.push(`${e.nombre}: faltan medidas`)
        kg += kgE
        costeMaterial += kgE * n(e.precioKg)
    }
    lineas.push({ concepto: 'Material', detalle: `${kg.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`, importe: r2(costeMaterial) })

    const espesorRef = Math.max(0, ...elementos.map(e => n(e.espesorMm)))
    if (n(procesos.corte_metros)) {
        const eur = eurCortePorMetro(t, espesorRef || 3)
        lineas.push({ concepto: 'Corte', detalle: `${n(procesos.corte_metros)} m × ${eur} €/m (espesor ${espesorRef || 3} mm)`, importe: r2(n(procesos.corte_metros) * eur) })
    }
    if (n(procesos.perforaciones)) lineas.push({ concepto: 'Perforaciones', detalle: `${n(procesos.perforaciones)} × ${t.perforacion} €`, importe: r2(n(procesos.perforaciones) * t.perforacion) })
    if (n(procesos.plegados)) lineas.push({ concepto: 'Plegado', detalle: `${n(procesos.plegados)} pliegues × ${t.plegado} €`, importe: r2(n(procesos.plegados) * t.plegado) })
    if (n(procesos.soldadura_metros)) {
        const eur = procesos.soldadura_tipo === 'MIG' ? t.soldaduraMIG : t.soldaduraTIG
        lineas.push({ concepto: `Soldadura ${procesos.soldadura_tipo || 'TIG'}`, detalle: `${n(procesos.soldadura_metros)} m × ${eur} €/m`, importe: r2(n(procesos.soldadura_metros) * eur) })
    }
    if (procesos.acabado === 'galvanizado') {
        lineas.push({ concepto: 'Galvanizado', detalle: `${r2(kg)} kg × ${t.galvanizadoKg} €/kg`, importe: r2(kg * t.galvanizadoKg) })
    } else if (procesos.acabado && procesos.acabado !== 'ninguno') {
        const eur = procesos.acabado === 'pintura' ? t.pinturaM2 : t.pulidoM2
        if (n(procesos.acabado_m2)) lineas.push({ concepto: procesos.acabado === 'pintura' ? 'Pintura' : 'Pulido / satinado', detalle: `${n(procesos.acabado_m2)} m² × ${eur} €/m²`, importe: r2(n(procesos.acabado_m2) * eur) })
        else incompletos.push('Acabado: faltan los m² a tratar')
    }
    if (n(procesos.montaje_horas)) lineas.push({ concepto: 'Montaje y ajuste', detalle: `${n(procesos.montaje_horas)} h × ${t.montajeHora} €/h`, importe: r2(n(procesos.montaje_horas) * t.montajeHora) })

    const costeUnidad = r2(lineas.reduce((a, l) => a + l.importe, 0))
    const cant = Math.max(1, Math.round(n(cantidadConjuntos) || 1))
    const precioUnidad = r2(costeUnidad * (1 + n(t.margen) / 100))
    return {
        kgTotal: r2(kg), costeMaterial: r2(costeMaterial), lineas, costeUnidad, precioUnidad, cantidad: cant,
        precioLote: r2(precioUnidad * cant), beneficioLote: r2((precioUnidad - costeUnidad) * cant), incompletos,
    }
}

/** Superficie (m²) de chapa de los elementos tipo chapa, una cara: ayuda para el acabado. */
export function m2Chapas(elementos: { forma: string; medidas: Record<string, number | null>; cantidad: number }[]): number {
    return r2(elementos.filter(e => e.forma === 'chapa').reduce((a, e) => a + n(e.medidas.A) * n(e.medidas.B) / 1e6 * n(e.cantidad), 0))
}

/** Perímetro de corte (m) de las chapas rectangulares, como primera aproximación. */
export function perimetroChapas(elementos: { forma: string; medidas: Record<string, number | null>; cantidad: number }[]): number {
    return r2(elementos.filter(e => e.forma === 'chapa').reduce((a, e) => a + 2 * (n(e.medidas.A) + n(e.medidas.B)) / 1000 * n(e.cantidad), 0))
}

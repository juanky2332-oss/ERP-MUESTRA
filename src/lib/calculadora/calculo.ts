/**
 * Motor de la calculadora de mecanizado: geometría, peso bruto/neto,
 * aprovechamiento de barra, tiempos orientativos y precio de la pieza.
 * Sin dependencias (se testea con `npm test`). Todas las medidas en mm.
 */

import type { Material } from './materiales'

export type FormaId =
    | 'redonda' | 'cuadrada' | 'hexagonal' | 'octogonal' | 'pletina' | 'tubo' | 'tubo_rect'
    | 'chapa' | 'disco' | 'anillo' | 'angular' | 'perfil_u' | 'perfil_t' | 'esfera'
    | 'perfil_std' | 'volumen' | 'peso'

export interface Campo { key: string; label: string; ayuda?: string }

export interface Forma {
    id: FormaId
    nombre: string
    grupo: 'Barras' | 'Tubos' | 'Chapas y discos' | 'Perfiles' | 'Otros'
    campos: Campo[]
    /** Campo al que se aplica la medida comercial (redondeo al alza). */
    comercial?: { campo: string; lista: number[] }
    /** Campo de longitud (para barras: piezas por barra y corte). */
    largo?: string
}

export const DIAMETROS_COMERCIALES = [3, 4, 5, 6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 250, 260, 280, 300, 320, 350, 400]
export const HEXAGONOS_COMERCIALES = [6, 7, 8, 10, 11, 12, 13, 14, 17, 19, 22, 24, 27, 30, 32, 36, 41, 46, 50, 55, 60, 65, 70, 75, 80, 90, 100]
export const CUADRADOS_COMERCIALES = [6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200]
export const ESPESORES_COMERCIALES = [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 16, 18, 20, 22, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200]

export const FORMAS: Forma[] = [
    { id: 'redonda', nombre: 'Barra redonda / eje', grupo: 'Barras', campos: [{ key: 'D', label: 'Diámetro D' }, { key: 'L', label: 'Longitud L' }], comercial: { campo: 'D', lista: DIAMETROS_COMERCIALES }, largo: 'L' },
    { id: 'cuadrada', nombre: 'Barra cuadrada', grupo: 'Barras', campos: [{ key: 'A', label: 'Lado A' }, { key: 'L', label: 'Longitud L' }], comercial: { campo: 'A', lista: CUADRADOS_COMERCIALES }, largo: 'L' },
    { id: 'hexagonal', nombre: 'Barra hexagonal', grupo: 'Barras', campos: [{ key: 'S', label: 'Entre caras S' }, { key: 'L', label: 'Longitud L' }], comercial: { campo: 'S', lista: HEXAGONOS_COMERCIALES }, largo: 'L' },
    { id: 'octogonal', nombre: 'Barra octogonal', grupo: 'Barras', campos: [{ key: 'S', label: 'Entre caras S' }, { key: 'L', label: 'Longitud L' }], largo: 'L' },
    { id: 'pletina', nombre: 'Pletina / barra rectangular', grupo: 'Barras', campos: [{ key: 'A', label: 'Ancho A' }, { key: 'E', label: 'Espesor E' }, { key: 'L', label: 'Longitud L' }], comercial: { campo: 'E', lista: ESPESORES_COMERCIALES }, largo: 'L' },
    { id: 'tubo', nombre: 'Tubo redondo', grupo: 'Tubos', campos: [{ key: 'D', label: 'Diámetro exterior D' }, { key: 'E', label: 'Espesor de pared E' }, { key: 'L', label: 'Longitud L' }], largo: 'L' },
    { id: 'tubo_rect', nombre: 'Tubo cuadrado / rectangular', grupo: 'Tubos', campos: [{ key: 'A', label: 'Lado A' }, { key: 'B', label: 'Lado B' }, { key: 'E', label: 'Espesor E' }, { key: 'L', label: 'Longitud L' }], largo: 'L' },
    { id: 'chapa', nombre: 'Chapa / placa / bloque', grupo: 'Chapas y discos', campos: [{ key: 'A', label: 'Largo A' }, { key: 'B', label: 'Ancho B' }, { key: 'E', label: 'Espesor E' }], comercial: { campo: 'E', lista: ESPESORES_COMERCIALES } },
    { id: 'disco', nombre: 'Disco / tapa', grupo: 'Chapas y discos', campos: [{ key: 'D', label: 'Diámetro D' }, { key: 'E', label: 'Espesor E' }], comercial: { campo: 'D', lista: DIAMETROS_COMERCIALES } },
    { id: 'anillo', nombre: 'Anillo / arandela / brida', grupo: 'Chapas y discos', campos: [{ key: 'D', label: 'Diámetro exterior D' }, { key: 'd', label: 'Diámetro interior d' }, { key: 'E', label: 'Espesor E' }] },
    { id: 'angular', nombre: 'Angular L', grupo: 'Perfiles', campos: [{ key: 'A', label: 'Ala A' }, { key: 'B', label: 'Ala B' }, { key: 'E', label: 'Espesor E' }, { key: 'L', label: 'Longitud L' }], largo: 'L' },
    { id: 'perfil_u', nombre: 'Perfil U (chapa plegada)', grupo: 'Perfiles', campos: [{ key: 'A', label: 'Alma A' }, { key: 'B', label: 'Alas B' }, { key: 'E', label: 'Espesor E' }, { key: 'L', label: 'Longitud L' }], largo: 'L' },
    { id: 'perfil_t', nombre: 'Perfil T', grupo: 'Perfiles', campos: [{ key: 'A', label: 'Ala A' }, { key: 'B', label: 'Alma B' }, { key: 'E', label: 'Espesor E' }, { key: 'L', label: 'Longitud L' }], largo: 'L' },
    { id: 'perfil_std', nombre: 'Perfil normalizado (IPE, HEB, HEA, UPN)', grupo: 'Perfiles', campos: [{ key: 'L', label: 'Longitud L' }], largo: 'L' },
    { id: 'esfera', nombre: 'Esfera', grupo: 'Otros', campos: [{ key: 'D', label: 'Diámetro D' }] },
    { id: 'volumen', nombre: 'Por volumen conocido (CAD)', grupo: 'Otros', campos: [{ key: 'V', label: 'Volumen (cm³)', ayuda: 'El que da tu programa de CAD' }] },
    { id: 'peso', nombre: 'Por peso conocido', grupo: 'Otros', campos: [{ key: 'P', label: 'Peso (kg)' }] },
]

/** Perfiles laminados normalizados: kg/m en acero (7,85 g/cm³). */
export const PERFILES_STD: Record<string, Record<string, number>> = {
    IPE: { '80': 6.0, '100': 8.1, '120': 10.4, '140': 12.9, '160': 15.8, '180': 18.8, '200': 22.4, '220': 26.2, '240': 30.7, '270': 36.1, '300': 42.2, '330': 49.1, '360': 57.1, '400': 66.3 },
    HEB: { '100': 20.4, '120': 26.7, '140': 33.7, '160': 42.6, '180': 51.2, '200': 61.3, '220': 71.5, '240': 83.2, '260': 93.0, '280': 103, '300': 117 },
    HEA: { '100': 16.7, '120': 19.9, '140': 24.7, '160': 30.4, '180': 35.5, '200': 42.3, '220': 50.5, '240': 60.3, '260': 68.2, '280': 76.4, '300': 88.3 },
    UPN: { '80': 8.64, '100': 10.6, '120': 13.4, '140': 16.0, '160': 18.8, '180': 22.0, '200': 25.3, '220': 29.4, '240': 33.2, '260': 37.9, '300': 46.2 },
}

export function formaPorId(id: FormaId) { return FORMAS.find(f => f.id === id)! }

const n = (v: any) => Math.max(0, Number(v) || 0)

/**
 * Volumen en cm³ de una forma. Para 'peso' y 'perfil_std' se necesita la
 * densidad (se devuelve el volumen equivalente).
 */
export function volumenCm3(forma: FormaId, d: Record<string, number>, densidad: number, perfil?: { serie: string; talla: string }): number {
    const PI = Math.PI
    let mm3 = 0
    switch (forma) {
        case 'redonda': mm3 = PI / 4 * n(d.D) ** 2 * n(d.L); break
        case 'cuadrada': mm3 = n(d.A) ** 2 * n(d.L); break
        case 'hexagonal': mm3 = (Math.sqrt(3) / 2) * n(d.S) ** 2 * n(d.L); break
        case 'octogonal': mm3 = 2 * (Math.SQRT2 - 1) * n(d.S) ** 2 * n(d.L); break
        case 'pletina': mm3 = n(d.A) * n(d.E) * n(d.L); break
        case 'tubo': { const D = n(d.D), e = Math.min(n(d.E), D / 2); mm3 = PI / 4 * (D ** 2 - (D - 2 * e) ** 2) * n(d.L); break }
        case 'tubo_rect': { const A = n(d.A), B = n(d.B), e = Math.min(n(d.E), A / 2, B / 2); mm3 = (A * B - (A - 2 * e) * (B - 2 * e)) * n(d.L); break }
        case 'chapa': mm3 = n(d.A) * n(d.B) * n(d.E); break
        case 'disco': mm3 = PI / 4 * n(d.D) ** 2 * n(d.E); break
        case 'anillo': { const D = n(d.D), di = Math.min(n(d.d), D); mm3 = PI / 4 * (D ** 2 - di ** 2) * n(d.E); break }
        case 'angular': { const e = n(d.E); mm3 = e * Math.max(0, n(d.A) + n(d.B) - e) * n(d.L); break }
        case 'perfil_u': { const e = n(d.E); mm3 = e * Math.max(0, n(d.A) + 2 * n(d.B) - 2 * e) * n(d.L); break }
        case 'perfil_t': { const e = n(d.E); mm3 = e * Math.max(0, n(d.A) + n(d.B) - e) * n(d.L); break }
        case 'esfera': mm3 = PI / 6 * n(d.D) ** 3; break
        case 'volumen': return n(d.V)
        case 'peso': return densidad > 0 ? n(d.P) * 1000 / densidad : 0
        case 'perfil_std': {
            const kgm = perfil ? PERFILES_STD[perfil.serie]?.[perfil.talla] || 0 : 0
            const kgAcero = kgm * n(d.L) / 1000
            return kgAcero * 1000 / 7.85
        }
    }
    return mm3 / 1000
}

export const pesoKg = (cm3: number, densidad: number) => cm3 * densidad / 1000

/** Siguiente medida comercial igual o superior. */
export function medidaComercial(valor: number, lista: number[]): number {
    return lista.find(x => x >= valor - 1e-9) ?? valor
}

export interface Sobremedida {
    /** Creces en diámetro / sección (mm totales, p. ej. 3 → Ø40 pasa a Ø43). */
    seccion: number
    /** Creces en longitud para corte y refrentado (mm totales). */
    largo: number
    redondearComercial: boolean
}

/** Medidas del material en bruto a partir de la pieza terminada. */
export function dimensionesBruto(forma: FormaId, fin: Record<string, number>, s: Sobremedida): Record<string, number> {
    const b: Record<string, number> = { ...fin }
    const f = formaPorId(forma)
    const sec = n(s.seccion), lar = n(s.largo)
    switch (forma) {
        case 'redonda': case 'disco': case 'esfera': b.D = n(fin.D) + sec; break
        case 'cuadrada': b.A = n(fin.A) + sec; break
        case 'hexagonal': case 'octogonal': b.S = n(fin.S) + sec; break
        case 'pletina': b.A = n(fin.A) + sec; b.E = n(fin.E) + sec; break
        case 'chapa': b.A = n(fin.A) + sec; b.B = n(fin.B) + sec; b.E = n(fin.E) + sec; break
        case 'tubo': b.D = n(fin.D) + sec; b.E = n(fin.E) + sec; break
        case 'anillo': b.D = n(fin.D) + sec; b.d = Math.max(0, n(fin.d) - sec); b.E = n(fin.E) + lar; break
        default: break
    }
    if (f.largo && b[f.largo] !== undefined) b[f.largo] = n(fin[f.largo]) + lar
    if (forma === 'disco') b.E = n(fin.E) + lar
    if (s.redondearComercial && f.comercial) b[f.comercial.campo] = medidaComercial(b[f.comercial.campo], f.comercial.lista)
    return b
}

export interface Taladro { d: number; prof: number; n: number }
export interface Cajera { a: number; b: number; p: number; n: number }

/** Volumen quitado por taladros y cajeras (cm³) para el peso neto. */
export function volumenVaciados(taladros: Taladro[] = [], cajeras: Cajera[] = []): number {
    const t = taladros.reduce((acc, x) => acc + Math.PI / 4 * n(x.d) ** 2 * n(x.prof) * Math.max(0, Math.round(n(x.n))), 0)
    const c = cajeras.reduce((acc, x) => acc + n(x.a) * n(x.b) * n(x.p) * Math.max(0, Math.round(n(x.n))), 0)
    return (t + c) / 1000
}

export interface Operacion { id: string; maquinaId: string; nombre: string; tarifa: number; prepMin: number; cicloMin: number }
export interface Tratamiento { id: string; nombre: string; unidad: 'kg' | 'pieza' | 'lote'; precio: number; minimo?: number }

export interface EntradaCalculo {
    material: Pick<Material, 'densidad' | 'maquinabilidad' | 'viruta'>
    precioKg: number
    forma: FormaId
    perfil?: { serie: string; talla: string }
    final: Record<string, number>
    sobremedida: Sobremedida
    taladros?: Taladro[]
    cajeras?: Cajera[]
    cantidad: number
    /** Ancho de corte de la sierra (mm). */
    kerf: number
    /** Si > 0, se compra por barras completas de esta longitud (mm). */
    largoBarra: number
    /** % de merma sobre el material (recortes, extremos). */
    merma: number
    descontarViruta: boolean
    operaciones: Operacion[]
    tratamientos: Tratamiento[]
    otrosLote: number
    margen: number
}

export interface Resultado {
    bruto: Record<string, number>
    volFinalCm3: number
    volBrutoCm3: number
    pesoNeto: number
    pesoBruto: number
    pesoViruta: number
    aprovechamiento: number
    piezasPorBarra: number | null
    barras: number | null
    kgMaterialLote: number
    costeMaterialLote: number
    abonoVirutaLote: number
    costeMecanizadoLote: number
    horasLote: number
    costeTratamientosLote: number
    otrosLote: number
    costeLote: number
    costeUnidad: number
    precioUnidad: number
    precioLote: number
    beneficioLote: number
    desgloseOperaciones: { nombre: string; horas: number; coste: number }[]
}

const r2 = (x: number) => Math.round(x * 100) / 100
const r3 = (x: number) => Math.round(x * 1000) / 1000

export function calcular(e: EntradaCalculo): Resultado {
    const cant = Math.max(1, Math.round(n(e.cantidad)))
    const dens = n(e.material.densidad)
    const forma = formaPorId(e.forma)

    const volFinalBruto = volumenCm3(e.forma, e.final, dens, e.perfil)
    const volFinal = Math.max(0, volFinalBruto - volumenVaciados(e.taladros, e.cajeras))
    const esGeometrica = e.forma !== 'volumen' && e.forma !== 'peso'
    const bruto = esGeometrica ? dimensionesBruto(e.forma, e.final, e.sobremedida) : { ...e.final }
    const volBruto = esGeometrica ? volumenCm3(e.forma, bruto, dens, e.perfil) : volFinalBruto

    const pesoNeto = pesoKg(volFinal, dens)
    const pesoBruto = pesoKg(volBruto, dens)
    const pesoViruta = Math.max(0, pesoBruto - pesoNeto)

    // Aprovechamiento de barra: piezas por barra con el ancho de corte.
    let piezasPorBarra: number | null = null, barras: number | null = null
    let kgLote = pesoBruto * cant
    const largoPieza = forma.largo ? n(bruto[forma.largo]) : 0
    if (n(e.largoBarra) > 0 && largoPieza > 0) {
        piezasPorBarra = Math.floor((n(e.largoBarra) + n(e.kerf)) / (largoPieza + n(e.kerf)))
        if (piezasPorBarra >= 1) {
            barras = Math.ceil(cant / piezasPorBarra)
            const pesoBarra = pesoBruto * (n(e.largoBarra) / largoPieza)
            kgLote = barras * pesoBarra
        } else {
            piezasPorBarra = 0
        }
    } else if (largoPieza > 0 && n(e.kerf) > 0) {
        // Compra a medida: se suma el corte de sierra a cada pieza.
        kgLote = pesoBruto * cant * ((largoPieza + n(e.kerf)) / largoPieza)
    }
    kgLote = kgLote * (1 + n(e.merma) / 100)

    const costeMaterialLote = kgLote * n(e.precioKg)
    const abonoVirutaLote = e.descontarViruta ? pesoViruta * cant * n(e.material.viruta) : 0

    const desgloseOperaciones = (e.operaciones || []).map(o => {
        const horas = (n(o.prepMin) + n(o.cicloMin) * cant) / 60
        return { nombre: o.nombre, horas: r3(horas), coste: r2(horas * n(o.tarifa)) }
    })
    const horasLote = desgloseOperaciones.reduce((a, o) => a + o.horas, 0)
    const costeMecanizadoLote = desgloseOperaciones.reduce((a, o) => a + o.coste, 0)

    const costeTratamientosLote = (e.tratamientos || []).reduce((acc, t) => {
        const base = t.unidad === 'kg' ? n(t.precio) * pesoNeto * cant : t.unidad === 'pieza' ? n(t.precio) * cant : n(t.precio)
        return acc + Math.max(base, n(t.minimo))
    }, 0)

    const costeLote = costeMaterialLote - abonoVirutaLote + costeMecanizadoLote + costeTratamientosLote + n(e.otrosLote)
    const precioLote = costeLote * (1 + n(e.margen) / 100)

    return {
        bruto,
        volFinalCm3: r3(volFinal),
        volBrutoCm3: r3(volBruto),
        pesoNeto: r3(pesoNeto),
        pesoBruto: r3(pesoBruto),
        pesoViruta: r3(pesoViruta),
        aprovechamiento: pesoBruto > 0 ? Math.round((pesoNeto / pesoBruto) * 1000) / 10 : 100,
        piezasPorBarra,
        barras,
        kgMaterialLote: r3(kgLote),
        costeMaterialLote: r2(costeMaterialLote),
        abonoVirutaLote: r2(abonoVirutaLote),
        costeMecanizadoLote: r2(costeMecanizadoLote),
        horasLote: r3(horasLote),
        costeTratamientosLote: r2(costeTratamientosLote),
        otrosLote: r2(n(e.otrosLote)),
        costeLote: r2(costeLote),
        costeUnidad: r2(costeLote / cant),
        precioUnidad: r2(precioLote / cant),
        precioLote: r2(precioLote),
        beneficioLote: r2(precioLote - costeLote),
        desgloseOperaciones,
    }
}

/**
 * Tiempo de ciclo orientativo (min/pieza) de una máquina que arranca viruta:
 * volumen a quitar / (arranque base × maquinabilidad del material), más un
 * 30 % de pasadas de acabado y 2 min de carga/descarga. Es una ayuda para no
 * empezar de cero: el taller siempre tiene la última palabra.
 */
export function cicloSugerido(volVirutaCm3: number, mrrBase: number, maquinabilidad: number): number | null {
    if (!mrrBase || mrrBase <= 0) return null
    const mrr = mrrBase * Math.max(0.05, maquinabilidad || 1)
    return Math.round(((volVirutaCm3 / mrr) * 1.3 + 2) * 10) / 10
}

/** Tiempo orientativo de corte en sierra (min/corte) según la sección (cm²). */
export function corteSugerido(seccionCm2: number, maquinabilidad: number): number {
    const velocidad = 12 * Math.sqrt(Math.max(0.1, maquinabilidad || 1)) // cm²/min
    return Math.round((seccionCm2 / velocidad + 0.5) * 10) / 10
}

/** Sección (cm²) de la barra en bruto, para estimar el corte. */
export function seccionCm2(forma: FormaId, b: Record<string, number>, densidad: number, perfil?: { serie: string; talla: string }): number {
    const f = formaPorId(forma)
    if (!f.largo || !n(b[f.largo])) return 0
    return volumenCm3(forma, b, densidad, perfil) / (n(b[f.largo]) / 10)
}

/** Texto de línea de presupuesto: "Eje Ø40×120 mm · Acero C45 · 1,18 kg/ud". */
export function descripcionPieza(nombrePieza: string, forma: FormaId, fin: Record<string, number>, nombreMaterial: string, pesoNeto: number, perfil?: { serie: string; talla: string }): string {
    const x = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ','))
    let medidas = ''
    switch (forma) {
        case 'redonda': medidas = `Ø${x(fin.D)}×${x(fin.L)} mm`; break
        case 'cuadrada': medidas = `□${x(fin.A)}×${x(fin.L)} mm`; break
        case 'hexagonal': medidas = `hex ${x(fin.S)}×${x(fin.L)} mm`; break
        case 'octogonal': medidas = `oct ${x(fin.S)}×${x(fin.L)} mm`; break
        case 'pletina': medidas = `${x(fin.A)}×${x(fin.E)}×${x(fin.L)} mm`; break
        case 'tubo': medidas = `Ø${x(fin.D)}×${x(fin.E)}×${x(fin.L)} mm`; break
        case 'tubo_rect': medidas = `${x(fin.A)}×${x(fin.B)}×${x(fin.E)}×${x(fin.L)} mm`; break
        case 'chapa': medidas = `${x(fin.A)}×${x(fin.B)}×${x(fin.E)} mm`; break
        case 'disco': medidas = `Ø${x(fin.D)}×${x(fin.E)} mm`; break
        case 'anillo': medidas = `Ø${x(fin.D)}/Ø${x(fin.d)}×${x(fin.E)} mm`; break
        case 'angular': medidas = `L ${x(fin.A)}×${x(fin.B)}×${x(fin.E)}×${x(fin.L)} mm`; break
        case 'perfil_u': medidas = `U ${x(fin.A)}×${x(fin.B)}×${x(fin.E)}×${x(fin.L)} mm`; break
        case 'perfil_t': medidas = `T ${x(fin.A)}×${x(fin.B)}×${x(fin.E)}×${x(fin.L)} mm`; break
        case 'perfil_std': medidas = `${perfil?.serie || ''} ${perfil?.talla || ''} × ${x(fin.L)} mm`; break
        case 'esfera': medidas = `esfera Ø${x(fin.D)} mm`; break
        default: medidas = ''
    }
    const peso = String(Math.round(pesoNeto * 1000) / 1000).replace('.', ',')
    return [nombrePieza || 'Pieza mecanizada', medidas, nombreMaterial, `${peso} kg/ud`].filter(Boolean).join(' · ')
}

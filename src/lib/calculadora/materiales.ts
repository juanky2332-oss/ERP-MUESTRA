/**
 * Base de datos de materiales para la calculadora de mecanizado.
 *
 * - densidad en g/cm³ (valores nominales de ficha técnica).
 * - precioKg: precio ORIENTATIVO de almacén (barra/chapa, sin IVA) en €/kg a
 *   22/09/2026. Cada empresa puede fijar el suyo en Ajustes de la calculadora.
 * - indice: cotización de mercado a la que se ata el precio para actualizarlo
 *   ('acero' HRC, 'aluminio' LME/COMEX, 'cobre', 'laton' = 63% Cu + 37% Zn).
 * - sensibilidad: parte del precio que sigue a esa cotización (el resto es
 *   laminación, aleación, almacén...). 0 = no se ajusta con el mercado.
 * - maquinabilidad: relativa a un acero C45 (F-1140) = 1. Más alto = se
 *   mecaniza más rápido. Se usa para estimar tiempos.
 * - viruta: precio orientativo de recuperación de la viruta en €/kg.
 */

export type Familia = 'Aceros al carbono' | 'Aceros aleados' | 'Aceros de herramienta' | 'Inoxidables' | 'Aluminios' | 'Cobre y aleaciones' | 'Fundiciones' | 'Titanio y especiales' | 'Plásticos técnicos'
export type Indice = 'acero' | 'aluminio' | 'cobre' | 'laton' | 'zinc' | null

export interface Material {
    id: string
    nombre: string
    norma: string
    familia: Familia
    densidad: number
    precioKg: number
    indice: Indice
    sensibilidad: number
    maquinabilidad: number
    viruta: number
}

export const MATERIALES: Material[] = [
    // Aceros al carbono
    { id: 's235', nombre: 'Acero S235JR (F-111)', norma: 'EN 10025 · 1.0038', familia: 'Aceros al carbono', densidad: 7.85, precioKg: 1.35, indice: 'acero', sensibilidad: 0.55, maquinabilidad: 1.1, viruta: 0.22 },
    { id: 's275', nombre: 'Acero S275JR', norma: 'EN 10025 · 1.0044', familia: 'Aceros al carbono', densidad: 7.85, precioKg: 1.4, indice: 'acero', sensibilidad: 0.55, maquinabilidad: 1.1, viruta: 0.22 },
    { id: 's355', nombre: 'Acero S355J2', norma: 'EN 10025 · 1.0577', familia: 'Aceros al carbono', densidad: 7.85, precioKg: 1.55, indice: 'acero', sensibilidad: 0.5, maquinabilidad: 1.0, viruta: 0.22 },
    { id: 'c45', nombre: 'Acero C45 (F-1140 / F-114)', norma: 'EN 10083 · 1.0503', familia: 'Aceros al carbono', densidad: 7.85, precioKg: 1.9, indice: 'acero', sensibilidad: 0.45, maquinabilidad: 1.0, viruta: 0.22 },
    { id: 'f1110', nombre: 'Acero C15 (F-1110) cementación', norma: 'EN 10084 · 1.0401', familia: 'Aceros al carbono', densidad: 7.85, precioKg: 1.85, indice: 'acero', sensibilidad: 0.45, maquinabilidad: 1.05, viruta: 0.22 },
    { id: '11smnpb30', nombre: 'Acero fácil mecanizado 11SMnPb30 (F-2122)', norma: 'EN 10087 · 1.0718', familia: 'Aceros al carbono', densidad: 7.85, precioKg: 1.95, indice: 'acero', sensibilidad: 0.45, maquinabilidad: 1.6, viruta: 0.22 },
    { id: 'st52_tubo', nombre: 'Tubo hidráulico E355 (St52)', norma: 'EN 10305 · 1.0580', familia: 'Aceros al carbono', densidad: 7.85, precioKg: 2.4, indice: 'acero', sensibilidad: 0.35, maquinabilidad: 1.0, viruta: 0.22 },
    // Aceros aleados
    { id: '42crmo4', nombre: 'Acero 42CrMo4 (F-1252) bonificado', norma: 'EN 10083 · 1.7225', familia: 'Aceros aleados', densidad: 7.85, precioKg: 2.9, indice: 'acero', sensibilidad: 0.3, maquinabilidad: 0.65, viruta: 0.22 },
    { id: '34crnimo6', nombre: 'Acero 34CrNiMo6 (F-1272)', norma: 'EN 10083 · 1.6582', familia: 'Aceros aleados', densidad: 7.85, precioKg: 3.8, indice: 'acero', sensibilidad: 0.25, maquinabilidad: 0.55, viruta: 0.22 },
    { id: '16mncr5', nombre: 'Acero 16MnCr5 (F-1516) cementación', norma: 'EN 10084 · 1.7131', familia: 'Aceros aleados', densidad: 7.85, precioKg: 2.6, indice: 'acero', sensibilidad: 0.3, maquinabilidad: 0.8, viruta: 0.22 },
    { id: '18crnimo7', nombre: 'Acero 18CrNiMo7-6 (F-1560)', norma: 'EN 10084 · 1.6587', familia: 'Aceros aleados', densidad: 7.85, precioKg: 4.2, indice: 'acero', sensibilidad: 0.2, maquinabilidad: 0.6, viruta: 0.22 },
    // Herramienta
    { id: '1.2379', nombre: 'Acero herramienta X153CrMoV12 (1.2379 / D2)', norma: 'EN ISO 4957 · 1.2379', familia: 'Aceros de herramienta', densidad: 7.7, precioKg: 9.5, indice: null, sensibilidad: 0, maquinabilidad: 0.35, viruta: 0.25 },
    { id: '1.2842', nombre: 'Acero herramienta 90MnCrV8 (1.2842 / O2)', norma: 'EN ISO 4957 · 1.2842', familia: 'Aceros de herramienta', densidad: 7.85, precioKg: 7.2, indice: null, sensibilidad: 0, maquinabilidad: 0.5, viruta: 0.25 },
    { id: '1.2312', nombre: 'Acero moldes 40CrMnMoS8-6 (1.2312 / P20+S)', norma: 'EN ISO 4957 · 1.2312', familia: 'Aceros de herramienta', densidad: 7.85, precioKg: 6.5, indice: null, sensibilidad: 0, maquinabilidad: 0.7, viruta: 0.25 },
    { id: '1.2344', nombre: 'Acero trabajo en caliente (1.2344 / H13)', norma: 'EN ISO 4957 · 1.2344', familia: 'Aceros de herramienta', densidad: 7.8, precioKg: 10.5, indice: null, sensibilidad: 0, maquinabilidad: 0.4, viruta: 0.25 },
    // Inoxidables
    { id: 'aisi303', nombre: 'Inox AISI 303 (fácil mecanizado)', norma: 'EN 10088 · 1.4305', familia: 'Inoxidables', densidad: 7.9, precioKg: 5.9, indice: null, sensibilidad: 0, maquinabilidad: 0.6, viruta: 1.1 },
    { id: 'aisi304', nombre: 'Inox AISI 304 / 304L', norma: 'EN 10088 · 1.4301 / 1.4307', familia: 'Inoxidables', densidad: 7.93, precioKg: 5.6, indice: null, sensibilidad: 0, maquinabilidad: 0.45, viruta: 1.1 },
    { id: 'aisi316', nombre: 'Inox AISI 316L', norma: 'EN 10088 · 1.4404', familia: 'Inoxidables', densidad: 7.98, precioKg: 7.6, indice: null, sensibilidad: 0, maquinabilidad: 0.4, viruta: 1.6 },
    { id: 'aisi420', nombre: 'Inox AISI 420 (martensítico)', norma: 'EN 10088 · 1.4021', familia: 'Inoxidables', densidad: 7.7, precioKg: 4.6, indice: null, sensibilidad: 0, maquinabilidad: 0.5, viruta: 0.6 },
    { id: 'duplex', nombre: 'Inox Dúplex 2205', norma: 'EN 10088 · 1.4462', familia: 'Inoxidables', densidad: 7.8, precioKg: 9.8, indice: null, sensibilidad: 0, maquinabilidad: 0.3, viruta: 1.4 },
    // Aluminios
    { id: 'al6082', nombre: 'Aluminio 6082 T6', norma: 'EN 573 · EN AW-6082', familia: 'Aluminios', densidad: 2.71, precioKg: 6.4, indice: 'aluminio', sensibilidad: 0.45, maquinabilidad: 3.0, viruta: 1.1 },
    { id: 'al6061', nombre: 'Aluminio 6061 T6', norma: 'EN 573 · EN AW-6061', familia: 'Aluminios', densidad: 2.7, precioKg: 6.8, indice: 'aluminio', sensibilidad: 0.45, maquinabilidad: 3.0, viruta: 1.1 },
    { id: 'al5083', nombre: 'Aluminio 5083 H111 (chapa/placa)', norma: 'EN 573 · EN AW-5083', familia: 'Aluminios', densidad: 2.66, precioKg: 6.9, indice: 'aluminio', sensibilidad: 0.45, maquinabilidad: 2.5, viruta: 1.1 },
    { id: 'al7075', nombre: 'Aluminio 7075 T6 (Ergal)', norma: 'EN 573 · EN AW-7075', familia: 'Aluminios', densidad: 2.81, precioKg: 11.5, indice: 'aluminio', sensibilidad: 0.25, maquinabilidad: 2.8, viruta: 1.1 },
    { id: 'al2011', nombre: 'Aluminio 2011 T3 (torneado)', norma: 'EN 573 · EN AW-2011', familia: 'Aluminios', densidad: 2.84, precioKg: 8.2, indice: 'aluminio', sensibilidad: 0.35, maquinabilidad: 3.5, viruta: 1.1 },
    { id: 'al5754', nombre: 'Aluminio 5754 H111 (chapa)', norma: 'EN 573 · EN AW-5754', familia: 'Aluminios', densidad: 2.67, precioKg: 5.9, indice: 'aluminio', sensibilidad: 0.5, maquinabilidad: 2.4, viruta: 1.1 },
    // Cobre y aleaciones
    { id: 'cw614n', nombre: 'Latón CW614N (CuZn39Pb3) mecanizado', norma: 'EN 12164 · CW614N', familia: 'Cobre y aleaciones', densidad: 8.47, precioKg: 9.4, indice: 'laton', sensibilidad: 0.65, maquinabilidad: 3.5, viruta: 4.6 },
    { id: 'cw617n', nombre: 'Latón CW617N (CuZn40Pb2) estampación', norma: 'EN 12165 · CW617N', familia: 'Cobre y aleaciones', densidad: 8.44, precioKg: 9.2, indice: 'laton', sensibilidad: 0.65, maquinabilidad: 3.0, viruta: 4.6 },
    { id: 'cu_etp', nombre: 'Cobre electrolítico Cu-ETP', norma: 'EN 13601 · CW004A', familia: 'Cobre y aleaciones', densidad: 8.94, precioKg: 13.2, indice: 'cobre', sensibilidad: 0.8, maquinabilidad: 0.8, viruta: 7.8 },
    { id: 'cusn12', nombre: 'Bronce CuSn12 (fundido)', norma: 'EN 1982 · CC483K', familia: 'Cobre y aleaciones', densidad: 8.75, precioKg: 19.5, indice: 'cobre', sensibilidad: 0.45, maquinabilidad: 1.6, viruta: 5.5 },
    { id: 'cusn8', nombre: 'Bronce fosforoso CuSn8', norma: 'EN 12163 · CW453K', familia: 'Cobre y aleaciones', densidad: 8.8, precioKg: 17.5, indice: 'cobre', sensibilidad: 0.5, maquinabilidad: 1.4, viruta: 5.5 },
    { id: 'cual10', nombre: 'Bronce de aluminio CuAl10Ni5Fe4', norma: 'EN 12163 · CW307G', familia: 'Cobre y aleaciones', densidad: 7.6, precioKg: 18.5, indice: 'cobre', sensibilidad: 0.45, maquinabilidad: 0.8, viruta: 4.8 },
    // Fundiciones
    { id: 'gg25', nombre: 'Fundición gris GG25 (EN-GJL-250)', norma: 'EN 1561 · EN-JL1040', familia: 'Fundiciones', densidad: 7.2, precioKg: 3.1, indice: 'acero', sensibilidad: 0.2, maquinabilidad: 1.3, viruta: 0.18 },
    { id: 'ggg50', nombre: 'Fundición nodular GGG50 (EN-GJS-500-7)', norma: 'EN 1563 · EN-JS1050', familia: 'Fundiciones', densidad: 7.1, precioKg: 3.6, indice: 'acero', sensibilidad: 0.2, maquinabilidad: 1.1, viruta: 0.18 },
    // Titanio y especiales
    { id: 'ti_gr2', nombre: 'Titanio Grado 2 (puro)', norma: 'ASTM B348 · 3.7035', familia: 'Titanio y especiales', densidad: 4.51, precioKg: 42, indice: null, sensibilidad: 0, maquinabilidad: 0.3, viruta: 2.5 },
    { id: 'ti_gr5', nombre: 'Titanio Grado 5 (Ti6Al4V)', norma: 'ASTM B348 · 3.7165', familia: 'Titanio y especiales', densidad: 4.43, precioKg: 68, indice: null, sensibilidad: 0, maquinabilidad: 0.22, viruta: 2.5 },
    { id: 'inconel718', nombre: 'Inconel 718', norma: 'UNS N07718 · 2.4668', familia: 'Titanio y especiales', densidad: 8.19, precioKg: 85, indice: null, sensibilidad: 0, maquinabilidad: 0.12, viruta: 6 },
    // Plásticos técnicos
    { id: 'pom_c', nombre: 'POM-C (Delrin / acetal)', norma: 'Copolímero acetal', familia: 'Plásticos técnicos', densidad: 1.41, precioKg: 9.5, indice: null, sensibilidad: 0, maquinabilidad: 4.0, viruta: 0 },
    { id: 'pa6', nombre: 'Poliamida PA6 (Nylon)', norma: 'PA 6 extruido', familia: 'Plásticos técnicos', densidad: 1.14, precioKg: 8.2, indice: null, sensibilidad: 0, maquinabilidad: 3.5, viruta: 0 },
    { id: 'pa6g', nombre: 'Poliamida colada PA6G (Ertalon)', norma: 'PA 6 G', familia: 'Plásticos técnicos', densidad: 1.15, precioKg: 9.8, indice: null, sensibilidad: 0, maquinabilidad: 3.5, viruta: 0 },
    { id: 'pe1000', nombre: 'Polietileno PE-UHMW 1000', norma: 'PE 1000', familia: 'Plásticos técnicos', densidad: 0.93, precioKg: 7.5, indice: null, sensibilidad: 0, maquinabilidad: 3.5, viruta: 0 },
    { id: 'pe500', nombre: 'Polietileno PE-HD 500', norma: 'PE 500', familia: 'Plásticos técnicos', densidad: 0.95, precioKg: 5.2, indice: null, sensibilidad: 0, maquinabilidad: 3.8, viruta: 0 },
    { id: 'ptfe', nombre: 'PTFE (Teflón)', norma: 'PTFE virgen', familia: 'Plásticos técnicos', densidad: 2.17, precioKg: 24, indice: null, sensibilidad: 0, maquinabilidad: 3.0, viruta: 0 },
    { id: 'peek', nombre: 'PEEK', norma: 'PEEK natural', familia: 'Plásticos técnicos', densidad: 1.31, precioKg: 125, indice: null, sensibilidad: 0, maquinabilidad: 2.5, viruta: 0 },
    { id: 'pvc', nombre: 'PVC rígido', norma: 'PVC-U', familia: 'Plásticos técnicos', densidad: 1.42, precioKg: 4.3, indice: null, sensibilidad: 0, maquinabilidad: 3.5, viruta: 0 },
    { id: 'pmma', nombre: 'Metacrilato PMMA', norma: 'PMMA extruido', familia: 'Plásticos técnicos', densidad: 1.19, precioKg: 7.2, indice: null, sensibilidad: 0, maquinabilidad: 3.0, viruta: 0 },
]

export const FAMILIAS: Familia[] = ['Aceros al carbono', 'Aceros aleados', 'Aceros de herramienta', 'Inoxidables', 'Aluminios', 'Cobre y aleaciones', 'Fundiciones', 'Titanio y especiales', 'Plásticos técnicos']

export function materialPorId(id: string, extra: Material[] = []): Material | undefined {
    return extra.find(m => m.id === id) || MATERIALES.find(m => m.id === id)
}

/** Máquinas / operaciones con tarifa horaria orientativa (España 2026) y arranque de viruta base en acero C45 (cm³/min). */
export interface Maquina { id: string; nombre: string; tarifa: number; mrr: number }

export const MAQUINAS: Maquina[] = [
    { id: 'sierra', nombre: 'Sierra de cinta (corte)', tarifa: 28, mrr: 0 },
    { id: 'torno_conv', nombre: 'Torno convencional', tarifa: 38, mrr: 20 },
    { id: 'torno_cnc', nombre: 'Torno CNC', tarifa: 52, mrr: 55 },
    { id: 'fresa_conv', nombre: 'Fresadora convencional', tarifa: 40, mrr: 15 },
    { id: 'cm3', nombre: 'Centro de mecanizado 3 ejes', tarifa: 58, mrr: 40 },
    { id: 'cm5', nombre: 'Centro de mecanizado 5 ejes', tarifa: 85, mrr: 45 },
    { id: 'taladro', nombre: 'Taladro / roscado', tarifa: 32, mrr: 8 },
    { id: 'rectificadora', nombre: 'Rectificadora', tarifa: 55, mrr: 1.5 },
    { id: 'edm', nombre: 'Electroerosión', tarifa: 65, mrr: 0.3 },
    { id: 'soldadura', nombre: 'Soldadura', tarifa: 38, mrr: 0 },
    { id: 'ajuste', nombre: 'Ajuste / montaje / control', tarifa: 32, mrr: 0 },
]

/** Tratamientos externos habituales (precio orientativo). */
export const TRATAMIENTOS = [
    { id: 'temple', nombre: 'Temple y revenido', unidad: 'kg' as const, precio: 1.9, minimo: 45 },
    { id: 'cementado', nombre: 'Cementado y templado', unidad: 'kg' as const, precio: 2.8, minimo: 60 },
    { id: 'nitrurado', nombre: 'Nitrurado', unidad: 'kg' as const, precio: 3.5, minimo: 70 },
    { id: 'zincado', nombre: 'Zincado electrolítico', unidad: 'kg' as const, precio: 1.3, minimo: 30 },
    { id: 'galvanizado', nombre: 'Galvanizado en caliente', unidad: 'kg' as const, precio: 0.9, minimo: 40 },
    { id: 'pavonado', nombre: 'Pavonado', unidad: 'kg' as const, precio: 1.6, minimo: 25 },
    { id: 'anodizado', nombre: 'Anodizado (aluminio)', unidad: 'kg' as const, precio: 6.5, minimo: 45 },
    { id: 'cromo_duro', nombre: 'Cromo duro', unidad: 'kg' as const, precio: 9, minimo: 60 },
    { id: 'pintura', nombre: 'Pintura / lacado', unidad: 'kg' as const, precio: 2.2, minimo: 35 },
    { id: 'granallado', nombre: 'Granallado', unidad: 'kg' as const, precio: 0.8, minimo: 25 },
]

/** Cotizaciones de referencia con las que se fijaron los precios orientativos (22/09/2026, en USD). */
export const INDICES_REFERENCIA = {
    fecha: '2026-09-22',
    aluminio: 3510.5,   // USD/t (ALI=F, COMEX)
    cobre: 6.905,       // USD/lb (HG=F, COMEX)
    acero: 1322,        // USD/short ton (HRC=F, bobina laminada en caliente)
    zinc: 4050,         // USD/t (ZNC=F)
}

export type Cotizaciones = { aluminio?: number | null; cobre?: number | null; acero?: number | null; zinc?: number | null }

/** Relación entre la cotización actual y la de referencia para un índice. */
export function ratioIndice(indice: Indice, hoy: Cotizaciones, ref: Cotizaciones = INDICES_REFERENCIA): number | null {
    const r = (k: keyof Cotizaciones) => (hoy[k] && ref[k] ? Number(hoy[k]) / Number(ref[k]) : null)
    switch (indice) {
        case 'acero': return r('acero')
        case 'aluminio': return r('aluminio')
        case 'cobre': return r('cobre')
        case 'zinc': return r('zinc')
        case 'laton': {
            const cu = r('cobre'), zn = r('zinc')
            if (cu == null || zn == null) return cu ?? null
            return 0.63 * cu + 0.37 * zn
        }
        default: return null
    }
}

/**
 * Precio actualizado con el mercado: solo se mueve la parte del precio que
 * depende del metal (sensibilidad). Ej.: aluminio a 6,40 €/kg con sensibilidad
 * 0,45 y el aluminio un 10 % más caro → 6,40 × (1 + 0,45 × 0,10) = 6,69 €/kg.
 */
export function precioConMercado(precioBase: number, indice: Indice, sensibilidad: number, hoy: Cotizaciones, ref?: Cotizaciones): number {
    const ratio = ratioIndice(indice, hoy, ref)
    if (ratio == null || !sensibilidad) return precioBase
    return Math.round(precioBase * (1 + sensibilidad * (ratio - 1)) * 100) / 100
}

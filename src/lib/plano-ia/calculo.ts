// Cálculo puro (se usa en el navegador y en el servidor, y se prueba con vitest).
// La IA nunca pone precios ni pesos: el peso sale de la geometría × densidad y el importe de la tarifa.

export interface Material { id: string; nombre: string; densidad: number; eurKg: number }

// Densidad en g/cm³ y precio orientativo €/kg (España, 2026). Cada empresa pone los suyos.
export const MATERIALES: Material[] = [
  { id: "s275", nombre: "Acero S275 / S235", densidad: 7.85, eurKg: 1.3 },
  { id: "s355", nombre: "Acero S355", densidad: 7.85, eurKg: 1.45 },
  { id: "galvanizado", nombre: "Acero galvanizado", densidad: 7.85, eurKg: 1.6 },
  { id: "c45", nombre: "Acero C45 / F-1140", densidad: 7.85, eurKg: 1.9 },
  { id: "42crmo4", nombre: "Acero 42CrMo4 / F-1252", densidad: 7.85, eurKg: 2.6 },
  { id: "inox304", nombre: "Inoxidable AISI 304", densidad: 7.93, eurKg: 4.2 },
  { id: "inox316", nombre: "Inoxidable AISI 316", densidad: 7.98, eurKg: 5.6 },
  { id: "al6082", nombre: "Aluminio 6082", densidad: 2.7, eurKg: 4.8 },
  { id: "al5754", nombre: "Aluminio 5754 (chapa)", densidad: 2.66, eurKg: 4.5 },
  { id: "al7075", nombre: "Aluminio 7075", densidad: 2.81, eurKg: 9 },
  { id: "laton", nombre: "Latón", densidad: 8.5, eurKg: 8.5 },
  { id: "bronce", nombre: "Bronce", densidad: 8.8, eurKg: 11 },
  { id: "cobre", nombre: "Cobre", densidad: 8.96, eurKg: 10.5 },
  { id: "fundicion", nombre: "Fundición gris", densidad: 7.2, eurKg: 2.2 },
  { id: "titanio", nombre: "Titanio grado 5", densidad: 4.43, eurKg: 38 },
  { id: "pom", nombre: "POM (Delrin)", densidad: 1.41, eurKg: 6.5 },
  { id: "pa6", nombre: "Nylon PA6", densidad: 1.14, eurKg: 6 },
  { id: "pehd", nombre: "Polietileno PE-HD", densidad: 0.95, eurKg: 5 },
];

export const FORMAS = {
  chapa: { nombre: "Chapa / pletina", campos: ["A", "B", "E"], ayuda: "A largo · B ancho · E espesor" },
  barra_redonda: { nombre: "Barra redonda", campos: ["D", "L"], ayuda: "D diámetro · L largo" },
  barra_rectangular: { nombre: "Barra cuadrada / rectangular", campos: ["A", "B", "L"], ayuda: "A × B sección · L largo" },
  tubo_redondo: { nombre: "Tubo redondo", campos: ["D", "E", "L"], ayuda: "D exterior · E pared · L largo" },
  tubo_rectangular: { nombre: "Tubo cuadrado / rectangular", campos: ["A", "B", "E", "L"], ayuda: "A × B · E pared · L largo" },
  perfil: { nombre: "Perfil (kg/m)", campos: ["P", "L"], ayuda: "P kg/m del perfil · L largo" },
} as const;
export type Forma = keyof typeof FORMAS;

export interface Geo { forma: Forma; A?: number | null; B?: number | null; E?: number | null; D?: number | null; L?: number | null; P?: number | null }

export interface Linea {
  id: string;
  grupo: "material" | "operacion" | "componente" | "extra";
  clave: string; // concepto del sector, material id o «otro»
  descripcion: string;
  detalle: string;
  cantidad: number; // por conjunto (o por pedido si porLote)
  unidad: string;
  precio: number; // coste unitario (€/unidad) antes del margen
  porLote: boolean;
  origen: "cota" | "texto" | "deducido" | "estimado" | "manual";
  confianza: "alta" | "media" | "baja";
  geo?: Geo | null; // material: medidas de una pieza
  piezas?: number; // material: piezas por conjunto
  materialId?: string | null;
  sinPrecio?: boolean; // componente sin precio en el catálogo
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};
export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Kg de UNA pieza en bruto. Sobremedida en mm por lado (mecanizado). 0 si faltan medidas. */
export function kgPieza(g: Geo, densidad: number, sobremedida = 0): number {
  const s = n(sobremedida);
  const A = n(g.A) + (g.forma === "chapa" || g.forma === "barra_rectangular" ? 2 * s : 0);
  const B = n(g.B) + (g.forma === "chapa" || g.forma === "barra_rectangular" ? 2 * s : 0);
  const D = n(g.D) + (g.forma === "barra_redonda" ? 2 * s : 0);
  const L = n(g.L) + (g.forma === "chapa" ? 0 : 2 * s);
  const E = n(g.E);
  let mm3 = 0;
  switch (g.forma) {
    case "chapa": mm3 = n(g.A) && n(g.B) && E ? A * B * E : 0; break;
    case "barra_redonda": mm3 = (Math.PI / 4) * D * D * L; break;
    case "barra_rectangular": mm3 = A * B * L; break;
    case "tubo_redondo": mm3 = E && D > 2 * E ? (Math.PI / 4) * (D * D - (D - 2 * E) ** 2) * L : 0; break;
    case "tubo_rectangular": mm3 = E && A > 2 * E && B > 2 * E ? (A * B - (A - 2 * E) * (B - 2 * E)) * L : 0; break;
    case "perfil": return r2(n(g.P) * (L / 1000));
  }
  return Math.round(((mm3 / 1000) * densidad) / 10) / 100; // cm³ × g/cm³ → g → kg, 2 decimales
}

export const fmtMm = (g: Geo) =>
  FORMAS[g.forma].campos.map((c) => `${c}${n(g[c as keyof Geo] as number) ? (g[c as keyof Geo] as number) : "?"}`).join(" × ");

/** Recalcula la cantidad (kg) de una línea de material a partir de sus medidas. */
export function recalcularMaterial(l: Linea, sobremedida = 0): Linea {
  if (l.grupo !== "material" || !l.geo) return l;
  const m = MATERIALES.find((x) => x.id === l.materialId);
  const piezas = Math.max(1, Math.round(n(l.piezas) || 1));
  const kg = m ? kgPieza(l.geo, m.densidad, sobremedida) : 0;
  return {
    ...l,
    cantidad: r2(kg * piezas),
    detalle: `${piezas} × ${FORMAS[l.geo.forma].nombre.toLowerCase()} ${fmtMm(l.geo)} mm${sobremedida ? ` (+${sobremedida} mm de bruto)` : ""} = ${r2(kg * piezas).toLocaleString("es-ES")} kg`,
  };
}

export interface Totales {
  costeConjunto: number; // coste de las líneas por unidad
  costeLote: number; // líneas que van una vez por pedido
  coste: number; // total de coste del pedido
  margen: number; // €
  base: number; // precio sin IVA
  iva: number;
  total: number;
  precioUnidad: number; // base / cantidad
  faltan: number; // líneas sin precio o sin cantidad
}

export const importe = (l: Linea) => r2(n(l.cantidad) * n(l.precio));

export function totales(lineas: Linea[], cantidad: number, margenPct: number, ivaPct: number): Totales {
  const q = Math.max(1, Math.round(n(cantidad) || 1));
  const costeConjunto = r2(lineas.filter((l) => !l.porLote).reduce((a, l) => a + importe(l), 0));
  const costeLote = r2(lineas.filter((l) => l.porLote).reduce((a, l) => a + importe(l), 0));
  const coste = r2(costeConjunto * q + costeLote);
  const base = r2(coste * (1 + n(margenPct) / 100));
  const iva = r2(base * (n(ivaPct) / 100));
  const faltan = lineas.filter((l) => !n(l.cantidad) || !n(l.precio)).length;
  return { costeConjunto, costeLote, coste, margen: r2(base - coste), base, iva, total: r2(base + iva), precioUnidad: r2(base / q), faltan };
}

/** Precio de venta de una línea (con el margen repartido), tal como lo ve el cliente. */
export const ventaLinea = (l: Linea, cantidad: number, margenPct: number) => {
  const q = l.porLote ? 1 : Math.max(1, Math.round(n(cantidad) || 1));
  return r2(importe(l) * q * (1 + n(margenPct) / 100));
};

export const eur = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions);

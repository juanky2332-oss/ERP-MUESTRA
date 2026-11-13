// De la lectura de la IA a líneas de presupuesto con los precios de la empresa (puro, testeable).
import { MATERIALES, recalcularMaterial, r2, type Linea } from "./calculo.ts";
import { precioConcepto, type Sector } from "./sectores.ts";
import type { Lectura } from "./ia-tipos.ts";

export interface Ajustes {
  margen?: number;
  iva?: number;
  validez?: number; // días
  formato?: "desglosado" | "unico"; // cómo ve el cliente el presupuesto por defecto
  condiciones?: string;
  tarifas?: Record<string, number>; // "<sector>.<clave>" y "material.<id>" → €
  manoObra?: number; // €/h de tu mano de obra (se aplica a las horas de tu gente sin tarifa propia)
  usarMercado?: boolean; // materiales sin precio propio → precio de mercado del día (por defecto sí)
  largoBarra?: number; // mm de las barras que compras (6000)
  chapaA?: number; // formato de chapa que compras (3000 × 1500)
  chapaB?: number;
}

/** Precio de mercado del día por material (€/kg); lo comparten todas las empresas. */
export type Mercado = Record<string, { eurKg: number; min?: number | null; max?: number | null; fuente?: string; url?: string | null; fecha: string }>;

/** Clave del catálogo propio: la referencia si la hay, si no la descripción normalizada. */
export const claveCatalogo = (descripcion: string, referencia?: string | null) =>
  (referencia?.trim() || descripcion)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.,/+-]+/g, " ")
    .trim()
    .slice(0, 120);

/** €/kg de un material: tu precio si lo has puesto; si no, el de mercado del día; si no, el orientativo. */
export const eurKgMaterial = (id: string | null | undefined, tarifas?: Record<string, number>, mercado?: Mercado | null, usarMercado = true) => {
  const t = id ? tarifas?.[`material.${id}`] : undefined;
  if (typeof t === "number" && t > 0) return t;
  const m = id && usarMercado ? mercado?.[id]?.eurKg : undefined;
  if (typeof m === "number" && m > 0) return m;
  return MATERIALES.find((x) => x.id === id)?.eurKg ?? 0;
};

let contador = 0;
const id = () => `l${Date.now().toString(36)}${(contador++).toString(36)}`;
const pos = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

export function aLineas(lec: Lectura, s: Sector, ajustes: Ajustes, catalogo: Map<string, number>, mercado?: Mercado | null): Linea[] {
  const t = ajustes.tarifas;
  const out: Linea[] = [];
  for (const e of lec.elementos || []) {
    const mat = MATERIALES.find((m) => m.id === e.material_id);
    out.push(
      recalcularMaterial(
        {
          id: id(), grupo: "material", clave: e.material_id || "otro",
          descripcion: `${e.descripcion}${mat ? ` · ${mat.nombre}` : e.material_texto ? ` · ${e.material_texto}` : ""}`,
          detalle: "", cantidad: 0, unidad: "kg", precio: eurKgMaterial(e.material_id, t, mercado, ajustes.usarMercado !== false), porLote: false,
          origen: e.origen, confianza: e.origen === "deducido" ? "media" : "alta",
          geo: { forma: e.forma, A: e.A, B: e.B, E: e.E, D: e.D, L: e.L, P: e.P }, piezas: Math.max(1, Math.round(pos(e.piezas) || 1)), materialId: e.material_id,
        },
        s.sobremedida,
      ),
    );
    if (e.nota) out[out.length - 1].detalle += ` · ${e.nota}`;
  }
  for (const o of lec.operaciones || []) {
    const c = s.conceptos.find((x) => x.clave === o.clave);
    out.push({
      id: id(), grupo: "operacion", clave: o.clave, descripcion: o.descripcion || c?.nombre || "Operación",
      detalle: o.nota || "", cantidad: r2(pos(o.cantidad)), unidad: c?.unidad || o.unidad || "ud",
      precio: c ? precioConcepto(s, o.clave, t, ajustes.manoObra) : catalogo.get(claveCatalogo(o.descripcion)) ?? 0,
      porLote: c?.porLote ?? o.por_lote, origen: o.origen, confianza: o.confianza,
    });
  }
  for (const k of lec.componentes || []) {
    const p = catalogo.get(claveCatalogo(k.descripcion, k.referencia));
    out.push({
      id: id(), grupo: "componente", clave: claveCatalogo(k.descripcion, k.referencia), // = clave del catálogo propio
      descripcion: [k.descripcion, k.referencia].filter(Boolean).join(" · "), detalle: k.caracteristicas || "",
      cantidad: pos(k.cantidad) || 1, unidad: "ud", precio: p ?? 0, porLote: false, origen: "cota", confianza: k.confianza, sinPrecio: p === undefined,
    });
  }
  return out;
}

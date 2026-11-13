// Lista de compra: de las líneas del presupuesto a lo que hay que pedir al almacén (puro, testeable).
// Agrupa por material y sección, encaja los cortes en barras comerciales y las piezas de chapa en formatos estándar,
// y separa lo que entra en el presupuesto (kg netos) de lo que realmente compras (barras y chapas enteras).
import { MATERIALES, kgPieza, r2, type Geo, type Linea } from "./calculo.ts";
import { tipoConcepto } from "./sectores.ts";

export interface OpcionesCompra {
  largoBarra?: number; // mm (barras, tubos y perfiles)
  chapaA?: number; // mm (formato de chapa)
  chapaB?: number;
  corte?: number; // mm de disco/sierra por corte
  sobremedida?: number; // mm por lado (mecanizado)
}

export interface FilaCompra {
  seccion: "barras" | "chapas" | "comercial" | "componentes";
  material: string;
  descripcion: string; // lo que pides: «Tubo 40×40×1,5»
  pedir: number; // cantidad a pedir
  unidad: string; // «barras de 6 m», «chapas 3000×1500», «kg», «m», «ud»…
  despiece: string; // qué sale de ahí: «4 × 720 mm · 2 × 1.150 mm»
  kgNetos: number; // kg que van en las piezas
  kgCompra: number; // kg que compras (barras/chapas enteras)
  precio: number; // €/kg o €/ud de compra
  importe: number; // lo que te cuesta comprarlo
  aprovechamiento: number | null; // % del material comprado que acaba en piezas
  aviso: string | null;
}

export interface ListaCompra { filas: FilaCompra[]; total: number; kgNetos: number; kgCompra: number; sinPrecio: number }

const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const mm = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const lineal = new Set(["barra_redonda", "barra_rectangular", "tubo_redondo", "tubo_rectangular", "perfil"]);

export function nombreSeccion(g: Geo, descripcion = ""): string {
  switch (g.forma) {
    case "barra_redonda": return `Redondo Ø${mm(n(g.D))}`;
    case "barra_rectangular": return n(g.A) === n(g.B) ? `Cuadrado macizo ${mm(n(g.A))}` : `Pletina / rectangular ${mm(n(g.A))}×${mm(n(g.B))}`;
    case "tubo_redondo": return `Tubo redondo Ø${mm(n(g.D))}×${mm(n(g.E))}`;
    case "tubo_rectangular": return `Tubo ${n(g.A) === n(g.B) ? "cuadrado" : "rectangular"} ${mm(n(g.A))}×${mm(n(g.B))}×${mm(n(g.E))}`;
    case "perfil": {
      const m = descripcion.match(/\b(IPE|IPN|HEA|HEB|HEM|UPN|UPE|L|T)\s?-?\s?\d+(?:\s?[x×]\s?\d+(?:[.,]\d+)?)*/i);
      return m ? `Perfil ${m[0].toUpperCase().replace(/\s+/g, " ")}` : `Perfil de ${mm(n(g.P))} kg/m`;
    }
    case "chapa": return `Chapa de ${mm(n(g.E))} mm`;
  }
}

const resumenCortes = (cortes: number[]) => {
  const c = new Map<number, number>();
  for (const x of cortes) c.set(x, (c.get(x) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[0] - a[0]).map(([l, k]) => `${k} × ${mm(l)} mm`).join(" · ");
};

/** Encaja cortes en barras (primero los más largos). Devuelve las barras con lo que queda libre en cada una. */
export function encajarBarras(cortes: number[], largo: number, corte = 3) {
  const barras: number[] = []; // espacio libre de cada barra
  let largos = 0;
  for (const c of [...cortes].sort((a, b) => b - a)) {
    if (c > largo) {
      largos++;
      continue;
    }
    const i = barras.findIndex((libre) => libre >= c);
    if (i >= 0) barras[i] -= c + corte;
    else barras.push(largo - c - corte);
  }
  return { barras: barras.length, sobrante: r2(barras.reduce((a, b) => a + Math.max(0, b), 0)), largos };
}

/** Coloca rectángulos en chapas por filas (anidado sencillo, girando las piezas si caben mejor). */
export function encajarChapas(piezas: { a: number; b: number }[], A: number, B: number, corte = 3) {
  const [W, H] = A >= B ? [A, B] : [B, A];
  const ps = piezas
    .map(({ a, b }) => (a >= b ? { w: a, h: b } : { w: b, h: a })) // tumbadas: lado largo a lo largo de la chapa
    .sort((x, y) => y.h - x.h || y.w - x.w);
  type Fila = { y: number; h: number; x: number };
  const chapas: { filas: Fila[]; alto: number }[] = [];
  let grandes = 0;
  for (const p of ps) {
    let { w, h } = p;
    if (w > W || h > H) {
      if (h <= W && w <= H) [w, h] = [h, w];
      else {
        grandes++;
        continue;
      }
    }
    let puesta = false;
    for (const ch of chapas) {
      for (const f of ch.filas) {
        if (h <= f.h && f.x + w <= W) {
          f.x += w + corte;
          puesta = true;
          break;
        }
      }
      if (!puesta && ch.alto + h <= H) {
        ch.filas.push({ y: ch.alto, h, x: w + corte });
        ch.alto += h + corte;
        puesta = true;
      }
      if (puesta) break;
    }
    if (!puesta) chapas.push({ filas: [{ y: 0, h, x: w + corte }], alto: h + corte });
  }
  return { chapas: chapas.length, grandes };
}

export function listaCompra(lineas: Linea[], cantidad: number, sectorId: string, o: OpcionesCompra = {}): ListaCompra {
  const q = Math.max(1, Math.round(n(cantidad) || 1));
  const largo = n(o.largoBarra) || 6000;
  const A = n(o.chapaA) || 3000;
  const B = n(o.chapaB) || 1500;
  const corte = o.corte ?? 3;
  const s = n(o.sobremedida);
  const filas: FilaCompra[] = [];

  // ── Material por medidas: agrupado por material + sección ──
  const grupos = new Map<string, { l: Linea; mat: (typeof MATERIALES)[number] | undefined; cortes: number[]; rects: { a: number; b: number }[]; kgNetos: number; precio: number }>();
  for (const l of lineas) {
    if (l.grupo !== "material") continue;
    const veces = (l.porLote ? 1 : q) * Math.max(1, Math.round(n(l.piezas) || 1));
    const g = l.geo;
    const mat = MATERIALES.find((m) => m.id === l.materialId);
    const precio = n(l.precio);
    if (!g || !mat) {
      // Sin medidas o sin material: va tal cual, en kg.
      filas.push({ seccion: "comercial", material: mat?.nombre || "Sin indicar", descripcion: l.descripcion, pedir: r2(n(l.cantidad) * (l.porLote ? 1 : q)), unidad: l.unidad || "kg", despiece: l.detalle, kgNetos: r2(n(l.cantidad) * (l.porLote ? 1 : q)), kgCompra: r2(n(l.cantidad) * (l.porLote ? 1 : q)), precio, importe: r2(n(l.cantidad) * (l.porLote ? 1 : q) * precio), aprovechamiento: null, aviso: !mat ? "Falta el material: indícalo para pedirlo bien." : null });
      continue;
    }
    const clave = g.forma === "chapa" ? `${mat.id}|chapa|${n(g.E)}` : `${mat.id}|${g.forma}|${n(g.A)}|${n(g.B)}|${n(g.D)}|${n(g.E)}|${n(g.P)}`;
    const gr = grupos.get(clave) || { l, mat, cortes: [], rects: [], kgNetos: 0, precio };
    gr.kgNetos += kgPieza(g, mat.densidad, s) * veces;
    gr.precio = Math.max(gr.precio, precio);
    for (let i = 0; i < Math.min(veces, 5000); i++) {
      if (g.forma === "chapa") gr.rects.push({ a: n(g.A) + 2 * s, b: n(g.B) + 2 * s });
      else gr.cortes.push(n(g.L) + 2 * s);
    }
    grupos.set(clave, gr);
  }

  for (const gr of grupos.values()) {
    const g = gr.l.geo!;
    const dens = gr.mat!.densidad;
    const desc = `${nombreSeccion(g, gr.l.descripcion)} · ${gr.mat!.nombre}`;
    if (lineal.has(g.forma)) {
      const validos = gr.cortes.filter((c) => c > 0);
      if (!validos.length) {
        filas.push({ seccion: "barras", material: gr.mat!.nombre, descripcion: desc, pedir: 0, unidad: "barras", despiece: "", kgNetos: r2(gr.kgNetos), kgCompra: 0, precio: gr.precio, importe: 0, aprovechamiento: null, aviso: "Faltan los largos para calcular las barras." });
        continue;
      }
      const e = encajarBarras(validos, largo, corte);
      const kgM = kgPieza({ ...g, L: 1000 }, dens);
      const largosExtra = validos.filter((c) => c > largo).reduce((a, c) => a + Math.ceil(c / largo), 0);
      const nBarras = e.barras + largosExtra;
      const kgCompra = r2(kgM * (largo / 1000) * nBarras);
      filas.push({
        seccion: "barras", material: gr.mat!.nombre, descripcion: desc, pedir: nBarras, unidad: `barras de ${mm(largo / 1000)} m`,
        despiece: resumenCortes(validos), kgNetos: r2(gr.kgNetos), kgCompra, precio: gr.precio, importe: r2(kgCompra * gr.precio),
        aprovechamiento: kgCompra ? Math.min(100, Math.round((gr.kgNetos / kgCompra) * 100)) : null,
        aviso: e.largos ? `${e.largos} ${e.largos === 1 ? "pieza es más larga" : "piezas son más largas"} que la barra: pide a medida o empalma.` : null,
      });
    } else {
      const validos = gr.rects.filter((r) => r.a > 0 && r.b > 0);
      const E = n(g.E);
      if (!validos.length || !E) {
        filas.push({ seccion: "chapas", material: gr.mat!.nombre, descripcion: desc, pedir: 0, unidad: "chapas", despiece: "", kgNetos: r2(gr.kgNetos), kgCompra: 0, precio: gr.precio, importe: 0, aprovechamiento: null, aviso: "Faltan medidas o espesor para calcular las chapas." });
        continue;
      }
      const e = encajarChapas(validos, A, B, corte);
      const kgChapa = kgPieza({ forma: "chapa", A, B, E }, dens);
      const kgGrandes = validos.filter((r) => !((r.a <= A && r.b <= B) || (r.a <= B && r.b <= A))).reduce((a, r) => a + kgPieza({ forma: "chapa", A: r.a, B: r.b, E }, dens), 0);
      const kgCompra = r2(kgChapa * e.chapas + kgGrandes);
      const piezasTxt = new Map<string, number>();
      for (const r of validos) {
        const k = `${mm(Math.max(r.a, r.b))} × ${mm(Math.min(r.a, r.b))}`;
        piezasTxt.set(k, (piezasTxt.get(k) || 0) + 1);
      }
      filas.push({
        seccion: "chapas", material: gr.mat!.nombre, descripcion: desc, pedir: e.chapas, unidad: `chapas ${mm(A)}×${mm(B)}`,
        despiece: [...piezasTxt.entries()].map(([k, c]) => `${c} × ${k} mm`).join(" · "), kgNetos: r2(gr.kgNetos), kgCompra, precio: gr.precio,
        importe: r2(kgCompra * gr.precio), aprovechamiento: kgCompra ? Math.min(100, Math.round((gr.kgNetos / kgCompra) * 100)) : null,
        aviso: e.grandes ? `${e.grandes} ${e.grandes === 1 ? "pieza no cabe" : "piezas no caben"} en una chapa de ${mm(A)}×${mm(B)}: pide formato mayor o a medida.` : null,
      });
    }
  }

  // ── Material comercial que en el sector va por metros, m² o unidades (perfiles de aluminio, vidrio, cable…) ──
  for (const l of lineas) {
    const esMaterial = (l.grupo === "operacion" && tipoConcepto(sectorId, l.clave) === "material");
    if (!esMaterial && l.grupo !== "componente") continue;
    const cant = r2(n(l.cantidad) * (l.porLote ? 1 : q));
    filas.push({
      seccion: l.grupo === "componente" ? "componentes" : "comercial", material: "", descripcion: l.descripcion, pedir: cant, unidad: l.unidad,
      despiece: l.detalle, kgNetos: 0, kgCompra: 0, precio: n(l.precio), importe: r2(cant * n(l.precio)), aprovechamiento: null,
      aviso: !n(l.precio) ? "Sin precio: búscalo o pídelo al proveedor." : null,
    });
  }

  const orden = { barras: 0, chapas: 1, comercial: 2, componentes: 3 };
  filas.sort((a, b) => orden[a.seccion] - orden[b.seccion] || a.descripcion.localeCompare(b.descripcion, "es"));
  return {
    filas,
    total: r2(filas.reduce((a, f) => a + f.importe, 0)),
    kgNetos: r2(filas.reduce((a, f) => a + f.kgNetos, 0)),
    kgCompra: r2(filas.reduce((a, f) => a + f.kgCompra, 0)),
    sinPrecio: filas.filter((f) => !f.precio).length,
  };
}

export const SECCIONES_COMPRA: Record<FilaCompra["seccion"], string> = {
  barras: "Barras, tubos y perfiles", chapas: "Chapas", comercial: "Material comercial", componentes: "Componentes y normalizados",
};

/** CSV con «;» y BOM para que Excel en español lo abra bien. */
export function compraCsv(l: ListaCompra, conPrecios = true): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const num = (v: number) => (v ? String(r2(v)).replace(".", ",") : "");
  const cab = ["Sección", "Material", "Descripción", "Pedir", "Unidad", "Despiece", "Kg en piezas", "Kg a comprar", ...(conPrecios ? ["Precio", "Importe"] : []), "Aviso"];
  const filas = l.filas.map((f) => [SECCIONES_COMPRA[f.seccion], f.material, f.descripcion, num(f.pedir), f.unidad, f.despiece, num(f.kgNetos), num(f.kgCompra), ...(conPrecios ? [num(f.precio), num(f.importe)] : []), f.aviso || ""].map(esc).join(";"));
  return "﻿" + [cab.map(esc).join(";"), ...filas].join("\r\n");
}

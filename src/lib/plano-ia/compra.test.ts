import { describe, it } from "node:test";
import { expect } from "./_expect.ts";
import { encajarBarras, encajarChapas, listaCompra, compraCsv, nombreSeccion } from "./compra.ts";
import { recalcularMaterial, type Linea } from "./calculo.ts";
import { precioConcepto, sectorDe, tipoConcepto, usaHoraManoObra } from "./sectores.ts";
import { eurKgMaterial } from "./partidas.ts";

const mat = (c: Partial<Linea>): Linea =>
  recalcularMaterial({ id: Math.random().toString(36), grupo: "material", clave: "inox304", materialId: "inox304", descripcion: "Pieza", detalle: "", cantidad: 0, unidad: "kg", precio: 4.2, porLote: false, origen: "cota", confianza: "alta", geo: { forma: "tubo_rectangular", A: 40, B: 40, E: 1.5, L: 850 }, piezas: 4, ...c });

describe("encajar en barras", () => {
  it("7 cortes de 850 caben en 1 barra de 6 m", () => expect(encajarBarras(Array(7).fill(850), 6000).barras).toBe(1));
  it("8 cortes de 850 necesitan 2 (por el disco)", () => expect(encajarBarras(Array(8).fill(850), 6000, 3).barras).toBe(2));
  it("una pieza más larga que la barra se avisa", () => expect(encajarBarras([7000], 6000).largos).toBe(1));
});

describe("encajar en chapas", () => {
  it("dos chapas de 1500×1500 en una de 3000×1500 (con el corte no caben exactas → 2)", () => expect(encajarChapas([{ a: 1500, b: 1500 }, { a: 1500, b: 1500 }], 3000, 1500).chapas).toBe(2));
  it("cuatro de 700×700 caben en una", () => expect(encajarChapas(Array(4).fill({ a: 700, b: 700 }), 3000, 1500).chapas).toBe(1));
  it("una pieza mayor que la chapa se avisa", () => expect(encajarChapas([{ a: 4000, b: 2000 }], 3000, 1500).grandes).toBe(1));
});

describe("lista de compra", () => {
  it("agrupa por sección y multiplica por unidades", () => {
    const l = listaCompra([mat({}), mat({ piezas: 4, geo: { forma: "tubo_rectangular", A: 40, B: 40, E: 1.5, L: 600 } })], 2, "calderia");
    expect(l.filas).toHaveLength(1);
    const f = l.filas[0];
    expect(f.descripcion).toContain("Tubo cuadrado 40×40×1,5");
    expect(f.despiece).toBe("8 × 850 mm · 8 × 600 mm");
    expect(f.pedir).toBe(2); // 11,6 m en barras de 6 m
    expect(f.kgCompra).toBeGreaterThan(f.kgNetos);
    expect(f.importe).toBeCloseTo(f.kgCompra * 4.2, 1);
  });
  it("chapa por espesor con formato propio", () => {
    const l = listaCompra([mat({ geo: { forma: "chapa", A: 1200, B: 600, E: 1.5 }, piezas: 1 })], 1, "calderia", { chapaA: 2000, chapaB: 1000 });
    expect(l.filas[0].unidad).toBe("chapas 2000×1000");
    expect(l.filas[0].pedir).toBe(1);
  });
  it("componentes y material comercial del sector entran; la mano de obra no", () => {
    const base = { detalle: "", porLote: false, origen: "cota", confianza: "alta" } as const;
    const l = listaCompra([
      { ...base, id: "a", grupo: "componente", clave: "m10", descripcion: "Tornillo M10×30", cantidad: 8, unidad: "ud", precio: 0.2 },
      { ...base, id: "b", grupo: "operacion", clave: "vidrio", descripcion: "Vidrio", cantidad: 2.5, unidad: "m2", precio: 38 },
      { ...base, id: "c", grupo: "operacion", clave: "montaje_obra", descripcion: "Colocación", cantidad: 3, unidad: "h", precio: 40 },
    ], 2, "carpinteria_metalica");
    expect(l.filas.map((f) => f.descripcion)).toEqual(["Vidrio", "Tornillo M10×30"]);
    expect(l.filas[1].pedir).toBe(16);
    expect(l.total).toBe(r(5 * 38 + 16 * 0.2));
  });
  it("CSV para Excel con ; y BOM", () => {
    const csv = compraCsv(listaCompra([mat({})], 1, "calderia"));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[0]).toContain('"Pedir";"Unidad"');
  });
  it("nombre de perfiles normalizados", () => expect(nombreSeccion({ forma: "perfil", P: 8.1, L: 1000 }, "Viga IPE 100 de cubierta")).toBe("Perfil IPE 100"));
});

describe("mano de obra y precios", () => {
  const s = sectorDe("calderia");
  it("tu hora se aplica a las horas de tu gente, no a las máquinas ni a lo que tiene tarifa propia", () => {
    expect(usaHoraManoObra(s, "montaje_taller")).toBe(true);
    expect(precioConcepto(s, "montaje_taller", {}, 33)).toBe(33);
    expect(precioConcepto(s, "montaje_taller", { "calderia.montaje_taller": 40 }, 33)).toBe(40);
    expect(precioConcepto(s, "corte_laser", {}, 33)).toBe(2.5);
    expect(precioConcepto(sectorDe("mecanizado"), "torno_cnc", {}, 33)).toBe(45);
  });
  it("clasifica las partidas", () => {
    expect(tipoConcepto("mecanizado", "torno_cnc")).toBe("maquina");
    expect(tipoConcepto("calderia", "galvanizado")).toBe("externo");
    expect(tipoConcepto("carpinteria_metalica", "vidrio")).toBe("material");
    expect(tipoConcepto("calderia", "soldadura_tig")).toBe("mano_obra");
  });
  it("material: tu precio > mercado del día > orientativo", () => {
    const m = { inox304: { eurKg: 3.9, fecha: "2026-11-08" } };
    expect(eurKgMaterial("inox304", { "material.inox304": 4.5 }, m)).toBe(4.5);
    expect(eurKgMaterial("inox304", {}, m)).toBe(3.9);
    expect(eurKgMaterial("inox304", {}, m, false)).toBe(4.2);
    expect(eurKgMaterial("inox304", {}, null)).toBe(4.2);
  });
});

const r = (v: number) => Math.round(v * 100) / 100;

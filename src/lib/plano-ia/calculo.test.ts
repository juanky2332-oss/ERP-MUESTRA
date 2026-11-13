import { describe, it } from "node:test";
import { expect } from "./_expect.ts";
import { kgPieza, totales, recalcularMaterial, ventaLinea, type Linea } from "./calculo.ts";
import { aLineas, claveCatalogo } from "./partidas.ts";
import { sectorDe } from "./sectores.ts";

describe("kgPieza", () => {
  it("chapa 1000×1000×1 de acero = 7,85 kg", () => expect(kgPieza({ forma: "chapa", A: 1000, B: 1000, E: 1 }, 7.85)).toBe(7.85));
  it("barra Ø50 × 1000 de acero ≈ 15,41 kg", () => expect(kgPieza({ forma: "barra_redonda", D: 50, L: 1000 }, 7.85)).toBeCloseTo(15.41, 1));
  it("tubo 40×40×1,5 × 1000 de inox ≈ 1,83 kg", () => expect(kgPieza({ forma: "tubo_rectangular", A: 40, B: 40, E: 1.5, L: 1000 }, 7.93)).toBeCloseTo(1.83, 1));
  it("sin medidas = 0, nunca inventa", () => expect(kgPieza({ forma: "chapa", A: 1000, B: null, E: 2 }, 7.85)).toBe(0));
  it("sobremedida de bruto en mecanizado", () => expect(kgPieza({ forma: "barra_redonda", D: 30, L: 100 }, 7.85, 3)).toBeGreaterThan(kgPieza({ forma: "barra_redonda", D: 30, L: 100 }, 7.85)));
  it("perfil por kg/m", () => expect(kgPieza({ forma: "perfil", P: 5.2, L: 2000 }, 7.85)).toBe(10.4));
});

const L = (c: Partial<Linea>): Linea => ({ id: "x", grupo: "operacion", clave: "x", descripcion: "x", detalle: "", cantidad: 1, unidad: "ud", precio: 10, porLote: false, origen: "manual", confianza: "alta", ...c });

describe("totales", () => {
  it("líneas por unidad × cantidad + líneas por pedido una vez, margen e IVA", () => {
    const t = totales([L({ cantidad: 2, precio: 10 }), L({ porLote: true, cantidad: 1, precio: 50 })], 3, 20, 21);
    expect(t.coste).toBe(110);
    expect(t.base).toBe(132);
    expect(t.iva).toBe(27.72);
    expect(t.total).toBe(159.72);
    expect(t.precioUnidad).toBe(44);
  });
  it("cuenta las líneas sin precio", () => expect(totales([L({ precio: 0 })], 1, 0, 21).faltan).toBe(1));
  it("la venta de las líneas suma la base", () => {
    const ls = [L({ cantidad: 2, precio: 10 }), L({ porLote: true, precio: 50 })];
    expect(ls.reduce((a, l) => a + ventaLinea(l, 3, 20), 0)).toBe(totales(ls, 3, 20, 21).base);
  });
});

describe("aLineas", () => {
  it("material por geometría, operaciones con tarifa de la empresa y componentes del catálogo", () => {
    const s = sectorDe("calderia");
    const ls = aLineas(
      {
        legible: true, tipo_documento: "plano_conjunto", titulo: "Mesa", resumen: "", cantidad_conjuntos: 6,
        elementos: [{ descripcion: "Tablero", material_id: "inox304", material_texto: null, forma: "chapa", A: 1580, B: 780, E: 1.5, D: null, L: null, P: null, piezas: 1, origen: "deducido", nota: null }],
        operaciones: [{ clave: "soldadura_tig", descripcion: "Soldadura", cantidad: 3.2, unidad: "m", por_lote: false, origen: "estimado", confianza: "media", nota: null }],
        componentes: [{ descripcion: "Contera regulable", referencia: null, caracteristicas: null, cantidad: 4, confianza: "alta" }],
        dudas: [], supuestos: [],
      },
      s, { tarifas: { "calderia.soldadura_tig": 25 } }, new Map([[claveCatalogo("Contera regulable"), 2.5]]),
    );
    expect(ls[0].cantidad).toBeCloseTo(14.66, 1);
    expect(ls[0].precio).toBe(4.2);
    expect(ls[1].precio).toBe(25);
    expect(ls[2].precio).toBe(2.5);
    expect(ls[2].sinPrecio).toBe(false);
  });
  it("recalcular material con más piezas", () => {
    const l = recalcularMaterial(L({ grupo: "material", materialId: "s275", geo: { forma: "chapa", A: 1000, B: 1000, E: 1 }, piezas: 2, unidad: "kg" }));
    expect(l.cantidad).toBe(15.7);
  });
});

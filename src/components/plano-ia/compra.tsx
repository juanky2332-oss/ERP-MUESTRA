"use client";
import { useMemo, useState } from "react";
import { importe, eur, r2, type Linea } from "@/lib/plano-ia/calculo";
import { listaCompra, compraCsv, SECCIONES_COMPRA, type FilaCompra, type ListaCompra } from "@/lib/plano-ia/compra";
import { tipoConcepto, TIPOS_PARTIDA, type TipoPartida } from "@/lib/plano-ia/sectores";
import { Boton, Tarjeta, Insignia } from "./ui";

const kg = (v: number) => (v ? `${r2(v).toLocaleString("es-ES")} kg` : "—");
const cifra = (v: number) => r2(v).toLocaleString("es-ES", { maximumFractionDigits: 2 });

type Cat = TipoPartida | "componente" | "otros";
const NOMBRES: Record<Cat, string> = { ...TIPOS_PARTIDA, componente: "Componentes", otros: "Otros" };
const COLORES: Record<Cat, string> = { material: "bg-sky-400", componente: "bg-cyan-300", mano_obra: "bg-fuchsia-400", maquina: "bg-violet-400", externo: "bg-amber-300", obra: "bg-emerald-300", otros: "bg-white/40" };

export const categoria = (l: Linea, sectorId: string): Cat =>
  l.grupo === "material" ? "material" : l.grupo === "componente" ? "componente" : l.grupo === "operacion" ? tipoConcepto(sectorId, l.clave) : "otros";

/** Desglose interno del coste: lo que es material, mano de obra, máquina, subcontratado… (solo lo ves tú). */
export function Desglose({ lineas, cantidad, sectorId }: { lineas: Linea[]; cantidad: number; sectorId: string }) {
  const d = useMemo(() => {
    const m = new Map<Cat, { coste: number; horas: number }>();
    for (const l of lineas) {
      const c = categoria(l, sectorId);
      const veces = l.porLote ? 1 : cantidad;
      const x = m.get(c) || { coste: 0, horas: 0 };
      x.coste += importe(l) * veces;
      if (l.unidad === "h") x.horas += (Number(l.cantidad) || 0) * veces;
      m.set(c, x);
    }
    const total = [...m.values()].reduce((a, x) => a + x.coste, 0);
    return { filas: [...m.entries()].sort((a, b) => b[1].coste - a[1].coste), total };
  }, [lineas, cantidad, sectorId]);
  if (!d.total) return null;
  const horas = d.filas.reduce((a, [, x]) => a + x.horas, 0);
  return (
    <div className="grid gap-2">
      <p className="text-xs text-white/60">De dónde sale el coste{horas ? ` · ${cifra(horas)} h en total` : ""}</p>
      <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
        {d.filas.map(([c, x]) => <span key={c} className={COLORES[c]} style={{ width: `${(x.coste / d.total) * 100}%` }} title={NOMBRES[c]} />)}
      </div>
      <dl className="grid gap-1 text-xs">
        {d.filas.map(([c, x]) => (
          <div key={c} className="flex items-center justify-between gap-2 text-white/70">
            <dt className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${COLORES[c]}`} />{NOMBRES[c]}{x.horas ? <span className="text-white/45">· {cifra(x.horas)} h</span> : null}</dt>
            <dd className="tabular text-white">{eur(r2(x.coste))} <span className="text-white/45">{Math.round((x.coste / d.total) * 100)} %</span></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function descargar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function imprimir(l: ListaCompra, titulo: string, numero: string, conPrecios: boolean) {
  const w = window.open("", "_blank");
  if (!w) return;
  const secciones = (Object.keys(SECCIONES_COMPRA) as FilaCompra["seccion"][]).filter((s) => l.filas.some((f) => f.seccion === s));
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pedido de material · ${esc(numero)}</title><style>
    body{font:12px/1.4 system-ui,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0}h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#555}
    table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:5px 6px;text-align:left;vertical-align:top}th{font-size:10px;text-transform:uppercase;color:#666}
    .n{text-align:right;white-space:nowrap}.d{color:#555;font-size:11px}.av{color:#a15c00;font-size:11px}.tot{margin-top:14px;text-align:right;font-size:14px}
  </style></head><body><h1>Pedido de material${conPrecios ? " (con precios)" : ""}</h1><p>${esc(numero)} · ${esc(titulo)} · ${new Date().toLocaleDateString("es-ES")}</p>
  ${secciones.map((s) => `<h2>${SECCIONES_COMPRA[s]}</h2><table><thead><tr><th>Artículo</th><th class="n">Pedir</th><th>Unidad</th><th>Despiece</th>${s === "barras" || s === "chapas" ? '<th class="n">Kg</th>' : ""}${conPrecios ? '<th class="n">Precio</th><th class="n">Importe</th>' : ""}</tr></thead><tbody>
    ${l.filas.filter((f) => f.seccion === s).map((f) => `<tr><td><b>${esc(f.descripcion)}</b>${f.aviso ? `<div class="av">⚠ ${esc(f.aviso)}</div>` : ""}</td><td class="n"><b>${cifra(f.pedir)}</b></td><td>${esc(f.unidad)}</td><td class="d">${esc(f.despiece)}</td>${s === "barras" || s === "chapas" ? `<td class="n">${cifra(f.kgCompra)}</td>` : ""}${conPrecios ? `<td class="n">${f.precio ? eur(f.precio) : "—"}</td><td class="n">${f.importe ? eur(f.importe) : "—"}</td>` : ""}</tr>`).join("")}
  </tbody></table>`).join("")}
  ${conPrecios ? `<p class="tot">Total material a comprar: <b>${eur(l.total)}</b> sin IVA</p>` : ""}
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

/** Lista de material a comprar, detallada: barras y chapas enteras que hay que pedir, despiece y coste de compra. */
export function ListaDeCompra({ lineas, cantidad, sectorId, sobremedida, opciones, titulo, numero, cobrarRetal }: {
  lineas: Linea[]; cantidad: number; sectorId: string; sobremedida: number; titulo: string; numero: string; cobrarRetal?: (euros: number) => void;
  opciones?: { largoBarra?: number; chapaA?: number; chapaB?: number };
}) {
  const [abierta, setAbierta] = useState(false);
  const lista = useMemo(() => listaCompra(lineas, cantidad, sectorId, { ...opciones, sobremedida }), [lineas, cantidad, sectorId, sobremedida, opciones]);
  const enPresupuesto = useMemo(() => r2(lineas.filter((l) => l.grupo === "material").reduce((a, l) => a + importe(l) * (l.porLote ? 1 : cantidad), 0)), [lineas, cantidad]);
  if (!lista.filas.length) return null;
  const secciones = (Object.keys(SECCIONES_COMPRA) as FilaCompra["seccion"][]).filter((s) => lista.filas.some((f) => f.seccion === s));
  const merma = lista.kgCompra && lista.kgNetos ? Math.round((1 - lista.kgNetos / lista.kgCompra) * 100) : 0;
  // Lo que cuesta el material que sobra de barras y chapas enteras (no va en los kg netos del presupuesto).
  const retal = r2(lista.filas.filter((f) => f.seccion === "barras" || f.seccion === "chapas").reduce((a, f) => a + Math.max(0, f.kgCompra - f.kgNetos) * f.precio, 0));
  const yaCobrado = lineas.find((l) => l.clave === "retal");
  const nombre = `pedido-material-${numero || "presupuesto"}`.replace(/[^\w-]+/g, "-");

  return (
    <Tarjeta
      titulo={`🛒 Lista de material para comprar (${lista.filas.length})`}
      sub={`Para ${cantidad} ${cantidad === 1 ? "unidad" : "unidades"} · compra estimada ${eur(lista.total)}${lista.kgCompra ? ` · ${kg(lista.kgCompra)} a pedir` : ""}`}
      extra={<Boton pequeno onClick={() => setAbierta(!abierta)}>{abierta ? "Ocultar" : "Ver lista"}</Boton>}
    >
      {!abierta ? (
        <p className="text-sm text-txt-3">Todo lo que hay que pedir al almacén: barras y chapas enteras con su despiece, material comercial y componentes. Descárgala en Excel o imprímela para el proveedor.</p>
      ) : (
        <div className="grid gap-4">
          {lista.kgCompra > 0 && (
            <div className="grid gap-2 rounded-xl bg-card-2 p-3 text-sm sm:grid-cols-3">
              <p><span className="block text-[11px] text-txt-3">Kg en las piezas (va al presupuesto)</span><b className="tabular">{kg(lista.kgNetos)}</b></p>
              <p><span className="block text-[11px] text-txt-3">Kg que compras (barras y chapas enteras)</span><b className="tabular">{kg(lista.kgCompra)}</b></p>
              <p><span className="block text-[11px] text-txt-3">Sobrante o retal</span><b className="tabular">{merma} %</b></p>
              {retal > 0 && cobrarRetal && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-2 sm:col-span-3">
                  <span className="text-xs text-txt-2">El sobrante te cuesta <b className="tabular">{eur(retal)}</b>.{yaCobrado ? ` Ya lo cobras (${eur(yaCobrado.precio)}).` : " Si no lo vas a aprovechar, cóbralo."}</span>
                  {(!yaCobrado || yaCobrado.precio !== retal) && <Boton pequeno onClick={() => cobrarRetal(retal)}>{yaCobrado ? "Actualizar el sobrante" : "Cobrar el sobrante en el presupuesto"}</Boton>}
                </div>
              )}
            </div>
          )}
          {secciones.map((s) => (
            <div key={s}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-txt-3">{SECCIONES_COMPRA[s]}</p>
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-txt-3">
                      <th className="px-2 pb-1 font-medium">Artículo</th><th className="w-20 px-2 pb-1 text-right font-medium">Pedir</th><th className="w-36 px-2 pb-1 font-medium">Unidad</th>
                      <th className="w-24 px-2 pb-1 text-right font-medium">Precio</th><th className="w-24 px-2 pb-1 text-right font-medium">Compra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.filas.filter((f) => f.seccion === s).map((f, i) => (
                      <tr key={i} className="border-t border-borde align-top">
                        <td className="px-2 py-1.5">
                          <p className="font-medium">{f.descripcion}</p>
                          {f.despiece && <p className="text-[11px] text-txt-3">{f.despiece}</p>}
                          {f.aprovechamiento !== null && <p className="text-[11px] text-txt-3">{kg(f.kgNetos)} en piezas de {kg(f.kgCompra)} comprados · aprovechas el {f.aprovechamiento} %</p>}
                          {f.aviso && <p className="mt-0.5"><Insignia tono="aviso">⚠ {f.aviso}</Insignia></p>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular">{cifra(f.pedir) || "—"}</td>
                        <td className="px-2 py-1.5 text-txt-2">{f.unidad}</td>
                        <td className="px-2 py-1.5 text-right tabular">{f.precio ? `${eur(f.precio)}${f.kgCompra ? "/kg" : ""}` : "—"}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular">{f.importe ? eur(f.importe) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-3">
            <p className="text-sm">
              Compra total estimada: <b className="tabular">{eur(lista.total)}</b>
              {lista.kgCompra > 0 && enPresupuesto > 0 && <span className="text-txt-3"> · en el presupuesto va {eur(enPresupuesto)} de material por kg neto</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <Boton pequeno onClick={() => descargar(`${nombre}.csv`, compraCsv(lista), "text/csv;charset=utf-8")}>⬇ Excel</Boton>
              <Boton pequeno onClick={() => imprimir(lista, titulo, numero, false)} title="Sin precios, para mandarlo al proveedor">🖨 Pedido para el proveedor</Boton>
              <Boton pequeno onClick={() => imprimir(lista, titulo, numero, true)}>🖨 Con precios</Boton>
            </div>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}

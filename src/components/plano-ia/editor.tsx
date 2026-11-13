"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { totales, importe, recalcularMaterial, eur, r2, MATERIALES, FORMAS, type Linea, type Forma } from "@/lib/plano-ia/calculo";
import { sectorDe, precioConcepto, usaHoraManoObra, tipoConcepto } from "@/lib/plano-ia/sectores";
import { eurKgMaterial, type Ajustes, type Mercado } from "@/lib/plano-ia/partidas";
import { Boton, Insignia, Tarjeta, avisar } from "./ui";
import { ClientCombobox } from "@/components/contacts/client-combobox";
import { guardarPlanoIA, precioMercadoComponente, pasarAPresupuestoERP, actualizarMercadoPlano, type PlanoIA } from "@/actions/plano-ia";
import { Desglose, ListaDeCompra } from "./compra";

type P = PlanoIA;

const ORIGEN: Record<string, { txt: string; tono: "bien" | "acento" | "aviso" | "neutro"; ayuda: string }> = {
  cota: { txt: "Del plano", tono: "bien", ayuda: "Medida o dato escrito en el plano" },
  texto: { txt: "Del plano", tono: "bien", ayuda: "Indicado en las notas del plano" },
  deducido: { txt: "Calculado", tono: "acento", ayuda: "Calculado a partir de cotas del plano" },
  estimado: { txt: "Estimado", tono: "aviso", ayuda: "Estimación de la IA: revísalo" },
  manual: { txt: "Tuyo", tono: "neutro", ayuda: "Línea añadida o cambiada por ti" },
};
const GRUPOS: [Linea["grupo"], string][] = [["material", "Material"], ["operacion", "Fabricación y servicios"], ["componente", "Componentes"], ["extra", "Otros"]];
const num = (v: string) => {
  const x = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(x) && x >= 0 ? x : 0;
};
const fmt = (v: number, dec = 0) => (v ? r2(v).toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: 2, useGrouping: false }) : "");

function Numero({ valor, cambiar, className = "", sufijo, dec = 0 }: { valor: number; cambiar: (v: number) => void; className?: string; sufijo?: string; dec?: number }) {
  const [txt, setTxt] = useState(fmt(valor));
  const [foco, setFoco] = useState(false);
  const mostrado = foco ? txt : fmt(valor, dec);
  return (
    <span className="relative block">
      <input
        className={`input-celda text-right tabular ${sufijo ? "pr-7" : ""} ${className}`}
        inputMode="decimal"
        value={mostrado}
        placeholder="0"
        onFocus={() => (setFoco(true), setTxt(fmt(valor)))}
        onBlur={() => setFoco(false)}
        onChange={(e) => {
          setTxt(e.target.value);
          cambiar(num(e.target.value));
        }}
      />
      {sufijo && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-txt-3">{sufijo}</span>}
    </span>
  );
}

export function Editor({ inicial, ajustes, mercado: mercadoInicial, mercadoActualizado, soloLectura = false }: { inicial: P; ajustes?: Ajustes; mercado?: Mercado | null; mercadoActualizado?: string | null; soloLectura?: boolean }) {
  const demo = soloLectura;
  const ejemplo = soloLectura;
  const tarifas = ajustes?.tarifas;
  const [mercado, setMercado] = useState<Mercado | null>(mercadoInicial || null);
  const [mercadoFecha, setMercadoFecha] = useState<string | null>(mercadoActualizado || null);
  const [actualizando, setActualizando] = useState(false);
  const [pasando, setPasando] = useState(false);
  const [p, setP] = useState<P>(inicial);
  const [estadoGuardado, setEstadoGuardado] = useState<"guardado" | "pendiente" | "guardando" | "error">("guardado");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [vista, setVista] = useState(0);
  const s = sectorDe(p.sector);
  const t = useMemo(() => totales(p.lineas, p.cantidad, p.margen, p.iva), [p.lineas, p.cantidad, p.margen, p.iva]);
  const sucio = useRef(false);
  const [buscando, setBuscando] = useState<string | null>(null);
  const usarMercado = ajustes?.usarMercado !== false;
  const precioMaterial = (id: string | null | undefined) => eurKgMaterial(id, tarifas, mercado, usarMercado);
  const opcionesCompra = useMemo(() => ({ largoBarra: ajustes?.largoBarra, chapaA: ajustes?.chapaA, chapaB: ajustes?.chapaB }), [ajustes?.largoBarra, ajustes?.chapaA, ajustes?.chapaB]);
  const manoObra = ajustes?.manoObra || 0;
  const horasDistintas = manoObra > 0 && p.lineas.some((l) => l.grupo === "operacion" && usaHoraManoObra(s, l.clave) && l.precio !== manoObra);
  const materialesDistintos = mercado ? p.lineas.filter((l) => l.grupo === "material" && l.materialId && precioMaterial(l.materialId) !== l.precio).length : 0;

  // Guardado automático 1,2 s después del último cambio.
  useEffect(() => {
    if (!sucio.current || ejemplo) return; // en el escaparate los cambios se quedan en pantalla
    setEstadoGuardado("pendiente");
    const h = setTimeout(async () => {
      setEstadoGuardado("guardando");
      try {
        const r = await guardarPlanoIA(p.id, datosGuardar(p));
        if (!r.success) throw new Error(r.error);
        sucio.current = false;
        setEstadoGuardado("guardado");
      } catch (e) {
        setEstadoGuardado("error");
        avisar((e as Error).message, "error");
      }
    }, 1200);
    return () => clearTimeout(h);
  }, [p]);

  const cambiar = (c: Partial<P>) => {
    sucio.current = true;
    setP((x) => ({ ...x, ...c }));
  };
  const cambiarLinea = (id: string, c: Partial<Linea>) =>
    cambiar({
      lineas: p.lineas.map((l) => {
        if (l.id !== id) return l;
        // Cambiar solo el precio no cambia el origen del dato; cambiar cantidades o medidas lo hace «tuyo».
        const n: Linea = { ...l, ...c, origen: Object.keys(c).every((k) => k === "precio") ? l.origen : "manual", sinPrecio: false };
        return n.grupo === "material" && (c.geo || c.piezas !== undefined || c.materialId !== undefined) ? recalcularMaterial(n, s.sobremedida) : n;
      }),
    });
  const quitar = (id: string) => cambiar({ lineas: p.lineas.filter((l) => l.id !== id) });

  /** Precio de venta sin IVA que quieres cobrar → el margen se ajusta solo. */
  const ponerPrecioFinal = (venta: number) => {
    if (!(t.coste > 0) || !(venta > 0)) return;
    cambiar({ margen: r2((venta / t.coste - 1) * 100) });
  };
  const aplicarManoObra = () => {
    cambiar({ lineas: p.lineas.map((l) => (l.grupo === "operacion" && usaHoraManoObra(s, l.clave) ? { ...l, precio: manoObra } : l)) });
    avisar(`Horas de mano de obra a ${eur(manoObra)}/h`);
  };
  const cobrarRetal = (euros: number) => {
    const ya = p.lineas.find((l) => l.clave === "retal");
    const linea: Linea = { id: ya?.id || `l${Date.now().toString(36)}r`, grupo: "extra", clave: "retal", descripcion: "Material sobrante de barras y chapas enteras", detalle: "Diferencia entre lo que se compra y lo que va en las piezas", cantidad: 1, unidad: "ud", precio: euros, porLote: true, origen: "manual", confianza: "alta" };
    cambiar({ lineas: ya ? p.lineas.map((l) => (l.id === ya.id ? linea : l)) : [...p.lineas, linea] });
    avisar(`Sobrante cobrado: ${eur(euros)}`);
  };
  const aplicarMercado = () => {
    cambiar({ lineas: p.lineas.map((l) => (l.grupo === "material" && l.materialId ? { ...l, precio: precioMaterial(l.materialId) } : l)) });
    avisar("Material con el precio de hoy");
  };
  const buscarPrecio = async (l: Linea) => {
    setBuscando(l.id);
    try {
      const r = await precioMercadoComponente([l.descripcion, l.detalle].filter(Boolean).join(" · "), l.unidad);
      if (!r.success) throw new Error(r.error);
      const nota = `Precio de mercado ${new Date(r.fecha).toLocaleDateString("es-ES")}: ${r.articulo}${r.fuente ? ` (${r.fuente})` : ""}`;
      cambiar({ lineas: p.lineas.map((y) => (y.id === l.id ? { ...y, precio: r.eur, sinPrecio: false, detalle: `${y.detalle ? `${y.detalle} · ` : ""}${nota}`.slice(0, 480) } : y)) });
      avisar(`${eur(r.eur)}/${l.unidad} · ${r.fuente || "mercado"}`);
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setBuscando(null);
    }
  };
  const anadir = (clave: string) => {
    const id = `l${Date.now().toString(36)}`;
    let l: Linea;
    if (clave === "__material") {
      const m = MATERIALES[0];
      l = recalcularMaterial({ id, grupo: "material", clave: m.id, materialId: m.id, descripcion: "Material", detalle: "", cantidad: 0, unidad: "kg", precio: precioMaterial(m.id), porLote: false, origen: "manual", confianza: "alta", geo: { forma: "chapa", A: null, B: null, E: null }, piezas: 1 }, s.sobremedida);
      setAbierta(id);
    } else if (clave === "__libre") {
      l = { id, grupo: "extra", clave: "otro", descripcion: "Nueva partida", detalle: "", cantidad: 1, unidad: "ud", precio: 0, porLote: false, origen: "manual", confianza: "alta" };
    } else {
      const c = s.conceptos.find((x) => x.clave === clave)!;
      l = { id, grupo: "operacion", clave, descripcion: c.nombre, detalle: "", cantidad: 1, unidad: c.unidad, precio: precioConcepto(s, clave, tarifas, ajustes?.manoObra), porLote: !!c.porLote, origen: "manual", confianza: "alta" };
    }
    cambiar({ lineas: [...p.lineas, l] });
  };

  const mensajeDudas = `Hola:\n\nPara cerrar el presupuesto de «${p.titulo}» necesitamos confirmar:\n${p.dudas.map((d) => `- ${d}`).join("\n")}\n\nGracias.`;
  const archivos = (p.archivos || []).map((a) => ({ id: a.ruta, nombre: a.nombre, tipo: a.tipo }));
  const urlArchivo = (ruta: string) => "/api/archivos/documentos/" + ruta.split("/").map(encodeURIComponent).join("/");
  const actualizarMercado = async () => {
    setActualizando(true);
    try {
      const r = await actualizarMercadoPlano();
      if (!r.success) throw new Error(r.error);
      setMercado(r.precios); setMercadoFecha(r.actualizado);
      avisar(r.nuevo ? "Precios de mercado de hoy cargados" : "Los precios de mercado ya son de hoy");
    } catch (e) { avisar((e as Error).message, "error"); } finally { setActualizando(false); }
  };
  const pasar = async () => {
    if (!p.cliente_id) return avisar("Elige antes el cliente, junto al botón.", "error");
    setPasando(true);
    try {
      const r = await guardarPlanoIA(p.id, datosGuardar(p));
      if (!r.success) throw new Error(r.error);
      sucio.current = false; setEstadoGuardado("guardado");
      const x = await pasarAPresupuestoERP(p.id);
      if (!x.success) throw new Error(x.error);
      setP((y) => ({ ...y, presupuesto_id: x.presupuestoId, presupuesto_numero: x.numero }));
      avisar("Presupuesto " + x.numero + " creado en el ERP");
    } catch (e) { avisar((e as Error).message, "error"); } finally { setPasando(false); }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 gap-5">
        {/* Cabecera */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-[26rem]">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-txt-3">
              <span>{s.icono} {s.corto}</span>·<span>{new Date(p.created_at).toLocaleDateString("es-ES")}</span>
              {p.presupuesto_numero && <Insignia tono="bien">Pasado a {p.presupuesto_numero}</Insignia>}
              {!ejemplo && <span className="ml-1">{{ guardado: "✓ Guardado", pendiente: "Cambios sin guardar", guardando: "Guardando…", error: "⚠ No se ha guardado" }[estadoGuardado]}</span>}
            </div>
            <textarea rows={1} className="input-celda -ml-1.5 resize-none font-display text-2xl font-semibold [field-sizing:content]" value={p.titulo} onChange={(e) => cambiar({ titulo: e.target.value })} aria-label="Título" />
            {p.resumen && <p className="mt-1 max-w-3xl text-sm text-txt-2">{p.resumen}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 no-imprimir">
            {!soloLectura && <div className="w-60" title="Cliente del presupuesto"><ClientCombobox value={p.cliente_id || ""} onChange={(v) => cambiar({ cliente_id: v || null })} /></div>}
            {p.presupuesto_numero && <Boton href={`/presupuestos?q=${encodeURIComponent(p.presupuesto_numero)}`} title="Abrir el presupuesto en el ERP">📄 Ver {p.presupuesto_numero}</Boton>}
            {!soloLectura && <Boton tipo="primario" onClick={pasar} disabled={pasando}>{pasando ? "Creando presupuesto…" : p.presupuesto_numero ? "Crear otro presupuesto" : "Pasar a presupuesto"}</Boton>}
          </div>
        </div>


        {/* Cómo lo verá el cliente */}
        <Tarjeta titulo="Cómo lo verá tu cliente" sub="Por dentro siempre tienes el desglose para calcular; elige qué aparece en el PDF y en su enlace.">
          <div className="grid gap-3 sm:grid-cols-2">
            {([["desglosado", "Desglosado", "Cada material, operación y componente con su importe."], ["unico", "En una sola línea", "Un único concepto (la pieza o el trabajo) con el total."]] as const).map(([v, t, d]) => (
              <button key={v} onClick={() => cambiar({ formato: v, concepto: p.concepto || `${p.cantidad > 1 ? `${p.cantidad} uds. de ${p.titulo.charAt(0).toLowerCase()}${p.titulo.slice(1)}` : p.titulo} según plano y medidas facilitadas. Incluye material, mano de obra y acabados indicados.` })} className={`rounded-xl border p-3 text-left transition ${p.formato === v ? "border-acento bg-acento-suave ring-2 ring-acento/20" : "border-borde hover:border-acento/40"}`}>
                <span className="flex items-center gap-2 text-sm font-semibold"><span className={`h-4 w-4 rounded-full border-2 ${p.formato === v ? "border-acento bg-acento shadow-[inset_0_0_0_2px_white]" : "border-borde"}`} />{t}</span>
                <span className="mt-1 block text-xs text-txt-3">{d}</span>
              </button>
            ))}
          </div>
          {p.formato === "unico" && (
            <div className="mt-4 grid gap-2">
              <label className="text-xs font-medium text-txt-2" htmlFor="concepto-unico">Concepto que verá el cliente</label>
              <textarea id="concepto-unico" className="pia-input min-h-20" value={p.concepto} onChange={(e) => cambiar({ concepto: e.target.value })} placeholder="Ej.: Pieza según plano DEMO-002, incluye material, mecanizado y tratamiento." />
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card-2 px-3 py-2 text-sm">
                <span className="text-txt-2">{p.cantidad} {p.cantidad === 1 ? "unidad" : "unidades"} × {eur(t.precioUnidad)}</span>
                <b className="tabular">{eur(t.base)} <span className="text-xs font-normal text-txt-3">sin IVA</span></b>
              </div>
            </div>
          )}
        </Tarjeta>

        {!soloLectura && p.lineas.some((l) => l.grupo === "material") && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-borde bg-card px-3 py-2 text-xs text-txt-3 no-imprimir">
            <span>{mercadoFecha ? "Precios de mercado del material: " + new Date(mercadoFecha).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "Material con tus precios o los orientativos"}</span>
            <Boton pequeno onClick={actualizarMercado} disabled={actualizando}>{actualizando ? "Consultando el mercado…" : "🔎 Precios de hoy"}</Boton>
          </div>
        )}
        {!demo && (horasDistintas || materialesDistintos > 0) && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-acento/30 bg-acento-suave/40 p-3 text-sm no-imprimir">
            <span className="font-medium">Actualizar precios:</span>
            {horasDistintas && <Boton pequeno onClick={aplicarManoObra}>Mi hora de mano de obra ({eur(manoObra)}/h)</Boton>}
            {materialesDistintos > 0 && <Boton pequeno onClick={aplicarMercado}>Material a mi precio o al de hoy ({materialesDistintos})</Boton>}
          </div>
        )}

        <div className="grid gap-5">
          {/* Partidas */}
          <div className="grid min-w-0 gap-4">
            {GRUPOS.map(([g, nombre]) => {
              const ls = p.lineas.filter((l) => l.grupo === g);
              if (!ls.length) return null;
              return (
                <Tarjeta key={g} titulo={nombre} sub={`${ls.length} ${ls.length === 1 ? "línea" : "líneas"} · coste ${eur(r2(ls.reduce((a, l) => a + importe(l) * (l.porLote ? 1 : p.cantidad), 0)))}`}>
                  <div className="-mx-2 overflow-x-auto">
                    <table className="w-full min-w-[600px] text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-txt-3">
                          <th className="px-2 pb-2 font-medium">Concepto</th>
                          <th className="w-24 px-2 pb-2 text-right font-medium">{g === "material" ? "Kg / ud" : "Cantidad"}</th>
                          <th className="w-16 px-1 pb-2 font-medium">Ud.</th>
                          <th className="w-24 px-2 pb-2 text-right font-medium">Coste €/ud</th>
                          <th className="w-24 px-2 pb-2 text-right font-medium">Importe</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {ls.map((l) => {
                          const o = ORIGEN[l.origen] || ORIGEN.manual;
                          const sinPrecio = !l.precio;
                          const sinCantidad = !l.cantidad;
                          return (
                            <tr key={l.id} className="group border-t border-borde align-top">
                              <td className="px-1 py-1.5">
                                <textarea rows={1} className="input-celda resize-none font-medium [field-sizing:content]" value={l.descripcion} onChange={(e) => cambiarLinea(l.id, { descripcion: e.target.value })} aria-label="Concepto" />
                                <div className="flex flex-wrap items-center gap-1.5 px-1.5 pt-0.5">
                                  <span title={o.ayuda}><Insignia tono={o.tono}>{o.txt}</Insignia></span>
                                  {l.confianza === "baja" && <Insignia tono="aviso">Poca seguridad</Insignia>}
                                  <button onClick={() => cambiarLinea(l.id, { porLote: !l.porLote })} title="Cambiar entre «por unidad» y «una vez por pedido»" className="rounded-full border border-borde px-2 py-0.5 text-[11px] text-txt-2 hover:border-acento hover:text-acento">{l.porLote ? "Una vez por pedido" : "Por unidad"} ⇄</button>
                                  {sinPrecio && <Insignia tono="mal">Falta precio</Insignia>}
                                  {sinCantidad && <Insignia tono="mal">Falta cantidad</Insignia>}
                                  {l.detalle && <span className="text-[11px] leading-snug text-txt-3">{l.detalle}</span>}
                                </div>
                                {l.grupo === "material" && (
                                  <button onClick={() => setAbierta(abierta === l.id ? null : l.id)} className="ml-1.5 mt-1 text-[11px] font-medium text-acento hover:underline">
                                    {abierta === l.id ? "Cerrar medidas" : "Editar material y medidas"}
                                  </button>
                                )}
                                {abierta === l.id && l.geo && <Medidas l={l} cambiar={(c) => cambiarLinea(l.id, c)} precioMaterial={precioMaterial} />}
                                {!demo && (l.grupo === "componente" || (l.grupo === "operacion" && tipoConcepto(s.id, l.clave) === "material") || (l.grupo === "extra" && !l.precio)) && (
                                  <button onClick={() => buscarPrecio(l)} disabled={buscando === l.id} className="ml-1.5 mt-1 text-[11px] font-medium text-acento hover:underline disabled:opacity-50" title="Busca en la web el precio de compra actual en España">
                                    {buscando === l.id ? "Buscando precio…" : "🔎 Precio de mercado"}
                                  </button>
                                )}
                              </td>
                              <td className="px-1 py-1.5">
                                {l.grupo === "material" ? (
                                  <span className="block px-2 py-1 text-right tabular" title="Se calcula con las medidas">{fmt(l.cantidad) || "—"}</span>
                                ) : (
                                  <Numero valor={l.cantidad} cambiar={(v) => cambiarLinea(l.id, { cantidad: v })} />
                                )}
                              </td>
                              <td className="px-1 py-1.5">
                                {l.grupo === "material" ? <span className="block pt-1 text-xs text-txt-3">{l.unidad}</span> : (
                                  <input className="input-celda text-xs text-txt-2" value={l.unidad} maxLength={8} onChange={(e) => cambiarLinea(l.id, { unidad: e.target.value })} aria-label="Unidad" />
                                )}
                              </td>
                              <td className="px-1 py-1.5"><Numero valor={l.precio} cambiar={(v) => cambiarLinea(l.id, { precio: v })} sufijo="€" dec={2} /></td>
                              <td className="px-2 py-1.5 pt-2.5 text-right font-medium tabular">{eur(importe(l) * (l.porLote ? 1 : p.cantidad))}</td>
                              <td className="py-1.5 pt-2">
                                <button onClick={() => quitar(l.id)} className="rounded-lg border border-borde bg-card px-1.5 py-1 text-sm hover:border-mal/40 hover:bg-mal-suave" title="Quitar esta línea" aria-label="Quitar línea">🗑️</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Tarjeta>
              );
            })}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-acento/40 bg-acento-suave/30 p-3 no-imprimir">
              <span className="text-sm font-semibold text-acento">＋ Añadir concepto</span>
              <select className="pia-input w-auto" value="" onChange={(e) => e.target.value && anadir(e.target.value)} aria-label="Añadir concepto">
                <option value="">Elige qué añadir…</option>
                <optgroup label={s.nombre}>{s.conceptos.map((c) => <option key={c.clave} value={c.clave}>{c.nombre} ({c.unidad})</option>)}</optgroup>
                <optgroup label="Otros">
                  <option value="__material">Material (por medidas y kg)</option>
                  <option value="__libre">Partida libre</option>
                </optgroup>
              </select>
              <span className="text-xs text-txt-3">Todo es editable: toca el texto, la cantidad, la unidad o el precio. 🗑 quita la línea.</span>
            </div>

            <ListaDeCompra lineas={p.lineas} cantidad={p.cantidad} sectorId={s.id} sobremedida={s.sobremedida} opciones={opcionesCompra} titulo={p.titulo} numero={p.presupuesto_numero || ""} cobrarRetal={cobrarRetal} />

            {p.dudas.length > 0 && (
              <Tarjeta titulo={`Falta por confirmar (${p.dudas.length})`} sub="Datos que no venían en el plano y cambian el precio" extra={<Boton pequeno onClick={() => (navigator.clipboard.writeText(mensajeDudas), avisar("Mensaje copiado"))}>Copiar mensaje para el cliente</Boton>}>
                <Lista items={p.dudas} cambiar={(v) => cambiar({ dudas: v })} vacio="" />
              </Tarjeta>
            )}
            <details className="rounded-2xl border border-borde bg-card p-4 text-sm">
              <summary className="cursor-pointer font-medium text-txt-2">Supuestos de la IA ({p.supuestos.length}){p.dudas.length === 0 && " · añadir algo por confirmar"}</summary>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div><p className="mb-1 text-xs font-medium text-txt-3">Lo que se ha dado por hecho</p><Lista items={p.supuestos} cambiar={(v) => cambiar({ supuestos: v })} vacio="Sin supuestos." /></div>
                {p.dudas.length === 0 && <div><p className="mb-1 text-xs font-medium text-txt-3">Falta por confirmar</p><Lista items={p.dudas} cambiar={(v) => cambiar({ dudas: v })} vacio="Nada: el plano trae todo lo necesario." /></div>}
              </div>
            </details>
            <Tarjeta titulo="Notas para el cliente">
              <textarea className="pia-input min-h-20" value={p.notas} onChange={(e) => cambiar({ notas: e.target.value })} placeholder="Plazo de entrega, forma de pago, lo que no incluye…" />
            </Tarjeta>
          </div>
        </div>
      </div>

      {/* Barra del total en móvil y tableta (el resumen completo queda al final) */}
      <a href="#resumen" className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-2xl bg-noche px-4 py-3 text-white shadow-2xl xl:hidden no-imprimir">
        <span className="text-xs text-white/60">Total con IVA{t.faltan ? ` · ⚠ ${t.faltan} sin precio` : ""}</span>
        <span className="texto-degradado font-display text-xl font-bold tabular">{eur(t.total)}</span>
      </a>

      {/* Resumen */}
      <aside id="resumen" className="grid content-start gap-4 pb-20 xl:sticky xl:top-4 xl:self-start xl:pb-0">
        <div className="overflow-hidden rounded-2xl bg-noche text-white shadow-xl">
          <div className="degradado h-1.5" />
          <div className="grid gap-3 p-5">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-white/60">Unidades
                <input className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-base tabular text-white outline-none focus:border-fuchsia-400" inputMode="numeric" value={p.cantidad} onChange={(e) => cambiar({ cantidad: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })} />
              </label>
              <label className="text-xs text-white/60">Margen %
                <input className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-base tabular text-white outline-none focus:border-fuchsia-400" inputMode="decimal" value={p.margen} onChange={(e) => cambiar({ margen: num(e.target.value) })} />
              </label>
            </div>
            <dl className="grid gap-1.5 text-sm">
              <Fila a="Coste por unidad" b={eur(t.costeConjunto)} />
              {t.costeLote > 0 && <Fila a="Coste por pedido" b={eur(t.costeLote)} />}
              <Fila a="Coste total" b={eur(t.coste)} />
              <Fila a={`Beneficio (${fmt(p.margen) || 0} %)`} b={eur(t.margen)} verde />
              <div className="my-1 border-t border-white/10" />
              <Fila a="Base imponible" b={eur(t.base)} />
              <div className="flex items-center justify-between gap-2 text-white/70">
                <span className="flex items-center gap-1">IVA <input className="w-12 rounded border border-white/15 bg-white/5 px-1 text-right tabular text-white" value={p.iva} inputMode="decimal" onChange={(e) => cambiar({ iva: num(e.target.value) })} aria-label="IVA %" /> %</span>
                <span className="tabular">{eur(t.iva)}</span>
              </div>
            </dl>
            <label className="text-xs text-white/60">Precio que cobras sin IVA · cámbialo y el margen se ajusta solo
              <PrecioFinal valor={t.base} cambiar={ponerPrecioFinal} />
            </label>
            <input type="range" min={0} max={100} step={1} value={Math.min(100, Math.max(0, Math.round(p.margen)))} onChange={(e) => cambiar({ margen: Number(e.target.value) })} aria-label="Margen" className="accent-fuchsia-400" />
            <Desglose lineas={p.lineas} cantidad={p.cantidad} sectorId={s.id} />
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-xs text-white/60">Total con IVA</p>
              <p className="texto-degradado font-display text-3xl font-bold tabular">{eur(t.total)}</p>
              {p.cantidad > 1 && <p className="text-xs text-white/60 tabular">{eur(t.precioUnidad)} por unidad sin IVA</p>}
            </div>
            {t.faltan > 0 && <p className="rounded-lg bg-amber-400/15 px-3 py-2 text-xs text-amber-200">⚠ {t.faltan} {t.faltan === 1 ? "línea sin precio o cantidad" : "líneas sin precio o cantidad"}: revísalas antes de enviar.</p>}
          </div>
        </div>
        {/* Plano */}
        <Tarjeta titulo="Documento" sub={archivos.length > 1 ? `${vista + 1} de ${archivos.length}` : undefined}>
          {archivos.length ? (
            <>
              <a href={urlArchivo(archivos[vista].id)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-borde bg-white" title="Abrir en grande">
                {archivos[vista].tipo === "application/pdf" ? (
                  <div className="flex h-56 flex-col items-center justify-center gap-1 text-sm text-txt-2"><span className="text-4xl">📄</span>Abrir el PDF</div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlArchivo(archivos[vista].id)} alt="Plano" className="max-h-96 w-full object-contain" />
                )}
              </a>
              {archivos.length > 1 && (
                <div className="mt-2 flex gap-1.5">
                  {archivos.map((a, i) => (
                    <button key={a.id} onClick={() => setVista(i)} className={`h-2 flex-1 rounded-full ${i === vista ? "degradado" : "bg-borde"}`} aria-label={`Vista ${i + 1}`} />
                  ))}
                </div>
              )}
            </>
          ) : <p className="text-sm text-txt-3">Sin documento.</p>}
        </Tarjeta>
      </aside>

    </div>
  );
}

function Fila({ a, b, verde }: { a: string; b: string; verde?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-white/70">
      <dt>{a}</dt>
      <dd className={`tabular ${verde ? "text-emerald-300" : "text-white"}`}>{b}</dd>
    </div>
  );
}

function Lista({ items, cambiar, vacio }: { items: string[]; cambiar: (v: string[]) => void; vacio: string }) {
  if (!items.length)
    return (
      <div className="flex items-center justify-between text-sm text-txt-3">
        {vacio}
        <button onClick={() => cambiar([""])} className="text-xs text-acento hover:underline">+ Añadir</button>
      </div>
    );
  return (
    <ul className="grid gap-1">
      {items.map((d, i) => (
        <li key={i} className="group flex items-start gap-1">
          <span className="pt-1.5 text-acento">•</span>
          <textarea rows={1} className="input-celda resize-none [field-sizing:content]" value={d} onChange={(e) => cambiar(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button onClick={() => cambiar(items.filter((_, j) => j !== i))} className="p-1 text-xs text-txt-3 opacity-0 hover:text-mal group-hover:opacity-100" aria-label="Quitar">✕</button>
        </li>
      ))}
      <li><button onClick={() => cambiar([...items, ""])} className="ml-4 text-xs text-acento hover:underline">+ Añadir</button></li>
    </ul>
  );
}

function PrecioFinal({ valor, cambiar }: { valor: number; cambiar: (v: number) => void }) {
  const [txt, setTxt] = useState("");
  const [foco, setFoco] = useState(false);
  return (
    <input
      className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-lg font-semibold tabular text-white outline-none focus:border-fuchsia-400"
      inputMode="decimal"
      value={foco ? txt : eur(valor)}
      onFocus={() => (setFoco(true), setTxt(fmt(valor, 2)))}
      onBlur={() => (setFoco(false), cambiar(num(txt)))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      onChange={(e) => setTxt(e.target.value)}
      aria-label="Precio de venta sin IVA"
    />
  );
}

function Medidas({ l, cambiar, precioMaterial }: { l: Linea; cambiar: (c: Partial<Linea>) => void; precioMaterial: (id: string) => number }) {
  const g = l.geo!;
  const f = FORMAS[g.forma];
  return (
    <div className="m-1.5 grid gap-2 rounded-xl border border-borde bg-card-2 p-3 sm:grid-cols-2">
      <label className="text-[11px] text-txt-3">Material
        <select className="pia-input mt-0.5" value={l.materialId || ""} onChange={(e) => {
          const m = MATERIALES.find((x) => x.id === e.target.value);
          cambiar({ materialId: e.target.value || null, clave: e.target.value || "otro", precio: m ? precioMaterial(m.id) : l.precio });
        }}>
          <option value="">Sin indicar</option>
          {MATERIALES.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
      </label>
      <label className="text-[11px] text-txt-3">Forma
        <select className="pia-input mt-0.5" value={g.forma} onChange={(e) => cambiar({ geo: { ...g, forma: e.target.value as Forma } })}>
          {Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        {f.campos.map((c) => (
          <label key={c} className="w-20 text-[11px] text-txt-3">{c} ({c === "P" ? "kg/m" : "mm"})
            <input className="pia-input mt-0.5 tabular" inputMode="decimal" value={(g as unknown as Record<string, number | null>)[c] ?? ""} onChange={(e) => cambiar({ geo: { ...g, [c]: num(e.target.value) || null } })} />
          </label>
        ))}
        <label className="w-20 text-[11px] text-txt-3">Piezas
          <input className="pia-input mt-0.5 tabular" inputMode="numeric" value={l.piezas || 1} onChange={(e) => cambiar({ piezas: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })} />
        </label>
      </div>
      <p className="text-[11px] text-txt-3 sm:col-span-2">{f.ayuda}. El peso se calcula solo.</p>
    </div>
  );
}

const datosGuardar = (p: P): Partial<P> => ({ titulo: p.titulo, cliente_id: p.cliente_id, lineas: p.lineas, cantidad: p.cantidad, margen: p.margen, iva: p.iva, notas: p.notas, dudas: p.dudas, supuestos: p.supuestos, formato: p.formato, concepto: p.concepto });

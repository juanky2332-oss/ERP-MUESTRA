"use client";
import { useEffect, useRef, useState } from "react";
import { Boton, Campo } from "./ui";
import { ClientCombobox } from "@/components/contacts/client-combobox";

export interface SectorCorto { id: string; nombre: string; icono: string; descripcion: string; documentos?: string }
export interface Preparado { archivo: File; vista: string }

export const EJEMPLOS = [
  { id: "mesa-inox", nombre: "Mesa de inoxidable", sector: "calderia", archivo: "/planos-ejemplo/mesa-inox.svg", nota: "Plano de conjunto · 6 uds" },
  { id: "eje", nombre: "Eje mecanizado", sector: "mecanizado", archivo: "/planos-ejemplo/eje.svg", nota: "Plano de pieza · 25 uds" },
  { id: "cuadro", nombre: "Cuadro eléctrico", sector: "electrico", archivo: "/planos-ejemplo/cuadro.svg", nota: "Esquema unifilar" },
  { id: "envolvente", nombre: "Caja de chapa", sector: "chapa", archivo: "/planos-ejemplo/envolvente.svg", nota: "Desarrollo y plegado · 40 uds" },
];

const LADO = 2400;
const MAX_TOTAL = 3.9 * 1024 * 1024;

/** Reduce fotos grandes en el navegador (el servidor admite 4 MB en total) y convierte SVG a imagen. */
async function preparar(f: File): Promise<File> {
  if (f.type === "application/pdf") return f;
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error(`No se puede abrir «${f.name}». Usa JPG, PNG o PDF.`));
      i.src = url;
    });
    const w = img.naturalWidth || 1600, h = img.naturalHeight || 1100;
    const esc = Math.min(1, LADO / Math.max(w, h));
    if (f.type !== "image/svg+xml" && esc === 1 && f.size < 1.5 * 1024 * 1024 && /jpe?g|png|webp/.test(f.type)) return f;
    const c = document.createElement("canvas");
    c.width = Math.round(w * (f.type === "image/svg+xml" ? Math.min(2, LADO / Math.max(w, h)) : esc));
    c.height = Math.round(h * (c.width / w));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.86));
    return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Subir({ sectores, sectorInicial, conCliente, enviar, ocupado, textoBoton = "Presupuestar con IA" }: {
  sectores: SectorCorto[]; sectorInicial: string; conCliente?: boolean; ocupado: boolean; textoBoton?: string;
  enviar: (fd: FormData, vistas: string[]) => void;
}) {
  const [lista, setLista] = useState<Preparado[]>([]);
  const [sector, setSector] = useState(sectorInicial);
  const [cantidad, setCantidad] = useState("");
  const [indicaciones, setIndicaciones] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [error, setError] = useState("");
  const [encima, setEncima] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const listaRef = useRef(lista);
  listaRef.current = lista;
  useEffect(() => () => listaRef.current.forEach((p) => URL.revokeObjectURL(p.vista)), []);

  const anadir = async (fs: File[]) => {
    setError("");
    try {
      const nuevos: Preparado[] = [];
      for (const f of fs.slice(0, 4 - lista.length)) {
        if (!/^image\/|application\/pdf/.test(f.type)) throw new Error(`«${f.name}» no es una imagen ni un PDF.`);
        const p = await preparar(f);
        nuevos.push({ archivo: p, vista: URL.createObjectURL(p) });
      }
      const todo = [...lista, ...nuevos];
      if (todo.reduce((a, p) => a + p.archivo.size, 0) > MAX_TOTAL) throw new Error("Entre todos pasan de 4 MB. Quita alguno o divide el PDF.");
      setLista(todo);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const ejemplo = async (e: (typeof EJEMPLOS)[number]) => {
    const r = await fetch(e.archivo);
    const b = await r.blob();
    lista.forEach((p) => URL.revokeObjectURL(p.vista));
    setLista([]);
    setSector(e.sector);
    const f = await preparar(new File([b], `${e.id}.svg`, { type: "image/svg+xml" }));
    setLista([{ archivo: f, vista: URL.createObjectURL(f) }]);
  };

  const mandar = () => {
    if (!lista.length) return setError("Sube un plano, una foto o un PDF (o elige un ejemplo).");
    const fd = new FormData();
    lista.forEach((p) => fd.append("archivo", p.archivo));
    fd.append("sector", sector);
    if (cantidad) fd.append("cantidad", cantidad);
    if (indicaciones.trim()) fd.append("indicaciones", indicaciones.trim());
    if (conCliente && clienteId) fd.append("cliente_id", clienteId);
    enviar(fd, lista.map((p) => p.vista));
  };

  const s = sectores.find((x) => x.id === sector);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
      <div className="grid gap-3">
        <div
          onDragOver={(e) => (e.preventDefault(), setEncima(true))}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            anadir([...e.dataTransfer.files]);
          }}
          className={`relative flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition ${encima ? "border-acento bg-acento-suave/60" : "border-borde bg-card"}`}
        >
          {lista.length ? (
            <div className="grid w-full grid-cols-2 gap-3">
              {lista.map((p, i) => (
                <figure key={p.vista} className="group relative overflow-hidden rounded-xl border border-borde bg-white">
                  {p.archivo.type === "application/pdf" ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-1 text-txt-2"><span className="text-3xl">📄</span><span className="max-w-full truncate px-2 text-xs">{p.archivo.name}</span></div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.vista} alt={`Plano ${i + 1}`} className="h-40 w-full object-contain" />
                  )}
                  <button onClick={() => setLista(lista.filter((x) => x !== p))} className="absolute right-1.5 top-1.5 rounded-full bg-noche/80 px-2 py-0.5 text-xs text-white opacity-90 hover:bg-mal" aria-label="Quitar">✕</button>
                  <figcaption className="border-t border-borde px-2 py-1 text-[11px] text-txt-3">{(p.archivo.size / 1024).toFixed(0)} KB</figcaption>
                </figure>
              ))}
              {lista.length < 4 && (
                <button onClick={() => input.current?.click()} className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-borde text-sm text-txt-3 hover:border-acento hover:text-acento">+ Añadir otra vista</button>
              )}
            </div>
          ) : (
            <>
              <div className="degradado flex h-14 w-14 items-center justify-center rounded-2xl text-2xl text-white shadow-lg">⇪</div>
              <p className="font-display text-lg font-semibold">Arrastra aquí el plano, el croquis o la foto</p>
              <p className="max-w-sm text-sm text-txt-3">PDF, JPG o PNG. Hasta 4 archivos (por ejemplo, varias vistas o hojas). Las fotos grandes se reducen solas.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Boton tipo="primario" onClick={() => input.current?.click()}>Elegir archivos</Boton>
                <Boton onClick={() => camara.current?.click()}>📷 Hacer una foto</Boton>
              </div>
            </>
          )}
          <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (anadir([...(e.target.files || [])]), (e.target.value = ""))} />
          <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (anadir([...(e.target.files || [])]), (e.target.value = ""))} />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-txt-3">Planos de prueba:</p>
          <div className="flex flex-wrap gap-2">
            {EJEMPLOS.map((e) => (
              <button key={e.id} onClick={() => ejemplo(e)} className="rounded-xl border border-borde bg-card px-3 py-2 text-left text-xs transition hover:border-acento hover:bg-acento-suave/50">
                <b className="block text-txt">{e.nombre}</b>
                <span className="text-txt-3">{e.nota}</span>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="rounded-xl bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
      </div>

      <div className="grid content-start gap-4 rounded-2xl border border-borde bg-card p-5">
        <Campo etiqueta="Sector" ayuda={s ? `${s.descripcion} ${s.documentos ? `Suele llegar: ${s.documentos.toLowerCase()}.` : ""}` : undefined}>
          <select className="pia-input" value={sector} onChange={(e) => setSector(e.target.value)}>
            {sectores.map((x) => <option key={x.id} value={x.id}>{x.icono} {x.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Unidades a fabricar" ayuda="Déjalo vacío si lo dice el plano.">
          <input className="pia-input" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))} placeholder="Según el plano" />
        </Campo>
        <Campo etiqueta="Indicaciones (opcional)" ayuda="Lo que no se vea en el plano: material, acabado, plazo, si lleva montaje…">
          <textarea className="pia-input min-h-20" value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} placeholder="Ej.: inoxidable 304, acabado satinado, con transporte a Murcia" />
        </Campo>
        {conCliente && (
          <Campo etiqueta="Cliente (opcional)" ayuda="Puedes elegirlo ahora o después, antes de pasarlo a presupuesto."><ClientCombobox value={clienteId} onChange={(v) => setClienteId(v)} /></Campo>
        )}
        <Boton tipo="primario" onClick={mandar} disabled={ocupado || !lista.length} className="w-full py-3 text-base">
          {ocupado ? "Leyendo el plano…" : `✦ ${textoBoton}`}
        </Boton>
        <p className="text-center text-[11px] text-txt-3">La IA lee y mide; los precios salen de tus tarifas. Siempre puedes revisarlo antes de enviarlo.</p>
      </div>
    </div>
  );
}

const PASOS = ["Leyendo el documento", "Identificando piezas, cotas y materiales", "Midiendo cortes, soldaduras y superficies", "Estimando tiempos de taller", "Aplicando tus tarifas"];

/** Pantalla de espera mientras la IA lee el plano (suele tardar entre 30 s y 2 min). */
export function Leyendo({ vistas }: { vistas: string[] }) {
  const [paso, setPaso] = useState(0);
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setPaso(Math.min(PASOS.length - 1, Math.floor(seg / 15)));
  }, [seg]);
  return (
    <div className="mx-auto grid max-w-3xl gap-6 py-6 md:grid-cols-2">
      <div className="relative overflow-hidden rounded-2xl border border-borde bg-white">
        {vistas[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vistas[0]} alt="Plano" className="h-72 w-full object-contain opacity-80" />
        ) : <div className="h-72" />}
        <div className="pointer-events-none absolute inset-0">
          <div className="pia-escaner h-1/3 w-full bg-gradient-to-b from-transparent via-fuchsia-400/25 to-transparent" />
        </div>
      </div>
      <div className="flex flex-col justify-center">
        <p className="font-display text-xl font-semibold">Preparando tu presupuesto…</p>
        <p className="mt-1 text-sm text-txt-3">Suele tardar alrededor de un minuto: la IA revisa cada cota. No cierres la página.</p>
        <ol className="mt-5 grid gap-2.5">
          {PASOS.map((p, i) => (
            <li key={p} className={`flex items-center gap-3 text-sm transition ${i <= paso ? "text-txt" : "text-txt-3/60"}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i < paso ? "bg-bien text-white" : i === paso ? "degradado text-white" : "border border-borde"}`}>
                {i < paso ? "✓" : i + 1}
              </span>
              {p}
              {i === paso && <span className="h-3 w-3 animate-spin rounded-full border-2 border-acento border-t-transparent" />}
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs tabular text-txt-3">{seg} s</p>
      </div>
    </div>
  );
}

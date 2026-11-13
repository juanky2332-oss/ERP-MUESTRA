import "server-only";
import { MATERIALES, FORMAS } from "./calculo.ts";
import type { Lectura } from "./ia-tipos.ts";
import type { Sector } from "./sectores.ts";

// Lee el plano/foto con un modelo con visión y devuelve SOLO lo que se ve (y lo que se puede medir o estimar,
// marcado como tal). Los precios y los kilos los pone el programa, nunca la IA.

export const MODELO = process.env.OPENAI_MODEL_PLANOS || "gpt-5.4";

const num = { type: ["number", "null"] };
const str = { type: ["string", "null"] };
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });

function esquema(s: Sector) {
  return {
    name: "lectura_presupuesto",
    strict: true,
    schema: obj({
      legible: { type: "boolean" },
      tipo_documento: { type: "string", enum: ["plano_pieza", "plano_conjunto", "plano_planta", "esquema", "croquis", "foto", "lista_materiales", "otro"] },
      titulo: { type: "string" },
      resumen: { type: "string" },
      cantidad_conjuntos: num,
      elementos: {
        type: "array",
        items: obj({
          descripcion: { type: "string" }, material_id: { enum: [...MATERIALES.map((m) => m.id), null] }, material_texto: str,
          forma: { type: "string", enum: Object.keys(FORMAS) }, A: num, B: num, E: num, D: num, L: num, P: num,
          piezas: { type: "number" }, origen: { type: "string", enum: ["cota", "texto", "deducido"] }, nota: str,
        }),
      },
      operaciones: {
        type: "array",
        items: obj({
          clave: { type: "string", enum: [...s.conceptos.map((c) => c.clave), "otro"] }, descripcion: { type: "string" }, cantidad: num,
          unidad: { type: "string" }, por_lote: { type: "boolean" }, origen: { type: "string", enum: ["cota", "texto", "deducido", "estimado"] },
          confianza: { type: "string", enum: ["alta", "media", "baja"] }, nota: str,
        }),
      },
      componentes: {
        type: "array",
        items: obj({ descripcion: { type: "string" }, referencia: str, caracteristicas: str, cantidad: { type: "number" }, confianza: { type: "string", enum: ["alta", "media", "baja"] } }),
      },
      dudas: { type: "array", items: { type: "string" } },
      supuestos: { type: "array", items: { type: "string" } },
    }),
  };
}

function prompt(s: Sector) {
  return `Eres el técnico de oficina técnica de una empresa española del sector «${s.nombre}». Preparas presupuestos a partir de planos, croquis, esquemas o fotos.

TU TRABAJO: DESTRIPAR el documento por completo y devolver todas las partidas para presupuestar: todo el material que hay que comprar, todas las operaciones y horas de mano de obra, y todos los componentes y normalizados. Con tu lista se hace el pedido al almacén, así que no te dejes nada. El programa pone los precios y calcula los kilos: tú NUNCA das precios ni pesos.

MÉTODO: recorre el documento vista a vista y la lista de piezas o el cajetín si los hay (marca, cantidad, denominación, material). Cada pieza distinta es una fila; cuenta bien las repetidas (simetrías, patas, refuerzos, cartelas, escuadras, tapas, conteras). Antes de responder repasa: ¿cada pieza dibujada está en elementos o en componentes? ¿Cada proceso que necesita (cortar, mecanizar, plegar, soldar, repasar, montar, acabar) está en operaciones?

REGLAS:
1. Extrae lo que se ve escrito o acotado. Lo que no aparece va a null.
   "dudas" SOLO si falta un dato IMPRESCINDIBLE para fabricar o poner precio (material, espesor, una medida, la cantidad, un acabado o tratamiento que cambia el precio) y no está en el documento ni se puede deducir de sus cotas: una pregunta corta y concreta por dato (p. ej. «¿Qué espesor tiene la chapa del tablero?»). Si el documento trae lo necesario, "dudas" va VACÍO. Nunca preguntes para confirmar algo que ya está escrito, ni por extras que el documento no pide (transporte, montaje, embalaje, plazos) ni por detalles que no cambian el precio.
2. Puedes DEDUCIR una medida solo a partir de cotas que sí están (alto de pata = alto total − espesor del tablero; desarrollo de una chapa plegada = largo + 2 × faldón). Origen "deducido" y el cálculo en "nota".
3. Los tiempos (horas) y cantidades de proceso que no están escritos los ESTIMAS como haría un técnico con experiencia: origen "estimado", confianza honesta y en "nota" el razonamiento en una frase (p. ej. «8 cordones de 0,30 m en uniones pata-bastidor»). Nunca inventes medidas del objeto.
4. Medidas en mm (convierte cm o m). "cantidad_conjuntos" = cuántas unidades completas hay que fabricar o instalar según el documento (null si no lo dice). Las cantidades de elementos y operaciones son las de UN conjunto, salvo las marcadas "por_lote" (una vez por pedido).
5. ${s.usaMateriales ? `"elementos" = despiece del material a comprar: una fila por elemento distinto con su forma y medidas (letras: ${Object.entries(FORMAS).map(([k, f]) => `${k} → ${f.ayuda}`).join("; ")}) y "piezas" por conjunto. material_id: el de la lista que corresponda exactamente (AISI 304 → inox304, F-1140 o C45 → c45, S275 → s275, 6082 → al6082); si no se indica, null y pregúntalo en dudas. En piezas de mecanizado da las medidas FINALES: el programa añade el bruto.` : `"elementos" vacío: en este sector el material va como operaciones (m, m², ud).`}
6. "operaciones": usa SOLO estas claves (con su unidad) y mide según la pista; si algo necesario no encaja, clave "otro" con unidad y descripción:
${s.conceptos.map((c) => `   - ${c.clave} (${c.unidad}${c.porLote ? ", por pedido" : ""}): ${c.nombre}. ${c.pista}`).join("\n")}
   No pongas operaciones que el documento no pide ni que no hagan falta para fabricarlo o instalarlo.
7. "componentes": todo lo que se compra hecho: aparatos (contactores, magnetotérmicos, cilindros, válvulas, motores, rodamientos…) y también normalizados y accesorios (tornillos, tuercas, arandelas, varilla roscada, remaches, bisagras, ruedas, niveladores, conteras, tapones, juntas, cerraduras). Una fila por tipo y medida con la cantidad contada por conjunto; en "caracteristicas" la métrica, el largo, la calidad o el acabado (p. ej. «M10 × 30, DIN 933, inox A2»). Si el plano dibuja uniones atornilladas sin especificar el tornillo, ponlo con confianza baja y la métrica que se deduzca del taladro. La referencia SOLO si está escrita.
8. "titulo": nombre corto de lo que se presupuesta, con mayúscula solo al principio (p. ej. «Mesa de trabajo de inoxidable con estante»), sin «vista», «plano» ni referencias. "supuestos": lo que has dado por hecho para poder presupuestar (máx. 5, frases cortas). "resumen": 1-2 frases de qué es y qué incluye.
9. Si no se lee bien, legible=false y explica en dudas qué hace falta (más resolución, otra vista…).
10. Español de España, sin tecnicismos innecesarios en las descripciones: el cliente las leerá en el presupuesto.`;
}

export async function leerDocumento(
  archivos: { datos: Buffer; tipo: string }[],
  sector: Sector,
  indicaciones: string,
): Promise<{ lectura: Lectura; modelo: string; tokens: { entrada: number; salida: number }; ms: number }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Falta OPENAI_API_KEY en el servidor.");
  const adjuntos = archivos.map((a, i) =>
    a.tipo.includes("pdf")
      ? { type: "file", file: { filename: `plano-${i + 1}.pdf`, file_data: `data:application/pdf;base64,${a.datos.toString("base64")}` } }
      : { type: "image_url", image_url: { url: `data:${a.tipo || "image/jpeg"};base64,${a.datos.toString("base64")}`, detail: "high" } },
  );
  const t0 = Date.now();
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      reasoning_effort: process.env.OPENAI_ESFUERZO || "low",
      max_completion_tokens: 16000,
      response_format: { type: "json_schema", json_schema: esquema(sector) },
      messages: [
        { role: "system", content: prompt(sector) },
        { role: "user", content: [...adjuntos, { type: "text", text: indicaciones.trim() ? `Indicaciones del usuario (mandan sobre lo que no se lea bien): ${indicaciones.trim()}` : "Prepara las partidas para presupuestar." }] },
      ],
    }),
    signal: AbortSignal.timeout(280000),
  });
  const j = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string; refusal?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };
  if (!r.ok) throw new Error(`La IA no ha podido leer el documento (${j.error?.message || r.status}).`);
  const txt = j.choices?.[0]?.message?.content;
  if (!txt) throw new Error(j.choices?.[0]?.message?.refusal || "La IA no ha devuelto datos. Prueba con una imagen más nítida.");
  return { lectura: JSON.parse(txt) as Lectura, modelo: MODELO, tokens: { entrada: j.usage?.prompt_tokens || 0, salida: j.usage?.completion_tokens || 0 }, ms: Date.now() - t0 };
}

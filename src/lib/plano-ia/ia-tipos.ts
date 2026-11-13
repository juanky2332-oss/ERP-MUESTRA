// Tipos de la lectura del plano (los comparte el servidor y el navegador).
import type { FORMAS } from "./calculo.ts";

export interface ElementoIA {
  descripcion: string; material_id: string | null; material_texto: string | null; forma: keyof typeof FORMAS;
  A: number | null; B: number | null; E: number | null; D: number | null; L: number | null; P: number | null;
  piezas: number; origen: "cota" | "texto" | "deducido"; nota: string | null;
}
export interface OperacionIA {
  clave: string; descripcion: string; cantidad: number | null; unidad: string; por_lote: boolean;
  origen: "cota" | "texto" | "deducido" | "estimado"; confianza: "alta" | "media" | "baja"; nota: string | null;
}
export interface ComponenteIA { descripcion: string; referencia: string | null; caracteristicas: string | null; cantidad: number; confianza: "alta" | "media" | "baja" }
export interface Lectura {
  legible: boolean; tipo_documento: string; titulo: string; resumen: string; cantidad_conjuntos: number | null;
  elementos: ElementoIA[]; operaciones: OperacionIA[]; componentes: ComponenteIA[]; dudas: string[]; supuestos: string[];
}

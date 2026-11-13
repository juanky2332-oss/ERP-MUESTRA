// Sectores de la industria y sus conceptos de precio. Los precios son ORIENTATIVOS (España, sin IVA):
// cada empresa pone los suyos en Ajustes y son los que se usan. La IA solo elige el concepto y mide
// la cantidad; el precio sale siempre de esta tabla o de la de la empresa.

export type Unidad = "h" | "ud" | "m" | "m2" | "kg" | "km" | "l";

export interface Concepto {
  clave: string;
  nombre: string;
  unidad: Unidad;
  precio: number;
  porLote?: boolean; // se cobra una vez por pedido, no por unidad (preparación, programación, transporte…)
  pista: string; // cómo debe medirlo la IA
}

export interface Sector {
  id: string;
  nombre: string;
  corto: string;
  icono: string;
  descripcion: string;
  documentos: string; // qué suele recibir
  usaMateriales: boolean; // despiece en kg (metal)
  sobremedida: number; // mm por lado para el bruto (mecanizado)
  margen: number; // % por defecto
  conceptos: Concepto[];
}

export const SECTORES: Sector[] = [
  {
    id: "mecanizado", nombre: "Mecanizado y CNC", corto: "Mecanizado", icono: "⚙️",
    descripcion: "Ejes, casquillos, bridas, placas y piezas a plano.",
    documentos: "Planos de pieza con cotas, tolerancias y material",
    usaMateriales: true, sobremedida: 3, margen: 30,
    conceptos: [
      { clave: "torno_cnc", nombre: "Torno CNC", unidad: "h", precio: 45, pista: "Horas de torno por pieza (desbaste y acabado) según volumen a quitar, diámetros y número de operaciones." },
      { clave: "fresa_cnc", nombre: "Fresadora / centro de mecanizado", unidad: "h", precio: 50, pista: "Horas de fresado por pieza: caras, cajeras, ranuras, taladros." },
      { clave: "cinco_ejes", nombre: "Centro de 5 ejes", unidad: "h", precio: 75, pista: "Solo si la geometría exige 5 ejes." },
      { clave: "convencional", nombre: "Máquina convencional", unidad: "h", precio: 38, pista: "Operaciones simples en torno o fresa manual." },
      { clave: "rectificado", nombre: "Rectificado", unidad: "h", precio: 55, pista: "Solo si hay tolerancias finas (h6, g6, IT6 o mejor) o Ra ≤ 0,8." },
      { clave: "electroerosion", nombre: "Electroerosión", unidad: "h", precio: 60, pista: "Solo si hay formas que lo exigen (chaveteros interiores, cantos vivos interiores)." },
      { clave: "roscado", nombre: "Roscas", unidad: "ud", precio: 1.2, pista: "Número de roscas por pieza." },
      { clave: "taladro", nombre: "Taladros", unidad: "ud", precio: 0.6, pista: "Número de taladros pasantes o ciegos por pieza." },
      { clave: "tratamiento_termico", nombre: "Tratamiento térmico", unidad: "kg", precio: 3.5, pista: "Kg de pieza si el plano pide temple, bonificado, nitrurado o cementado." },
      { clave: "tratamiento_superficial", nombre: "Tratamiento superficial", unidad: "m2", precio: 25, pista: "Zincado, anodizado, pavonado o niquelado: m² de superficie de la pieza." },
      { clave: "control_calidad", nombre: "Control dimensional", unidad: "h", precio: 40, porLote: true, pista: "Si pide informe de medición o tolerancias críticas." },
      { clave: "preparacion", nombre: "Preparación de máquina", unidad: "ud", precio: 40, porLote: true, pista: "Una por cada máquina distinta que interviene." },
      { clave: "programacion", nombre: "Programación CAM", unidad: "h", precio: 45, porLote: true, pista: "Horas de programación para la referencia." },
      { clave: "transporte", nombre: "Transporte", unidad: "ud", precio: 25, porLote: true, pista: "Solo si el documento lo pide." },
    ],
  },
  {
    id: "calderia", nombre: "Calderería y estructuras metálicas", corto: "Calderería", icono: "🏗️",
    descripcion: "Bastidores, mesas de inoxidable, depósitos, barandillas, estructuras y soportes.",
    documentos: "Planos de conjunto, croquis acotados o fotos con medidas",
    usaMateriales: true, sobremedida: 0, margen: 30,
    conceptos: [
      { clave: "corte_laser", nombre: "Corte láser / plasma", unidad: "m", precio: 2.5, pista: "Metros de contorno de corte de las chapas (perímetro + agujeros)." },
      { clave: "corte_sierra", nombre: "Cortes de perfil o tubo", unidad: "ud", precio: 2.5, pista: "Número de cortes de sierra de perfiles y tubos por conjunto." },
      { clave: "plegado", nombre: "Plegado", unidad: "ud", precio: 1.5, pista: "Número de pliegues por conjunto." },
      { clave: "taladro", nombre: "Taladros", unidad: "ud", precio: 0.6, pista: "Agujeros por conjunto." },
      { clave: "soldadura_mig", nombre: "Soldadura MIG/MAG", unidad: "m", precio: 12, pista: "Metros de cordón en acero al carbono: suma de las uniones." },
      { clave: "soldadura_tig", nombre: "Soldadura TIG", unidad: "m", precio: 22, pista: "Metros de cordón en inoxidable o aluminio." },
      { clave: "repaso", nombre: "Amolado y repaso", unidad: "h", precio: 30, pista: "Horas de repasar soldaduras y aristas." },
      { clave: "pulido", nombre: "Pulido / satinado", unidad: "m2", precio: 28, pista: "m² de superficie vista en inoxidable." },
      { clave: "granallado", nombre: "Granallado", unidad: "m2", precio: 9, pista: "m² si se pide granallado." },
      { clave: "pintura", nombre: "Pintura", unidad: "m2", precio: 18, pista: "m² a pintar (dos caras de chapa, desarrollo de perfiles)." },
      { clave: "galvanizado", nombre: "Galvanizado en caliente", unidad: "kg", precio: 0.9, pista: "Kg totales si se pide galvanizado." },
      { clave: "montaje_taller", nombre: "Montaje en taller", unidad: "h", precio: 35, pista: "Horas de armado, punteado y ajuste por conjunto." },
      { clave: "montaje_obra", nombre: "Montaje en obra", unidad: "h", precio: 42, porLote: true, pista: "Solo si hay que instalar en destino." },
      { clave: "ingenieria", nombre: "Planos de taller", unidad: "h", precio: 45, porLote: true, pista: "Horas de oficina técnica si hay que desarrollar planos." },
      { clave: "transporte", nombre: "Transporte", unidad: "ud", precio: 60, porLote: true, pista: "Solo si se pide entrega." },
    ],
  },
  {
    id: "chapa", nombre: "Chapa: corte láser y plegado", corto: "Chapa", icono: "📐",
    descripcion: "Envolventes, cajas, soportes, frontales y piezas de chapa plegada.",
    documentos: "Planos de desarrollo, DXF impresos o croquis",
    usaMateriales: true, sobremedida: 0, margen: 28,
    conceptos: [
      { clave: "corte_laser", nombre: "Corte láser", unidad: "m", precio: 1.8, pista: "Metros de contorno por pieza (perímetro exterior + interiores)." },
      { clave: "perforacion", nombre: "Perforaciones (entradas de láser)", unidad: "ud", precio: 0.15, pista: "Una por cada agujero o contorno interior." },
      { clave: "plegado", nombre: "Plegado", unidad: "ud", precio: 1.2, pista: "Pliegues por pieza." },
      { clave: "roscado", nombre: "Roscas", unidad: "ud", precio: 0.8, pista: "Roscas por pieza." },
      { clave: "insertos", nombre: "Insertos y tuercas remachables", unidad: "ud", precio: 0.6, pista: "Insertos PEM, remaches o tuercas por pieza." },
      { clave: "soldadura_puntos", nombre: "Soldadura por puntos", unidad: "ud", precio: 0.5, pista: "Puntos de soldadura por pieza." },
      { clave: "desbarbado", nombre: "Desbarbado", unidad: "m", precio: 0.3, pista: "Metros de arista a desbarbar." },
      { clave: "lacado", nombre: "Lacado en polvo", unidad: "m2", precio: 16, pista: "m² a lacar (dos caras)." },
      { clave: "preparacion", nombre: "Preparación de plegadora", unidad: "ud", precio: 25, porLote: true, pista: "Una por referencia." },
      { clave: "programacion", nombre: "Programación y anidado", unidad: "ud", precio: 20, porLote: true, pista: "Una por referencia." },
    ],
  },
  {
    id: "carpinteria_metalica", nombre: "Carpintería metálica y aluminio", corto: "Carpintería metálica", icono: "🚪",
    descripcion: "Puertas, ventanas, cerramientos, rejas, portones y barandillas.",
    documentos: "Croquis de medidas, fotos del hueco o planos de fachada",
    usaMateriales: false, sobremedida: 0, margen: 30,
    conceptos: [
      { clave: "perfil_aluminio", nombre: "Perfil de aluminio", unidad: "m", precio: 9, pista: "Metros lineales de perfil (marcos + hojas + travesaños)." },
      { clave: "perfil_acero", nombre: "Perfil o tubo de acero", unidad: "m", precio: 6, pista: "Metros lineales de perfil de acero." },
      { clave: "chapa_panel", nombre: "Chapa o panel", unidad: "m2", precio: 28, pista: "m² de chapa, panel sándwich o relleno." },
      { clave: "vidrio", nombre: "Vidrio doble (cámara)", unidad: "m2", precio: 38, pista: "m² de vidrio." },
      { clave: "vidrio_seguridad", nombre: "Vidrio laminado de seguridad", unidad: "m2", precio: 65, pista: "m² si se pide laminado o seguridad." },
      { clave: "herrajes", nombre: "Herrajes", unidad: "ud", precio: 12, pista: "Juegos de bisagras, manetas, pernios por hoja." },
      { clave: "cerradura", nombre: "Cerradura", unidad: "ud", precio: 35, pista: "Cerraduras." },
      { clave: "motor", nombre: "Motorización", unidad: "ud", precio: 380, pista: "Solo si se pide puerta motorizada." },
      { clave: "soldadura_mig", nombre: "Soldadura", unidad: "m", precio: 12, pista: "Metros de cordón en piezas de acero." },
      { clave: "lacado", nombre: "Lacado", unidad: "m2", precio: 18, pista: "m² a lacar." },
      { clave: "montaje_obra", nombre: "Colocación en obra", unidad: "h", precio: 40, pista: "Horas de colocación por unidad." },
      { clave: "medicion", nombre: "Toma de medidas", unidad: "ud", precio: 40, porLote: true, pista: "Una visita." },
      { clave: "transporte", nombre: "Transporte", unidad: "ud", precio: 50, porLote: true, pista: "Una entrega." },
    ],
  },
  {
    id: "electrico", nombre: "Cuadros e instalaciones eléctricas", corto: "Eléctrico", icono: "⚡",
    descripcion: "Cuadros de maniobra y protección, automatización e instalaciones.",
    documentos: "Esquemas unifilares y multifilares, listas de materiales",
    usaMateriales: false, sobremedida: 0, margen: 25,
    conceptos: [
      { clave: "armario", nombre: "Armario / envolvente", unidad: "ud", precio: 180, pista: "Armarios o cajas, según tamaño aparente." },
      { clave: "cableado_cuadro", nombre: "Cableado de cuadro", unidad: "h", precio: 38, pista: "Horas de montaje y cableado: ~0,3-0,5 h por aparato." },
      { clave: "cable", nombre: "Cable", unidad: "m", precio: 1.8, pista: "Metros de cable de instalación si se indican recorridos." },
      { clave: "canalizacion", nombre: "Canalización / bandeja", unidad: "m", precio: 6, pista: "Metros de tubo o bandeja." },
      { clave: "mano_obra", nombre: "Mano de obra de instalación", unidad: "h", precio: 38, pista: "Horas de instalación en campo." },
      { clave: "programacion_plc", nombre: "Programación PLC / HMI", unidad: "h", precio: 55, porLote: true, pista: "Solo si hay autómata o pantalla." },
      { clave: "documentacion", nombre: "Esquemas y documentación", unidad: "h", precio: 45, porLote: true, pista: "Horas de rehacer esquemas y documentación final." },
      { clave: "puesta_marcha", nombre: "Pruebas y puesta en marcha", unidad: "h", precio: 45, porLote: true, pista: "Horas de pruebas." },
      { clave: "legalizacion", nombre: "Legalización / boletín", unidad: "ud", precio: 220, porLote: true, pista: "Solo si es instalación que lo requiere." },
    ],
  },
  {
    id: "fluidos", nombre: "Neumática e hidráulica", corto: "Neumática e hidráulica", icono: "💧",
    descripcion: "Grupos hidráulicos, circuitos neumáticos, cilindros y válvulas.",
    documentos: "Esquemas neumáticos o hidráulicos y listas de componentes",
    usaMateriales: false, sobremedida: 0, margen: 25,
    conceptos: [
      { clave: "tubo", nombre: "Tubo", unidad: "m", precio: 3.5, pista: "Metros de tubo si se indican." },
      { clave: "racores", nombre: "Racores", unidad: "ud", precio: 3, pista: "Racores: unos 2 por componente conectado." },
      { clave: "latiguillo", nombre: "Latiguillos", unidad: "ud", precio: 28, pista: "Latiguillos hidráulicos." },
      { clave: "montaje", nombre: "Montaje", unidad: "h", precio: 40, pista: "Horas de montaje: ~0,5 h por componente." },
      { clave: "prueba_presion", nombre: "Prueba de presión", unidad: "ud", precio: 45, porLote: true, pista: "Una por circuito." },
      { clave: "puesta_marcha", nombre: "Puesta en marcha", unidad: "h", precio: 45, porLote: true, pista: "Horas de ajuste." },
    ],
  },
  {
    id: "reparacion", nombre: "Reparación y mantenimiento de maquinaria", corto: "Reparación", icono: "🔧",
    descripcion: "Averías, revisiones y recambios a partir de fotos de la máquina o la pieza.",
    documentos: "Fotos de la avería o de la placa de características",
    usaMateriales: false, sobremedida: 0, margen: 25,
    conceptos: [
      { clave: "diagnostico", nombre: "Diagnóstico", unidad: "h", precio: 45, porLote: true, pista: "Horas de diagnóstico." },
      { clave: "mano_obra_taller", nombre: "Mano de obra en taller", unidad: "h", precio: 40, pista: "Horas de desmontaje, reparación y montaje." },
      { clave: "mano_obra_campo", nombre: "Mano de obra en instalaciones del cliente", unidad: "h", precio: 48, pista: "Si se repara en destino." },
      { clave: "desplazamiento", nombre: "Desplazamiento", unidad: "ud", precio: 35, porLote: true, pista: "Si se va a casa del cliente." },
      { clave: "rodamientos", nombre: "Rodamientos", unidad: "ud", precio: 25, pista: "Rodamientos a sustituir." },
      { clave: "juntas", nombre: "Retenes y juntas", unidad: "ud", precio: 8, pista: "Retenes, juntas y tóricas." },
      { clave: "aceite", nombre: "Aceite y consumibles", unidad: "l", precio: 6, pista: "Litros de aceite o grasa." },
      { clave: "fabricacion", nombre: "Fabricación de piezas", unidad: "h", precio: 45, pista: "Horas si hay que fabricar una pieza nueva." },
      { clave: "soldadura", nombre: "Soldadura de reparación", unidad: "h", precio: 45, pista: "Horas de recargue o soldadura." },
    ],
  },
  {
    id: "clima", nombre: "Climatización y fontanería", corto: "Climatización", icono: "❄️",
    descripcion: "Instalaciones de clima, ventilación y fontanería desde plano de planta.",
    documentos: "Planos de planta con cotas, croquis o fotos",
    usaMateriales: false, sobremedida: 0, margen: 25,
    conceptos: [
      { clave: "equipo", nombre: "Equipo de climatización", unidad: "ud", precio: 650, pista: "Equipos (split, cassette, conductos) según estancias." },
      { clave: "conducto", nombre: "Conducto", unidad: "m2", precio: 32, pista: "m² de conducto." },
      { clave: "rejilla", nombre: "Rejillas y difusores", unidad: "ud", precio: 45, pista: "Una por estancia climatizada salvo que se indique otra cosa." },
      { clave: "tuberia_frigorifica", nombre: "Tubería frigorífica", unidad: "m", precio: 18, pista: "Metros entre unidades interior y exterior." },
      { clave: "tuberia_agua", nombre: "Tubería de agua", unidad: "m", precio: 14, pista: "Metros de tubería." },
      { clave: "desague", nombre: "Desagüe", unidad: "m", precio: 9, pista: "Metros de desagüe." },
      { clave: "sanitario", nombre: "Aparato sanitario", unidad: "ud", precio: 180, pista: "Inodoros, lavabos, platos de ducha." },
      { clave: "mano_obra", nombre: "Mano de obra", unidad: "h", precio: 38, pista: "Horas de instalación." },
      { clave: "puesta_marcha", nombre: "Puesta en marcha", unidad: "ud", precio: 90, porLote: true, pista: "Una por instalación." },
      { clave: "boletin", nombre: "Certificado / boletín", unidad: "ud", precio: 150, porLote: true, pista: "Si se pide legalización." },
    ],
  },
  {
    id: "madera", nombre: "Carpintería de madera y mobiliario", corto: "Madera", icono: "🪵",
    descripcion: "Muebles a medida, cocinas, armarios, mostradores y revestimientos.",
    documentos: "Croquis acotados, renders o fotos con medidas",
    usaMateriales: false, sobremedida: 0, margen: 35,
    conceptos: [
      { clave: "tablero_melamina", nombre: "Tablero melamina", unidad: "m2", precio: 14, pista: "m² de tablero (suma de todas las piezas)." },
      { clave: "tablero_lacar", nombre: "Tablero DM para lacar", unidad: "m2", precio: 22, pista: "m² si va lacado." },
      { clave: "madera_maciza", nombre: "Madera maciza / chapada", unidad: "m2", precio: 45, pista: "m² en madera natural." },
      { clave: "corte", nombre: "Corte de tablero", unidad: "m", precio: 0.9, pista: "Metros de corte." },
      { clave: "canto", nombre: "Canteado", unidad: "m", precio: 1.2, pista: "Metros de canto visto." },
      { clave: "cnc", nombre: "Mecanizado CNC", unidad: "h", precio: 45, pista: "Horas si hay mecanizados." },
      { clave: "bisagra", nombre: "Bisagras", unidad: "ud", precio: 3.5, pista: "2 por puerta (3 si mide más de 1 m)." },
      { clave: "guia", nombre: "Guías de cajón", unidad: "ud", precio: 14, pista: "Un par por cajón." },
      { clave: "herrajes", nombre: "Tiradores y otros herrajes", unidad: "ud", precio: 6, pista: "Uno por puerta o cajón." },
      { clave: "lacado", nombre: "Lacado", unidad: "m2", precio: 35, pista: "m² lacados." },
      { clave: "montaje", nombre: "Montaje", unidad: "h", precio: 32, pista: "Horas de montaje en destino." },
      { clave: "transporte", nombre: "Transporte", unidad: "ud", precio: 40, porLote: true, pista: "Una entrega." },
    ],
  },
  {
    id: "reformas", nombre: "Reformas y obra", corto: "Reformas", icono: "🧱",
    descripcion: "Reformas de naves, oficinas y locales desde plano de planta.",
    documentos: "Planos de planta con cotas y superficies",
    usaMateriales: false, sobremedida: 0, margen: 20,
    conceptos: [
      { clave: "demolicion", nombre: "Demolición", unidad: "m2", precio: 14, pista: "m² a demoler." },
      { clave: "tabique", nombre: "Tabiquería de placa de yeso", unidad: "m2", precio: 32, pista: "m² de tabique: longitud × altura (2,6 m si no se indica, y anótalo en supuestos)." },
      { clave: "falso_techo", nombre: "Falso techo", unidad: "m2", precio: 28, pista: "m² de superficie de las estancias." },
      { clave: "solado", nombre: "Solado", unidad: "m2", precio: 38, pista: "m² de suelo." },
      { clave: "alicatado", nombre: "Alicatado", unidad: "m2", precio: 36, pista: "m² de pared en baños y cocinas." },
      { clave: "pintura", nombre: "Pintura", unidad: "m2", precio: 7, pista: "m² de paredes y techos." },
      { clave: "punto_electrico", nombre: "Punto eléctrico", unidad: "ud", precio: 45, pista: "Enchufes, interruptores y puntos de luz." },
      { clave: "punto_agua", nombre: "Punto de agua", unidad: "ud", precio: 90, pista: "Tomas de agua y desagües." },
      { clave: "puerta", nombre: "Puerta interior", unidad: "ud", precio: 280, pista: "Puertas dibujadas." },
      { clave: "escombros", nombre: "Gestión de residuos", unidad: "ud", precio: 180, porLote: true, pista: "Un contenedor por obra pequeña." },
      { clave: "mano_obra", nombre: "Ayudas y mano de obra", unidad: "h", precio: 30, pista: "Horas que no entren en otras partidas." },
    ],
  },
];

export const sectorDe = (id: string) => SECTORES.find((s) => s.id === id) || SECTORES[1];

/** Precio efectivo de un concepto: el de la empresa si lo ha puesto; si es de horas de tu gente, tu hora de mano de obra; si no, el orientativo. */
export const precioConcepto = (s: Sector, clave: string, tarifas?: Record<string, number>, manoObra?: number) => {
  const t = tarifas?.[`${s.id}.${clave}`];
  if (typeof t === "number" && t >= 0) return t;
  if (typeof manoObra === "number" && manoObra > 0 && usaHoraManoObra(s, clave)) return manoObra;
  return s.conceptos.find((c) => c.clave === clave)?.precio ?? 0;
};

// ── Qué es cada partida por dentro (para el desglose interno y la lista de compra) ──
// material = se compra (va a la lista de compra) · mano_obra = horas de tu gente · maquina = proceso en máquina
// externo = se subcontrata (tratamientos, transporte, legalización) · obra = partida completa (material + mano de obra)
export type TipoPartida = "material" | "mano_obra" | "maquina" | "externo" | "obra";

export const TIPOS_PARTIDA: Record<TipoPartida, string> = {
  material: "Material", mano_obra: "Mano de obra", maquina: "Máquina", externo: "Subcontratado", obra: "Partidas de obra",
};

const T_MATERIAL = new Set([
  "perfil_aluminio", "perfil_acero", "chapa_panel", "vidrio", "vidrio_seguridad", "herrajes", "cerradura", "motor", "armario", "cable", "canalizacion",
  "tubo", "racores", "latiguillo", "rodamientos", "juntas", "aceite", "equipo", "conducto", "rejilla", "tuberia_frigorifica", "tuberia_agua", "desague",
  "sanitario", "tablero_melamina", "tablero_lacar", "madera_maciza", "bisagra", "guia", "puerta", "insertos",
]);
const T_EXTERNO = new Set(["tratamiento_termico", "tratamiento_superficial", "galvanizado", "granallado", "lacado", "transporte", "legalizacion", "boletin", "escombros"]);
const T_MAQUINA = new Set([
  "torno_cnc", "fresa_cnc", "cinco_ejes", "convencional", "rectificado", "electroerosion", "roscado", "taladro", "corte_laser", "corte_sierra", "plegado",
  "perforacion", "soldadura_puntos", "cnc", "corte", "canto",
]);
const T_OBRA = new Set(["demolicion", "tabique", "falso_techo", "solado", "alicatado", "punto_electrico", "punto_agua"]);

export const tipoConcepto = (sectorId: string, clave: string): TipoPartida => {
  if (sectorId === "reformas" && clave === "pintura") return "obra";
  if (T_MATERIAL.has(clave)) return "material";
  if (T_EXTERNO.has(clave)) return "externo";
  if (T_MAQUINA.has(clave)) return "maquina";
  if (T_OBRA.has(clave)) return "obra";
  return "mano_obra";
};

/** Conceptos que se cobran con TU hora de mano de obra (los de horas que hace tu gente, no las máquinas). */
// Oficina técnica y puesta en marcha llevan su propia tarifa (suele ser más cara que la hora de taller).
const OFICINA = new Set(["programacion", "programacion_plc", "ingenieria", "documentacion", "puesta_marcha", "control_calidad"]);
export const usaHoraManoObra = (s: Sector, clave: string) => {
  const c = s.conceptos.find((x) => x.clave === clave);
  return !!c && c.unidad === "h" && !OFICINA.has(clave) && tipoConcepto(s.id, clave) === "mano_obra";
};

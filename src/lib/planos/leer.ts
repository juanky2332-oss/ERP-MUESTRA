import 'server-only'

import OpenAI from 'openai'
import { MATERIALES, type Material } from '@/lib/calculadora/materiales'
import { FORMAS } from '@/lib/calculadora/calculo'
import type { LecturaPlano, ModoPlano } from './tipos'

/**
 * Lee un plano, croquis, foto o esquema con IA y devuelve los datos
 * estructurados. La IA SOLO extrae lo que se ve: lo que no aparece vuelve a
 * null y se pregunta al usuario. Nunca calcula precios (eso lo hace el ERP
 * con las tarifas y el catálogo del taller).
 */

// gpt-5.4 lee planos mucho mejor que gpt-4o (deduce patas, desarrollos de chapa y unidades del conjunto)
const MODELO = process.env.OPENAI_MODEL_PLANOS || 'gpt-5.4'

const num = { type: ['number', 'null'] }
const str = { type: ['string', 'null'] }
const MEDIDAS = { type: 'object', additionalProperties: false, required: ['D', 'd', 'L', 'A', 'B', 'E', 'S', 'V', 'P'], properties: { D: num, d: num, L: num, A: num, B: num, E: num, S: num, V: num, P: num } }

function esquemaRespuesta(materiales: Material[]) {
    const idsMat = [...materiales.map(m => m.id), null]
    const formas = FORMAS.map(f => f.id).filter(f => f !== 'peso')
    return {
        name: 'lectura_plano',
        strict: true,
        schema: {
            type: 'object', additionalProperties: false,
            required: ['modo', 'legible', 'faltan', 'pieza', 'conjunto', 'esquema'],
            properties: {
                modo: { type: 'string', enum: ['pieza', 'conjunto', 'esquema'] },
                legible: { type: 'boolean' },
                faltan: { type: 'array', items: { type: 'string' } },
                pieza: {
                    anyOf: [{ type: 'null' }, {
                        type: 'object', additionalProperties: false,
                        required: ['nombre', 'material_texto', 'material_id', 'forma', 'medidas', 'cantidad', 'tolerancias', 'tratamientos', 'acabado', 'taladros', 'notas'],
                        properties: {
                            nombre: { type: 'string' }, material_texto: str, material_id: { enum: idsMat },
                            forma: { enum: [...formas, null] }, medidas: MEDIDAS, cantidad: num,
                            tolerancias: { type: 'array', items: { type: 'string' } },
                            tratamientos: { type: 'array', items: { type: 'string' } },
                            acabado: str,
                            taladros: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['d', 'prof', 'n'], properties: { d: { type: 'number' }, prof: { type: 'number' }, n: { type: 'number' } } } },
                            notas: { type: 'array', items: { type: 'string' } },
                        },
                    }],
                },
                conjunto: {
                    anyOf: [{ type: 'null' }, {
                        type: 'object', additionalProperties: false,
                        required: ['nombre', 'cantidad', 'material_texto', 'material_id', 'elementos', 'procesos', 'notas'],
                        properties: {
                            nombre: { type: 'string' }, cantidad: num, material_texto: str, material_id: { enum: idsMat },
                            elementos: {
                                type: 'array', items: {
                                    type: 'object', additionalProperties: false,
                                    required: ['nombre', 'forma', 'material_id', 'medidas', 'cantidad', 'origen', 'nota'],
                                    properties: {
                                        nombre: { type: 'string' }, forma: { enum: formas }, material_id: { enum: idsMat }, medidas: MEDIDAS,
                                        cantidad: { type: 'number' }, origen: { type: 'string', enum: ['cota', 'texto', 'deducido'] }, nota: str,
                                    },
                                },
                            },
                            procesos: {
                                type: 'object', additionalProperties: false,
                                required: ['corte_metros', 'perforaciones', 'plegados', 'soldadura_metros', 'soldadura_tipo', 'acabado', 'acabado_m2', 'montaje_horas'],
                                properties: {
                                    corte_metros: num, perforaciones: num, plegados: num, soldadura_metros: num,
                                    soldadura_tipo: { enum: ['TIG', 'MIG', null] },
                                    acabado: { enum: ['pulido', 'satinado', 'pintura', 'galvanizado', 'ninguno', null] },
                                    acabado_m2: num, montaje_horas: num,
                                },
                            },
                            notas: { type: 'array', items: { type: 'string' } },
                        },
                    }],
                },
                esquema: {
                    anyOf: [{ type: 'null' }, {
                        type: 'object', additionalProperties: false,
                        required: ['titulo', 'tipo_esquema', 'componentes', 'notas'],
                        properties: {
                            titulo: { type: 'string' },
                            tipo_esquema: { type: 'string', enum: ['electrico', 'neumatico', 'hidraulico', 'otro'] },
                            componentes: {
                                type: 'array', items: {
                                    type: 'object', additionalProperties: false,
                                    required: ['descripcion', 'tipo', 'caracteristicas', 'marca_ref', 'cantidad', 'designacion', 'confianza'],
                                    properties: {
                                        descripcion: { type: 'string' }, tipo: { type: 'string' }, caracteristicas: str, marca_ref: str,
                                        cantidad: { type: 'number' }, designacion: str, confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
                                    },
                                },
                            },
                            notas: { type: 'array', items: { type: 'string' } },
                        },
                    }],
                },
            },
        },
    }
}

function prompt(materiales: Material[], modo: ModoPlano | 'auto') {
    const formas = FORMAS.filter(f => f.id !== 'peso').map(f => `${f.id} (${f.nombre}: ${f.campos.map(c => `${c.key}=${c.label}`).join(', ')})`).join('\n  ')
    return `Eres un técnico de oficina técnica de un taller industrial español (mecanizado, calderería, inoxidable, montajes eléctricos). Lees planos, croquis, fotos con medidas y esquemas para preparar un presupuesto.

${modo === 'auto' ? 'Decide el MODO:' : `MODO OBLIGATORIO: ${modo}.`}
- "pieza": plano o croquis de UNA pieza mecanizada (eje, casquillo, brida, placa...).
- "conjunto": algo fabricado con varias piezas de chapa, tubo o perfil (mesa de inoxidable, bastidor, soporte, barandilla, bancada, carro...).
- "esquema": esquema eléctrico, neumático o hidráulico (o lista de materiales de uno).

REGLAS QUE NO PUEDES ROMPER:
1. Extrae SOLO lo que se ve escrito o acotado. Si una medida, espesor, material o cantidad no aparece, pon null y añade en "faltan" una pregunta corta y concreta (p. ej. "¿Qué espesor tiene el tablero?").
2. En "conjunto" puedes DEDUCIR una medida solo si sale de cotas que sí están (p. ej. alto de pata = alto total − espesor del tablero). Márcala con origen "deducido" y explica el cálculo en "nota". Nunca supongas espesores, diámetros ni materiales.
3. No calcules precios ni pesos: eso lo hace el programa.
4. Medidas SIEMPRE en milímetros (convierte si vienen en cm o m). Volumen V en cm³ y peso P en kg solo si vienen indicados.
5. material_id: elige de la lista el que corresponda EXACTAMENTE a lo indicado (AISI 304 → aisi304, F-1140 o C45 → c45, S275 → s275, 6082 → al6082...). Si no se indica material, null. Si es uno que no está en la lista, null y explícalo en notas con material_texto.
6. Si la imagen no se lee bien, legible=false y pide en "faltan" lo necesario.
7. En "esquema": una fila por tipo de componente con la cantidad total contada (p. ej. 3 contactores iguales = cantidad 3). Pon las designaciones (KM1, KM2, Q1...) en "designacion", las características que se lean (calibre, polos, curva, sensibilidad, tensión de bobina, potencia, diámetro de cilindro y carrera...) en "caracteristicas" y la marca/referencia SOLO si está escrita. Confianza "baja" si el símbolo no está claro. No añadas componentes que no se vean (ni cableado, ni bornas, si no aparecen dibujados o listados).
8. En "conjunto", "procesos": rellena solo lo que se pueda contar o medir en el dibujo (pliegues visibles, metros de cordón deducibles de uniones acotadas, superficie a pulir si hay medidas). Lo que no, null.
9. CANTIDADES en "conjunto": "cantidad" del conjunto = cuántos conjuntos completos hay que fabricar ("6 unidades", "6 uds", "x6" al final de la lista o en el cajetín se refieren al CONJUNTO). La "cantidad" de cada elemento es la que lleva UN conjunto (4 patas, 1 tablero, 1 estante...). Nunca multipliques tú.
10. CHAPAS PLEGADAS en "conjunto": si una chapa lleva faldón, pestaña o pliegues, el elemento es el DESARROLLO (chapa plana antes de plegar): A = largo + 2 × faldón, B = ancho + 2 × faldón (si el faldón va en los 4 lados), origen "deducido" y explica el cálculo en "nota". Cuenta en procesos.plegados los pliegues de UN conjunto (un faldón en 4 lados = 4 pliegues).
11. PATAS y montantes: si hay un alto total y un tablero de espesor conocido, el largo de la pata = alto total − espesor del tablero (origen "deducido"). Si el faldón apoya sobre la pata, réstalo también solo si el dibujo lo indica.
12. Medidas de un estante, refuerzo o travesaño que estén escritas en las notas cuentan como "texto".

FORMAS y campos de medidas (usa las letras indicadas; las demás a null):
  ${formas}
  En chapa/tablero: A = largo, B = ancho, E = espesor. En tubo cuadrado/rectangular: A, B = lados, E = espesor de pared, L = largo.

MATERIALES (id: nombre):
  ${materiales.map(m => `${m.id}: ${m.nombre}`).join('\n  ')}

Rellena solo el bloque del modo elegido; los otros dos a null.`
}

export async function leerPlanoConIA(buffer: Buffer, contentType: string, opciones: { modo: ModoPlano | 'auto'; nota?: string | null; materialesExtra?: Material[] }): Promise<{ lectura: LecturaPlano; tokens: { entrada: number; salida: number }; modelo: string }> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('Falta la clave de OpenAI en el servidor.')
    const client = new OpenAI({ apiKey })
    const materiales = [...MATERIALES, ...(opciones.materialesExtra || [])]
    const esPdf = contentType.includes('pdf') || buffer.subarray(0, 5).toString('latin1') === '%PDF-'
    const adjunto = esPdf
        ? { type: 'file', file: { filename: 'plano.pdf', file_data: `data:application/pdf;base64,${buffer.toString('base64')}` } }
        : { type: 'image_url', image_url: { url: `data:${contentType || 'image/jpeg'};base64,${buffer.toString('base64')}`, detail: 'high' } }
    const razonador = /^(gpt-5|o\d)/.test(MODELO)
    const res = await client.chat.completions.create({
        model: MODELO,
        messages: [
            { role: 'system', content: prompt(materiales, opciones.modo) },
            { role: 'user', content: [adjunto, { type: 'text', text: opciones.nota?.trim() ? `Indicaciones del usuario (tienen prioridad sobre lo que no se lea bien): ${opciones.nota.trim()}` : 'Extrae los datos para presupuestar.' }] as any },
        ],
        response_format: { type: 'json_schema', json_schema: esquemaRespuesta(materiales) as any },
        ...(razonador ? { reasoning_effort: 'medium' as any, max_completion_tokens: 12000 } : { temperature: 0, max_tokens: 4000 }),
    })
    const content = res.choices[0]?.message?.content
    if (!content) throw new Error('La IA no ha devuelto datos. Prueba con una imagen más nítida.')
    const lectura = JSON.parse(content) as LecturaPlano
    return { lectura, tokens: { entrada: res.usage?.prompt_tokens || 0, salida: res.usage?.completion_tokens || 0 }, modelo: MODELO }
}

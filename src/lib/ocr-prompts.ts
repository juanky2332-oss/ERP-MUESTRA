/**
 * Fragmentos de prompt compartidos por los dos flujos de OCR del ERP
 * (src/actions/ocr.ts y src/app/actions/ocr.ts).
 *
 * Viven en /lib y no dentro de las server actions porque un fichero marcado
 * con 'use server' sólo puede exportar funciones asíncronas.
 */

import { ownCompanyPromptBlock } from './company'

/**
 * Reglas para identificar SIN AMBIGÜEDAD las dos partes del documento.
 *
 * Es la pieza clave para que un gasto no acabe con la propia empresa como
 * proveedor: en lugar de pedirle a la IA que decida "el proveedor", le pedimos
 * los dos intervinientes por separado y la decisión final la toma el código
 * (ver src/lib/expense-supplier.ts).
 */
export const REGLAS_PARTES = `IDENTIFICACIÓN DE LAS DOS PARTES (CRÍTICO, NO TE EQUIVOQUES):
Todo documento tiene un EMISOR y un RECEPTOR. Debes extraer los dos.

- EMISOR = quien expide el documento y COBRA el dinero (el proveedor/vendedor).
  Señales de que una empresa es el EMISOR:
  * Sus datos aparecen en el membrete/logotipo de la cabecera junto al nº de factura.
  * Es la titular de la cuenta bancaria / IBAN donde hay que pagar.
  * Aparece junto a textos como "Factura emitida por", "Vendedor", "Expedidor".
  * Sus datos figuran en el pie de página con registro mercantil o dirección fiscal.

- RECEPTOR = quien recibe el documento y PAGA (el cliente/comprador).
  Señales de que una empresa es el RECEPTOR:
  * Aparece bajo etiquetas "Cliente", "Facturar a", "Destinatario", "Enviar a",
    "Razón social del cliente", "Datos del cliente", "Sres.", "A la atención de".
  * Va acompañada de "Su pedido", "Su referencia", "Nº de cliente".
  * Suele estar en un recuadro a la derecha o debajo de los datos del emisor.

REGLAS DE DESEMPATE:
1. El titular del IBAN/cuenta de pago es SIEMPRE el emisor.
2. Un logotipo grande NO implica que sea el emisor: comprueba las etiquetas de texto.
3. Si una de las dos empresas coincide con los datos de NUESTRA empresa
   (indicados más abajo), esa es el RECEPTOR salvo que el documento diga
   literalmente lo contrario.
4. Si aun así no puedes determinarlo, deja el campo vacío. NO INVENTES y NO
   repitas la misma empresa en los dos campos.

${ownCompanyPromptBlock()}`

/** Campos de salida comunes a los dos flujos (PDF e imagen). */
export const CAMPOS_JSON = `- emisor_nombre: Razón social del EMISOR (quien cobra). Vacío si no se puede determinar.
- emisor_cif: CIF/NIF del emisor.
- receptor_nombre: Razón social del RECEPTOR (quien paga). Vacío si no se puede determinar.
- receptor_cif: CIF/NIF del receptor.
- proveedor: Copia exacta de emisor_nombre (compatibilidad).
- proveedor_cif: Copia exacta de emisor_cif (compatibilidad).
- fecha: YYYY-MM-DD.
- numero: Nº real del documento.
- concepto: Descripción detallada (campo muy importante).
- numero_pedido_ref: Pedido/Ref del cliente (o vacío).
- base_imponible: Número.
- iva_porcentaje: Número (ej: 21).
- iva_importe: Número.
- total: Número.`

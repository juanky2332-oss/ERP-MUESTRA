/**
 * Resolución determinista del PROVEEDOR de un gasto.
 *
 * La IA se equivoca con cierta frecuencia al decidir quién emite y quién recibe
 * una factura (sobre todo cuando nuestro logotipo aparece grande en la cabecera
 * o cuando el proveedor imprime nuestros datos como "Cliente"). Por eso, además
 * de pedirle a la IA las DOS partes por separado, aquí aplicamos reglas fijas
 * que garantizan que la propia empresa nunca acabe registrada como proveedor.
 */

import { isOwnCompany, normalizeCif, OWN_COMPANY } from './company'

export const PROVEEDOR_PENDIENTE = 'REVISAR - Proveedor no identificado'

export interface OcrParties {
    // Campos nuevos (dos partes explícitas)
    emisor_nombre?: string
    emisor_cif?: string
    receptor_nombre?: string
    receptor_cif?: string
    // Campos antiguos, mantenidos por compatibilidad con documentos ya procesados
    proveedor?: string
    proveedor_cif?: string
    cliente?: string
    cliente_cif?: string
    [key: string]: unknown
}

export interface SupplierResolution {
    /** Nombre que se guardará en gastos.proveedor */
    proveedor: string
    /** CIF que se guardará en gastos.proveedor_cif */
    proveedor_cif: string
    /** true si no hemos podido determinarlo con seguridad y requiere repaso humano */
    revisar: boolean
    /** Explicación de la decisión (se guarda en ocr_data para poder auditarla) */
    motivo: string
}

interface Parte {
    nombre: string
    cif: string
    rol: 'emisor' | 'receptor'
}

function limpiar(value?: string | null): string {
    return (value || '').toString().trim().replace(/\s+/g, ' ')
}

/** ¿El valor es un marcador vacío del tipo "N/A", "-", "desconocido"? */
function esVacio(value: string): boolean {
    if (!value) return true
    const v = value.toLowerCase().replace(/[^a-z0-9]/g, '')
    return ['', 'na', 'nd', 'no', 'null', 'none', 'desconocido', 'sindatos', 'nodisponible'].includes(v)
}

/**
 * Decide el proveedor de un gasto a partir de los datos del OCR.
 *
 * Reglas, en orden:
 *  1. Se construyen las dos partes del documento (emisor y receptor).
 *  2. Se descartan las que son la propia empresa: nosotros nunca somos el proveedor.
 *  3. Si queda exactamente una, esa es el proveedor.
 *  4. Si quedan las dos (el documento no nos menciona), gana el emisor: quien
 *     emite la factura es quien cobra.
 *  5. Si no queda ninguna, se marca para revisión manual en lugar de inventar.
 */
export function resolveExpenseSupplier(ocr: OcrParties = {}): SupplierResolution {
    return resolveParty(ocr, 'emisor')
}

/**
 * Contraparte de un documento emitido POR NOSOTROS (p.ej. un albarán firmado):
 * ahí el emisor somos nosotros y quien nos interesa es el receptor (el cliente).
 */
export function resolveDocumentClient(ocr: OcrParties = {}): SupplierResolution {
    return resolveParty(ocr, 'receptor')
}

/**
 * Núcleo común: devuelve la parte del documento que NO es la propia empresa,
 * dando prioridad al rol indicado cuando ambas partes son externas.
 */
function resolveParty(ocr: OcrParties, preferido: 'emisor' | 'receptor'): SupplierResolution {
    const emisor: Parte = {
        nombre: limpiar(ocr.emisor_nombre ?? ocr.proveedor),
        cif: normalizeCif(ocr.emisor_cif ?? ocr.proveedor_cif),
        rol: 'emisor',
    }
    const receptor: Parte = {
        nombre: limpiar(ocr.receptor_nombre ?? ocr.cliente),
        cif: normalizeCif(ocr.receptor_cif ?? ocr.cliente_cif),
        rol: 'receptor',
    }

    const partes = [emisor, receptor].filter(p => !esVacio(p.nombre) || !esVacio(p.cif))
    const externas = partes.filter(p => !isOwnCompany(p.nombre, p.cif))

    // Caso 5: no hay ninguna parte externa identificable.
    if (externas.length === 0) {
        const motivo = partes.length === 0
            ? 'El OCR no devolvió ni emisor ni receptor.'
            : `Todas las partes detectadas son la propia empresa (${OWN_COMPANY.nombre}).`
        return { proveedor: PROVEEDOR_PENDIENTE, proveedor_cif: '', revisar: true, motivo }
    }

    // Caso 3 y 4.
    const elegida = externas.find(p => p.rol === preferido) || externas[0]

    // Si la parte elegida no es la esperada, la IA intercambió los roles:
    // usamos la contraparte, pero dejamos constancia para que se revise.
    const huboIntercambio = elegida.rol !== preferido

    const motivo = huboIntercambio
        ? `La IA situó a la propia empresa como ${preferido}; se ha usado la contraparte (${elegida.rol}).`
        : externas.length === 1
            ? `Identificado por el rol de ${preferido} (la otra parte es la propia empresa).`
            : `Identificado por el rol de ${preferido} (el documento no menciona a la propia empresa).`

    // Guardia final: bajo ninguna circunstancia devolvemos la empresa propia.
    if (isOwnCompany(elegida.nombre, elegida.cif)) {
        return {
            proveedor: PROVEEDOR_PENDIENTE,
            proveedor_cif: '',
            revisar: true,
            motivo: 'El candidato final coincidía con la propia empresa.',
        }
    }

    if (esVacio(elegida.nombre)) {
        return {
            proveedor: PROVEEDOR_PENDIENTE,
            proveedor_cif: elegida.cif,
            revisar: true,
            motivo: 'Se detectó el CIF del proveedor pero no su razón social.',
        }
    }

    return {
        proveedor: elegida.nombre,
        proveedor_cif: elegida.cif,
        revisar: huboIntercambio,
        motivo,
    }
}

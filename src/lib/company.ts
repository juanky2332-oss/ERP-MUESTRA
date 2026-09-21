/**
 * Identidad de la empresa propietaria del ERP.
 *
 * Se usa para garantizar que, al registrar un GASTO, la propia empresa nunca
 * pueda quedar guardada como "proveedor": en un gasto la empresa es siempre
 * quien PAGA (receptor de la factura), y el proveedor es la otra parte.
 *
 * Los valores se pueden sobreescribir por variables de entorno para no tener
 * que tocar código si cambia la razón social o el NIF.
 */

export const OWN_COMPANY = {
    nombre: process.env.NEXT_PUBLIC_COMPANY_NAME || 'EMPRESA X, S.L.',
    nif: process.env.NEXT_PUBLIC_COMPANY_NIF || 'B00000000',
    email: process.env.NEXT_PUBLIC_COMPANY_EMAIL || 'administracion@empresax-demo.com',
    dominios: ['empresax-demo.com'],
    /**
     * Formas alternativas con las que la empresa puede aparecer escrita en un
     * documento (logotipos, membretes, abreviaturas, erratas del OCR).
     * Se comparan ya normalizadas (sin acentos, sin puntuación, sin espacios).
     */
    alias: [
        'EMPRESA X',
        'EMPRESAX',
        'EMP X',
        'GRUPO EMPRESA X',
    ],
}

/** Rango unicode de marcas diacríticas combinantes (acentos tras normalize('NFD')). */
const DIACRITICOS = /[̀-ͯ]/g

/** Formas jurídicas que se eliminan antes de comparar nombres de empresa. */
const FORMAS_JURIDICAS = [
    'SOCIEDAD LIMITADA UNIPERSONAL',
    'SOCIEDAD LIMITADA',
    'SOCIEDAD ANONIMA',
    'SOCIEDAD COOPERATIVA',
    'SLU',
    'SLL',
    'SL',
    'SAU',
    'SA',
    'SCA',
    'SCOOP',
    'CB',
    'SCP',
]

/**
 * Normaliza un nombre de empresa para poder compararlo:
 * mayúsculas, sin acentos, sin puntuación, sin forma jurídica y sin espacios.
 * "Empresa X, S.L." -> "EMPRESAX"
 */
export function normalizeCompanyName(value?: string | null): string {
    if (!value) return ''

    let out = value
        .normalize('NFD')
        .replace(DIACRITICOS, '')
        .toUpperCase()
        // Los puntos se BORRAN (no se sustituyen por espacio) para que las
        // abreviaturas queden pegadas: "S.L." -> "SL" y así poder eliminarla
        // como forma jurídica. El resto de signos sí separan palabras.
        .replace(/\./g, '')
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    for (const forma of FORMAS_JURIDICAS) {
        out = out.replace(new RegExp(`(^|\\s)${forma}(\\s|$)`, 'g'), ' ')
    }

    return out.replace(/\s+/g, '')
}

/** Normaliza un CIF/NIF: mayúsculas y sólo caracteres alfanuméricos. */
export function normalizeCif(value?: string | null): string {
    if (!value) return ''
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Tokens significativos del nombre propio (p.ej. ['EMPRESA']). */
function ownNameTokens(): string[] {
    return OWN_COMPANY.nombre
        .normalize('NFD')
        .replace(DIACRITICOS, '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 && !FORMAS_JURIDICAS.includes(t))
}

/**
 * ¿Estos datos corresponden a la propia empresa?
 *
 * Criterios (cualquiera de ellos basta):
 *  1. El CIF/NIF coincide exactamente con el nuestro  -> prueba definitiva.
 *  2. El nombre normalizado coincide con el nuestro o con un alias conocido.
 *  3. El nombre contiene todos los tokens significativos de nuestra razón social.
 *  4. El texto incluye nuestro dominio corporativo.
 *
 * Se exigen TODOS los tokens (no basta con "X") para no confundir a un
 * proveedor real que comparta apellido en su razón social.
 */
export function isOwnCompany(nombre?: string | null, cif?: string | null): boolean {
    const cifNorm = normalizeCif(cif)
    const ownCif = normalizeCif(OWN_COMPANY.nif)
    if (cifNorm && ownCif && cifNorm === ownCif) return true

    const nameNorm = normalizeCompanyName(nombre)
    if (!nameNorm) return false

    const ownNorm = normalizeCompanyName(OWN_COMPANY.nombre)
    if (ownNorm && (nameNorm.includes(ownNorm) || ownNorm.includes(nameNorm))) {
        return true
    }

    for (const alias of OWN_COMPANY.alias) {
        const aliasNorm = normalizeCompanyName(alias)
        if (aliasNorm && nameNorm.includes(aliasNorm)) return true
    }

    const tokens = ownNameTokens()
    if (tokens.length > 0 && tokens.every(t => nameNorm.includes(t))) return true

    const raw = (nombre || '').toLowerCase()
    if (OWN_COMPANY.dominios.some(d => raw.includes(d))) return true

    return false
}

/** Bloque de texto que se inyecta en los prompts de OCR para orientar a la IA. */
export function ownCompanyPromptBlock(): string {
    return `DATOS DE LA EMPRESA QUE USA ESTE ERP (NOSOTROS):
- Razón social: ${OWN_COMPANY.nombre}
- NIF/CIF: ${OWN_COMPANY.nif}
- Email: ${OWN_COMPANY.email}
En una factura de GASTO nosotros somos SIEMPRE el RECEPTOR (quien paga).
Por tanto, si ves estos datos en el documento pertenecen al receptor/cliente,
NUNCA al emisor/proveedor.`
}

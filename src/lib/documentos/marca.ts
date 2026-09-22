/**
 * Marca de la empresa en los documentos (PDF): logo, datos, color y textos.
 * Archivo sin dependencias de servidor ni de navegador.
 */

export interface MarcaDocumento {
    nombre: string
    nif?: string | null
    direccion?: string | null
    email?: string | null
    telefono?: string | null
    web?: string | null
    /** data:image/png;base64,... o data:image/jpeg;base64,... */
    logoDataUrl?: string | null
    color?: string | null
    pie?: string | null
    textoFactura?: string | null
    iban?: string | null
    mostrarIban?: boolean
}

export const MARCA_POR_DEFECTO: MarcaDocumento = {
    nombre: 'EMPRESA X, S.L.',
    nif: 'B00000000',
    direccion: 'Calle Ejemplo, 1 · 30000 Ciudad Ejemplo (Murcia)',
    email: 'administracion@empresax-demo.com',
    telefono: '600 000 000',
    color: '#1f2937',
}

export function marcaDesdeEmpresa(e: any, logoDataUrl?: string | null): MarcaDocumento {
    if (!e) return { ...MARCA_POR_DEFECTO, logoDataUrl }
    return {
        nombre: e.nombre || MARCA_POR_DEFECTO.nombre,
        nif: e.nif,
        direccion: e.direccion,
        email: e.email,
        telefono: e.telefono,
        web: e.web,
        logoDataUrl,
        color: e.color_documentos || '#1f2937',
        pie: e.pie_documentos,
        textoFactura: e.texto_factura,
        iban: e.iban,
        mostrarIban: e.mostrar_iban_factura !== false,
    }
}

export function hexARgb(hex?: string | null): [number, number, number] {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
    if (!m) return [31, 41, 55]
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mezcla un color con blanco (para fondos suaves de cabeceras). */
export function suavizar([r, g, b]: [number, number, number], factor = 0.88): [number, number, number] {
    return [Math.round(r + (255 - r) * factor), Math.round(g + (255 - g) * factor), Math.round(b + (255 - b) * factor)]
}

export function formatoImagen(dataUrl?: string | null): 'PNG' | 'JPEG' {
    return /^data:image\/jpe?g/i.test(dataUrl || '') ? 'JPEG' : 'PNG'
}

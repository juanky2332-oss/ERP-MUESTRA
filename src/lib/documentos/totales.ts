/**
 * Totales de presupuestos, albaranes y facturas. Única fórmula para la web,
 * El Maikel, Telegram, el servidor y los PDF: cada línea se redondea a
 * céntimos, la base es la suma de líneas y la cuota se redondea una vez.
 * Así base + IVA = total siempre, al céntimo.
 *
 * El IVA 0 % es válido (exento, inversión del sujeto pasivo, intracomunitaria,
 * exportación): solo se usa el 21 % cuando no viene ningún tipo.
 */

export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

export function tipoIva(v: unknown, porDefecto = 21): number {
    if (v === null || v === undefined || v === '') return porDefecto
    const x = Number(v)
    return Number.isFinite(x) && x >= 0 ? x : porDefecto
}

export interface LineaDoc { descripcion?: string; cantidad?: unknown; precio_unitario?: unknown; importe?: unknown; [k: string]: unknown }

export function importeLinea(l: LineaDoc): number {
    return r2((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))
}

export function calcularTotales(lineas: LineaDoc[] | null | undefined, ivaPorcentaje: unknown) {
    const ls = (Array.isArray(lineas) ? lineas : []).map(l => ({ ...l, importe: importeLinea(l) }))
    const base = r2(ls.reduce((a, l) => a + l.importe, 0))
    const ivaPct = tipoIva(ivaPorcentaje)
    const ivaImporte = r2(base * ivaPct / 100)
    return { lineas: ls, subtotal: base, base, ivaPct, ivaImporte, total: r2(base + ivaImporte) }
}

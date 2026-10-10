/**
 * Ranking de artículos del catálogo para una búsqueda en lenguaje natural.
 * Normaliza tildes, mayúsculas y plurales, y admite prefijos («inox» →
 * «inoxidable», «mecan» → «mecanizado»). Devuelve solo los que casan con al
 * menos la mitad de las palabras significativas, mejor puntuados primero.
 */
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'para', 'con', 'en', 'y', 'o', 'a', 'por', 'mm', 'ud', 'uds'])

export function normalizar(s: string): string {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim()
}

function raiz(p: string): string {
    if (p.length > 4 && p.endsWith('es')) return p.slice(0, -2)
    if (p.length > 3 && p.endsWith('s')) return p.slice(0, -1)
    return p
}

export function rankingCatalogo<T extends { nombre?: string | null; referencia?: string | null; descripcion?: string | null; categoria?: string | null }>(items: T[], texto: string): T[] {
    const palabras = normalizar(texto).split(' ').filter(p => p && !VACIAS.has(p) && !/^\d{1,2}$/.test(p)).map(raiz)
    if (!palabras.length) return []
    const puntuados = items.map(it => {
        const ref = normalizar(it.referencia || '')
        const nombre = normalizar(it.nombre || '').split(' ').map(raiz)
        const resto = normalizar(`${it.descripcion || ''} ${it.categoria || ''}`).split(' ').map(raiz)
        let puntos = 0, casadas = 0
        for (const p of palabras) {
            if (ref && (ref === p || ref.replace(/ /g, '').includes(p))) { puntos += 5; casadas++; continue }
            if (nombre.some(w => w === p)) { puntos += 3; casadas++; continue }
            if (nombre.some(w => w.startsWith(p) || (w.length >= 4 && p.startsWith(w)))) { puntos += 2; casadas++; continue }
            if (resto.some(w => w === p || w.startsWith(p))) { puntos += 1; casadas++ }
        }
        return { it, puntos, casadas }
    })
    return puntuados
        .filter(x => x.casadas > 0 && x.casadas >= Math.ceil(palabras.length / 2))
        .sort((a, b) => b.puntos - a.puntos)
        .map(x => x.it)
}

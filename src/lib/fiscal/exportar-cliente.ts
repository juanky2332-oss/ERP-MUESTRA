'use client'

import { zipSync } from 'fflate'

/**
 * Exportación del paquete para el asesor desde el navegador.
 *
 * - Chrome/Edge de escritorio: File System Access API. El usuario elige una
 *   carpeta de su PC una vez; el navegador guarda el permiso (IndexedDB) y la
 *   siguiente vez solo pide «Permitir». Una web nunca puede escribir en una
 *   ruta arbitraria (C:\...) sin que el usuario la elija: es una protección
 *   del navegador, no del ERP.
 * - Resto (Firefox, Safari, móvil): ZIP con la misma estructura.
 */

export interface ManifiestoPaquete {
    raiz: string
    huella: string
    periodo: { clave: string; etiqueta: string }
    archivos: { ruta: string; url?: string; contenido?: string }[]
    emitidas: number
    recibidas: number
    sinDocumento: number
    anomalias: number
}

export interface ResultadoExportacion { raiz: string; huella: string; archivos: number; errores: string[]; destino: 'carpeta' | 'zip'; carpeta?: string }

const DB = 'erp-fiscal', STORE = 'ajustes', CLAVE = 'carpeta'

function idb<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(DB, 1)
        open.onupgradeneeded = () => open.result.createObjectStore(STORE)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
            const tx = open.result.transaction(STORE, modo)
            const req = fn(tx.objectStore(STORE))
            req.onsuccess = () => resolve(req.result as T)
            req.onerror = () => reject(req.error)
            tx.oncomplete = () => open.result.close()
        }
    })
}

export function soportaCarpeta(): boolean {
    if (typeof window === 'undefined') return false
    try { if (window.self !== window.top) return false } catch { return false }
    return 'showDirectoryPicker' in window && window.isSecureContext
}

export async function carpetaGuardada(): Promise<any | null> {
    if (!soportaCarpeta()) return null
    try { return (await idb<any>('readonly', s => s.get(CLAVE))) || null } catch { return null }
}

/** Abre el selector de carpetas del sistema y la recuerda en este navegador. */
export async function elegirCarpeta(): Promise<any | null> {
    try {
        const h = await (window as any).showDirectoryPicker({ id: 'erp-fiscal', mode: 'readwrite', startIn: 'documents' })
        await idb('readwrite', s => s.put(h, CLAVE))
        return h
    } catch (e: any) {
        if (e?.name === 'AbortError') return null
        throw e
    }
}

export async function olvidarCarpeta() {
    try { await idb('readwrite', s => s.delete(CLAVE)) } catch { /* nada */ }
}

/** Comprueba (y si hace falta pide) permiso de escritura. Llamar dentro del clic del usuario. */
async function permisoEscritura(h: any): Promise<boolean> {
    const op = { mode: 'readwrite' }
    if ((await h.queryPermission?.(op)) === 'granted') return true
    return (await h.requestPermission?.(op)) === 'granted'
}

async function descargarUno(url: string): Promise<{ datos: Uint8Array; extension?: string }> {
    let ultimo: any
    for (let intento = 0; intento < 3; intento++) {
        try {
            const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
            if (!res.ok) {
                let msg = `HTTP ${res.status}`
                try { msg = (await res.json()).error || msg } catch { /* no es JSON */ }
                throw new Error(msg)
            }
            return { datos: new Uint8Array(await res.arrayBuffer()), extension: res.headers.get('X-Extension') || undefined }
        } catch (e) {
            ultimo = e
            await new Promise(r => setTimeout(r, 600 * (intento + 1)))
        }
    }
    throw ultimo
}

async function escribirEn(dir: any, ruta: string, datos: Uint8Array) {
    const partes = ruta.split('/')
    let d = dir
    for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true })
    const f = await d.getFileHandle(partes[partes.length - 1], { create: true })
    const w = await f.createWritable()
    await w.write(datos)
    await w.close()
}

async function existe(dir: any, nombre: string) {
    try { await dir.getDirectoryHandle(nombre); return true } catch { return false }
}

/**
 * Genera el paquete del periodo. `carpeta` = handle elegido (null → ZIP).
 * `confirmarReemplazo` se llama si la carpeta del periodo ya existe.
 */
export async function exportarPaquete(periodo: string, opts: {
    carpeta: any | null
    onProgreso?: (hechos: number, total: number, texto: string) => void
    confirmarReemplazo?: (raiz: string) => boolean | Promise<boolean>
}): Promise<ResultadoExportacion | null> {
    const progreso = opts.onProgreso || (() => { })

    // El permiso se pide lo primero: el navegador solo lo permite justo después del clic.
    if (opts.carpeta && !(await permisoEscritura(opts.carpeta))) throw new Error('El navegador no ha dado permiso para escribir en la carpeta elegida.')

    progreso(0, 1, 'Preparando el índice de facturas…')
    const res = await fetch(`/api/fiscal/paquete?periodo=${encodeURIComponent(periodo)}`, { cache: 'no-store' })
    const man: ManifiestoPaquete & { error?: string } = await res.json()
    if (!res.ok) throw new Error(man.error || 'No se pudo preparar el paquete.')

    // Cada documento se descarga una sola vez aunque vaya en dos carpetas.
    const urls = [...new Set(man.archivos.filter(a => a.url).map(a => a.url!))]
    const cache = new Map<string, { datos: Uint8Array; extension?: string }>()
    const errores: string[] = []
    let hechos = 0
    const cola = [...urls]
    const trabajador = async () => {
        while (cola.length) {
            const url = cola.shift()!
            try { cache.set(url, await descargarUno(url)) } catch (e: any) {
                const ruta = man.archivos.find(a => a.url === url)?.ruta || url
                errores.push(`${ruta}: ${e?.message || e}`)
            }
            hechos++
            progreso(hechos, urls.length, `Descargando documentos (${hechos} de ${urls.length})…`)
        }
    }
    await Promise.all(Array.from({ length: Math.min(4, urls.length || 1) }, trabajador))

    const enc = new TextEncoder()
    const salida: { ruta: string; datos: Uint8Array }[] = []
    for (const a of man.archivos) {
        if (a.contenido != null) { salida.push({ ruta: a.ruta, datos: enc.encode('\ufeff' + a.contenido) }); continue }
        const d = cache.get(a.url!)
        if (!d) continue
        const ruta = d.extension && d.extension !== 'pdf' ? a.ruta.replace(/\.pdf$/i, '.' + d.extension) : a.ruta
        salida.push({ ruta, datos: d.datos })
    }
    if (errores.length) {
        salida.push({ ruta: 'ERRORES_DE_DESCARGA.txt', datos: enc.encode('\ufeff' + ['No se pudieron descargar estos documentos. Vuelve a generar el paquete o descárgalos desde el ERP:', '', ...errores].join('\r\n')) })
    }

    if (opts.carpeta) {
        if (await existe(opts.carpeta, man.raiz)) {
            const ok = opts.confirmarReemplazo ? await opts.confirmarReemplazo(man.raiz) : true
            if (!ok) return null
            await opts.carpeta.removeEntry(man.raiz, { recursive: true })
        }
        const raiz = await opts.carpeta.getDirectoryHandle(man.raiz, { create: true })
        let i = 0
        for (const s of salida) {
            await escribirEn(raiz, s.ruta, s.datos)
            progreso(++i, salida.length, `Guardando en la carpeta (${i} de ${salida.length})…`)
        }
        return { raiz: man.raiz, huella: man.huella, archivos: salida.length, errores, destino: 'carpeta', carpeta: opts.carpeta.name }
    }

    progreso(1, 1, 'Comprimiendo el ZIP…')
    const zip = zipSync(Object.fromEntries(salida.map(s => [`${man.raiz}/${s.ruta}`, [s.datos, { level: /\.(pdf|xlsx)$/i.test(s.ruta) ? 0 : 6 }]])) as any)
    const blob = new Blob([zip as BlobPart], { type: 'application/zip' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${man.raiz}.zip`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
    return { raiz: man.raiz, huella: man.huella, archivos: salida.length, errores, destino: 'zip' }
}

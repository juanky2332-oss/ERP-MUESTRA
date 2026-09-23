'use client'

/**
 * Prepara la imagen en el navegador para que suba rápido y sirva en los PDF:
 * la reduce (app 512 px, documentos 1000 px) y, si es una foto sin
 * transparencias (o se pide soloJpeg), la pasa a JPEG (una foto de móvil en PNG pesaría varios MB
 * y el servidor la rechazaría). Los logos con fondo transparente siguen en PNG.
 */
export async function prepararImagen(file: File, ladoMax: number, opciones: { soloJpeg?: boolean } = {}): Promise<{ dataUrl: string; blob: Blob; tipo: 'image/png' | 'image/jpeg' }> {
    const url = URL.createObjectURL(file)
    try {
        const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('No se puede leer la imagen. Prueba con PNG o JPG.')); i.src = url })
        const w0 = img.naturalWidth || ladoMax, h0 = img.naturalHeight || ladoMax
        const escala = Math.min(1, ladoMax / Math.max(w0, h0))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(w0 * escala)); c.height = Math.max(1, Math.round(h0 * escala))
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0, c.width, c.height)
        // ¿Tiene transparencias? (muestreo de píxeles)
        const px = ctx.getImageData(0, 0, c.width, c.height).data
        const paso = Math.max(4, Math.floor(px.length / 4 / 20000) * 4)
        let transparente = false
        for (let i = 3; i < px.length; i += paso) if (px[i] < 250) { transparente = true; break }
        const aBlob = (tipo: string, q?: number) => new Promise<Blob>((ok, ko) => c.toBlob(b => b ? ok(b) : ko(new Error('No se pudo procesar la imagen')), tipo, q))
        let tipo: 'image/png' | 'image/jpeg' = 'image/png'
        let blob = await aBlob('image/png')
        if (opciones.soloJpeg || (!transparente && blob.size > 250 * 1024)) {
            // Foto: JPEG sobre fondo blanco, bajando calidad hasta que pese poco
            const f = document.createElement('canvas'); f.width = c.width; f.height = c.height
            const fx = f.getContext('2d')!; fx.fillStyle = '#fff'; fx.fillRect(0, 0, f.width, f.height); fx.drawImage(c, 0, 0)
            for (const q of [0.9, 0.8, 0.7, 0.6]) {
                blob = await new Promise<Blob>((ok, ko) => f.toBlob(b => b ? ok(b) : ko(new Error('No se pudo procesar la imagen')), 'image/jpeg', q))
                if (blob.size <= 600 * 1024) break
            }
            tipo = 'image/jpeg'
        }
        const dataUrl = await new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob) })
        return { dataUrl, blob, tipo }
    } finally {
        URL.revokeObjectURL(url)
    }
}

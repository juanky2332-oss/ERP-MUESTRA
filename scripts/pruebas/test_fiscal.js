// Prueba completa de la sección Fiscal: calendario y avisos, paquete para el
// asesor (carpeta local + ZIP), PDF resumen, Excel de libros registro, fotos
// de gastos convertidas a PDF, «ya entregado», configuración, móvil y el aviso
// por Telegram (contra un Telegram SIMULADO en el puerto 3200).
//
// App arrancada así (igual que test:telegram):
//   TELEGRAM_API_BASE=http://localhost:3200 TELEGRAM_BOT_TOKEN=TEST TELEGRAM_WEBHOOK_SECRET=secret-test CRON_SECRET=cron-test npx next start -p 3100
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL en .env.local') })()
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), http = require('http')
const puppeteer = require('puppeteer-core')
const { PDFDocument, StandardFonts } = require('pdf-lib')
const ExcelJS = require('exceljs')
const { unzipSync } = require('fflate')
const { createClient } = require('@supabase/supabase-js')
const cookieDe = require('./cookie')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APP = process.env.BASE || 'http://localhost:3100'
const LOCAL = /localhost|127\.0\.0\.1/.test(APP)
const SHOTS = path.join(__dirname, 'capturas')
fs.mkdirSync(SHOTS, { recursive: true })

let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 220).replace(/\n/g, ' ⏎ ') : ''}`) }
const esperar = ms => new Promise(r => setTimeout(r, ms))
const txt = page => page.evaluate(() => document.body.innerText)
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())

/** PNG RGB de verdad (sin librerías) para simular la foto de un ticket. */
function png(w, h) {
    const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
    const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
    const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
    const raw = Buffer.alloc((w * 3 + 1) * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = 240; raw[i + 1] = (y * 3) & 255; raw[i + 2] = (x * 2) & 255 }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
async function pdfFactura(texto) {
    const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica)
    d.addPage([595, 842]).drawText(texto, { x: 50, y: 780, size: 14, font: f })
    return Buffer.from(await d.save())
}

// ───────── Telegram simulado ─────────
const salidaTg = []
const mockTg = http.createServer((req, res) => {
    let body = []
    req.on('data', c => body.push(c))
    req.on('end', () => {
        let json = {}
        try { json = JSON.parse(Buffer.concat(body).toString() || '{}') } catch { /* multipart */ }
        salidaTg.push({ metodo: req.url.match(/\/bot[^/]+\/(\w+)/)?.[1], ...json })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, result: { message_id: 5000 + salidaTg.length } }))
    })
})

;(async () => {
    const { data: perfil } = await admin.from('perfiles').select('empresa_id, user_id').eq('email', EMAIL_PRUEBA).single()
    const E = perfil.empresa_id
    const { data: emp0 } = await admin.from('empresas').select('fiscal, nombre').eq('id', E).single()
    const inicio = new Date().toISOString()
    const creados = { gastos: [], archivos: [] }
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
    const descargas = fs.mkdtempSync(path.join(os.tmpdir(), 'fiscal-zip-'))
    try {
        await admin.from('empresas').update({ fiscal: { regimen: 'sociedad', modelos: {}, dias_aviso: 30, dias_margen_asesor: 10 } }).eq('id', E)

        // ── Datos de prueba: dos facturas recibidas del 3T, una foto PNG y un PDF
        const subir = async (nombre, buf, tipo) => {
            const ruta = `${E}/prueba-fiscal/${Date.now()}-${nombre}`
            const { error } = await admin.storage.from('gastos').upload(ruta, buf, { contentType: tipo })
            if (error) throw error
            creados.archivos.push(ruta)
            return `/api/archivos/gastos/${ruta.split('/').map(encodeURIComponent).join('/')}`
        }
        const urlPng = await subir('ticket.png', png(300, 420), 'image/png')
        const urlPdf = await subir('alquiler.pdf', await pdfFactura('FACTURA ALQ-07 ALQUILERES PRUEBA'), 'application/pdf')
        const { data: g1, error: eg1 } = await admin.from('gastos').insert({ empresa_id: E, numero: 'G-98-2026 / PF-001', fecha: '2026-08-14', proveedor: 'PROVEEDOR PRUEBA FISCAL, S.L.', proveedor_cif: 'B12345678', concepto: 'PRUEBA FISCAL (borrar)', categoria: 'Material', base_imponible: 100, iva_porcentaje: 21, iva_importe: 21, total: 121, archivo_url: urlPng, factura_url: urlPng, revisado: true, origen: 'app' }).select().single()
        const { data: g2, error: eg2 } = await admin.from('gastos').insert({ empresa_id: E, numero: 'G-99-2026 / ALQ-07', fecha: '2026-07-20', proveedor: 'ALQUILERES PRUEBA, S.L.', proveedor_cif: 'B87654321', concepto: 'PRUEBA FISCAL (borrar) alquiler nave julio', categoria: 'Alquiler', base_imponible: 500, iva_porcentaje: 21, iva_importe: 105, retencion_porcentaje: 19, retencion_importe: 95, total: 510, archivo_url: urlPdf, factura_url: urlPdf, revisado: true, origen: 'app' }).select().single()
        if (eg1 || eg2) throw eg1 || eg2
        creados.gastos.push(g1.id, g2.id)

        const cookie = await cookieDe(EMAIL_PRUEBA)
        const api = (u, o = {}) => fetch(APP + u, { ...o, headers: { cookie, ...(o.headers || {}) }, redirect: 'manual' })

        // ── API
        const sin = await fetch(APP + '/api/fiscal/paquete?periodo=2026-3T', { redirect: 'manual' })
        check('Paquete sin sesión rechazado (redirige al login o error)', sin.status >= 300 && !(sin.headers.get('content-type') || '').includes('json'), sin.status)
        check('Periodo no válido rechazado', (await api('/api/fiscal/paquete?periodo=2026-9T')).status === 400)
        const man = await (await api('/api/fiscal/paquete?periodo=2026-3T')).json()
        const rutas = man.archivos.map(a => a.ruta)
        check('Índice del 3T: carpeta raíz con empresa y periodo', man.raiz === `${emp0.nombre} - Facturas 2026-3T (julio a septiembre)`.replace(/[<>:"/\\|?*]+/g, '-'), man.raiz)
        const { count: nFac } = await admin.from('facturas').select('id', { count: 'exact', head: true }).eq('empresa_id', E).gte('fecha', '2026-07-01').lte('fecha', '2026-09-30')
        check('Todas las facturas emitidas del trimestre, por fecha y por cliente', rutas.filter(r => r.startsWith('01_FACTURAS_EMITIDAS/')).length === nFac && rutas.filter(r => r.startsWith('03_POR_CLIENTE/')).length === nFac, `${nFac} facturas`)
        check('Recibidas numeradas por fecha: el alquiler (20/07) antes que la foto (14/08)', rutas.some(r => /^02_FACTURAS_RECIBIDAS\/\d{3}_2026-07-20_ALQUILERES PRUEBA, S\.L\._ALQ-07\.pdf$/.test(r)) && rutas.some(r => /^02_FACTURAS_RECIBIDAS\/\d{3}_2026-08-14_PROVEEDOR PRUEBA FISCAL, S\.L\._PF-001\.pdf$/.test(r)), rutas.filter(r => r.startsWith('02_')).join(' | '))
        check('Carpeta por proveedor con NIF', rutas.some(r => r.startsWith('04_POR_PROVEEDOR/ALQUILERES PRUEBA, S.L. (B87654321)/')))
        check('Resumen PDF, Excel y LEEME en la raíz', rutas.includes('00_RESUMEN_2026-3T.pdf') && rutas.includes('00_LIBROS_REGISTRO_2026-3T.xlsx') && rutas.includes('LEEME.txt'))
        check('Gasto sin documento: va en libros pero no como archivo', man.sinDocumento >= 1 && man.recibidas === rutas.filter(r => r.startsWith('02_')).length + man.sinDocumento, `${man.recibidas} recibidas, ${man.sinDocumento} sin doc`)

        const rPdf = await api('/api/fiscal/resumen?periodo=2026-3T')
        const bufPdf = Buffer.from(await rPdf.arrayBuffer())
        const docResumen = await PDFDocument.load(bufPdf)
        check('PDF resumen válido y con varias páginas', rPdf.ok && bufPdf.subarray(0, 5).toString() === '%PDF-' && docResumen.getPageCount() >= 3, `${docResumen.getPageCount()} páginas`)
        const { PDFParse } = require('pdf-parse')
        const textoPdf = (await new PDFParse({ data: bufPdf }).getText()).text
        check('PDF resumen: libros registro, IVA por tipo, por cliente/proveedor, avisos y huella', ['Libro registro de facturas EMITIDAS', 'Libro registro de facturas RECIBIDAS', 'IVA por tipo impositivo', 'Totales por cliente', 'Totales por proveedor', 'Avisos a revisar', 'FAC-01-2026', 'ALQUILERES PRUEBA', man.huella.slice(0, 16)].every(s => textoPdf.includes(s)), textoPdf.slice(0, 120))
        check('PDF resumen: retenciones del alquiler en el 115', /IRPF \(115\)/.test(textoPdf) && /95,00/.test(textoPdf))

        const rX = await api('/api/fiscal/libros?periodo=2026-3T')
        const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await rX.arrayBuffer()))
        const hojas = wb.worksheets.map(w => w.name)
        check('Excel con sus hojas', ['Resumen', 'Emitidas', 'Recibidas', 'IVA por tipo', 'Por cliente', 'Por proveedor', 'Avisos'].every(h => hojas.includes(h)), hojas.join(', '))
        const em = wb.getWorksheet('Emitidas')
        const filasEm = []; em.eachRow((r, i) => { if (i > 1 && typeof r.getCell(1).value === 'number') filasEm.push(r) })
        const { data: facs } = await admin.from('facturas').select('base_imponible, anulada').eq('empresa_id', E).gte('fecha', '2026-07-01').lte('fecha', '2026-09-30')
        const baseBD = Math.round(facs.filter(f => !f.anulada).reduce((a, f) => a + Number(f.base_imponible), 0) * 100) / 100
        const baseX = Math.round(filasEm.reduce((a, r) => a + (r.getCell(7).value || 0), 0) * 100) / 100
        check('Excel: importes numéricos y cuadran con la base de datos', filasEm.length === nFac && typeof filasEm[0].getCell(7).value === 'number' && filasEm[0].getCell(4).value instanceof Date && baseX === baseBD, `${baseX} vs ${baseBD}`)
        const rec = wb.getWorksheet('Recibidas'); let filaAlq = null
        rec.eachRow(r => { if (r.getCell(3).value === 'ALQ-07') filaAlq = r })
        check('Excel: recibida con nº del proveedor, retención y modelo 115', filaAlq && filaAlq.getCell(13).value === 95 && filaAlq.getCell(14).value === '115')

        const rPng = await api(`/api/fiscal/recibida/${g1.id}`)
        const bPng = Buffer.from(await rPng.arrayBuffer())
        check('Foto PNG del gasto convertida a PDF', rPng.ok && bPng.subarray(0, 5).toString() === '%PDF-' && (await PDFDocument.load(bPng)).getPageCount() === 1)
        const rP = await api(`/api/fiscal/recibida/${g2.id}`)
        check('PDF original del gasto sin tocar', rP.ok && Buffer.from(await rP.arrayBuffer()).subarray(0, 5).toString() === '%PDF-')

        // ── Navegador
        const host = new URL(APP).hostname
        await browser.setCookie(...cookie.split('; ').map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: host, path: '/' } }))
        const page = await browser.newPage()
        const errores = []
        page.on('pageerror', e => errores.push(e.message))
        page.on('dialog', d => d.accept())
        if (process.env.DEBUG_FISCAL) { page.on('console', m => console.log('   [consola]', m.text())); page.on('request', r => r.method() === 'POST' && console.log('   [POST]', r.url(), r.headers()['next-action'] ? 'server action' : '')); page.on('response', r => r.request().method() === 'POST' && console.log('   [resp]', r.status(), r.url())) }
        // La «carpeta del PC» se simula con el almacenamiento privado de Chrome (mismo API, sin diálogo del sistema)
        await page.evaluateOnNewDocument(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory() })
        await page.setViewport({ width: 1440, height: 1000 })

        await page.goto(APP + '/', { waitUntil: 'networkidle2' }); await esperar(800)
        let t = await txt(page)
        const avisoHoy = hoyMadrid() >= '2026-09-20' && hoyMadrid() <= '2026-10-20'
        if (avisoHoy) check('Inicio: aviso de impuestos (menos de un mes)', /Impuestos: (quedan \d+ días|queda 1 día|hoy acaba)/.test(t) && /Preparar facturas/i.test(t), t.match(/Impuestos:[^\n]+/)?.[0])

        await page.goto(APP + '/fiscal', { waitUntil: 'networkidle2' }); await esperar(800)
        t = await txt(page)
        check('Sección Fiscal en el menú', await page.evaluate(() => [...document.querySelectorAll('nav a')].some(a => a.innerText.trim() === 'Fiscal y asesor')))
        check('Pantalla Fiscal: periodo, KPIs, calendario y configuración', /Fiscal y asesor/.test(t) && /Próximos plazos/.test(t) && /Configuración fiscal/.test(t) && /Paquete para el asesor/.test(t))
        check('Calendario: 303 del 3T hasta el 20/10/2026', /Modelo 303[\s\S]{0,200}20\/10\/2026/.test(t))
        check('Periodo por defecto: el del aviso (3T 2026)', await page.$eval('select', s => s.value) === '2026-3T')
        check('Revisión: avisa del gasto sin factura original', /no tiene la factura original adjunta/.test(t))
        await page.screenshot({ path: path.join(SHOTS, 'fiscal_escritorio.png'), fullPage: true })

        // Descargar en la carpeta
        const btnCarpeta = await page.$$('button').then(async bs => { for (const b of bs) if ((await b.evaluate(e => e.innerText)).includes('Descargar en mi carpeta')) return b })
        check('Botón «Descargar en mi carpeta» (Chrome/Edge)', !!btnCarpeta)
        await btnCarpeta.evaluate(b => b.click())
        await page.waitForFunction(() => /archivos guardados en/.test(document.body.innerText), { timeout: 90000 })
        const arbol = await page.evaluate(async () => {
            const out = []
            const recorrer = async (d, pre) => { for await (const [n, h] of d.entries()) { if (h.kind === 'directory') await recorrer(h, pre + n + '/'); else { const f = await h.getFile(); out.push({ ruta: pre + n, tam: f.size, cab: new TextDecoder().decode(new Uint8Array(await f.slice(0, 5).arrayBuffer())) }) } } }
            await recorrer(await navigator.storage.getDirectory(), '')
            return out
        })
        const enCarpeta = arbol.filter(a => a.ruta.startsWith(man.raiz + '/'))
        check('Carpeta creada con todos los archivos del índice', enCarpeta.length === man.archivos.length, `${enCarpeta.length}/${man.archivos.length}`)
        check('Todos los PDF de la carpeta son PDF válidos', enCarpeta.filter(a => a.ruta.endsWith('.pdf')).every(a => a.cab === '%PDF-' && a.tam > 500))
        check('Excel guardado (xlsx = zip)', enCarpeta.some(a => a.ruta.endsWith('.xlsx') && a.cab.startsWith('PK')))
        // Segunda vez: reemplaza (confirmación aceptada) sin duplicar
        if (process.env.DEBUG_FISCAL) console.log('   [segundo clic]', await btnCarpeta.evaluate(b => b.isConnected + ' ' + b.disabled + ' ' + b.innerText))
        await btnCarpeta.evaluate(b => b.click())
        await page.waitForFunction(() => !/archivos guardados en/.test(document.body.innerText), { timeout: 10000 }).catch(() => { })
        await page.waitForFunction(() => /archivos guardados en/.test(document.body.innerText), { timeout: 90000 })
        await esperar(1500)
        const n2 = await page.evaluate(async (raiz) => { let n = 0; const r = async d => { for await (const [, h] of d.entries()) h.kind === 'directory' ? await r(h) : n++ }; await r(await (await navigator.storage.getDirectory()).getDirectoryHandle(raiz)); return n }, man.raiz)
        if (process.env.DEBUG_FISCAL) console.log('   [toasts]', await page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map(x => x.innerText).join(' || ')))
        check('Volver a exportar reemplaza la carpeta sin duplicar archivos', n2 === man.archivos.length, n2)

        // ZIP
        const cdp = await page.createCDPSession()
        await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: descargas })
        const btnZip = await page.$$('button').then(async bs => { for (const b of bs) if ((await b.evaluate(e => e.innerText)).includes('Descargar ZIP')) return b })
        await btnZip.evaluate(b => b.click())
        let zipPath = null
        for (let i = 0; i < 120 && !zipPath; i++) { await esperar(500); zipPath = fs.readdirSync(descargas).filter(f => f.endsWith('.zip')).map(f => path.join(descargas, f))[0] || null }
        const zip = zipPath ? unzipSync(fs.readFileSync(zipPath)) : {}
        const entradas = Object.keys(zip)
        check('ZIP descargado con la misma estructura', entradas.length === man.archivos.length && entradas.every(e => e.startsWith(man.raiz + '/')), `${entradas.length} entradas`)
        const leeme = zip[`${man.raiz}/LEEME.txt`] ? new TextDecoder().decode(zip[`${man.raiz}/LEEME.txt`]) : ''
        check('LEEME lista las recibidas sin documento', /SIN DOCUMENTO ORIGINAL/.test(leeme))

        let exps = []
        for (let i = 0; i < 30 && exps.length < 3; i++) { await esperar(500); exps = (await admin.from('fiscal_exportaciones').select('destino, num_archivos, totales').eq('empresa_id', E).gte('created_at', inicio)).data || [] }
        check('Cada exportación queda registrada (2 carpeta + 1 ZIP) con huella', exps.length === 3 && exps.filter(x => x.destino === 'carpeta').length === 2 && exps.every(x => x.totales?.huella === man.huella), JSON.stringify(exps.map(x => x.destino)))
        await page.reload({ waitUntil: 'networkidle2' }); await esperar(500)
        check('Historial visible en pantalla', /📦 2026-3T/.test(await txt(page)))

        // Ya entregado al asesor → desaparece el aviso; Deshacer → vuelve
        if (avisoHoy) {
            const entregar = await page.$$('button').then(async bs => { for (const b of bs) if ((await b.evaluate(e => e.innerText)).includes('Ya entregado al asesor')) return b })
            await entregar.click()
            await page.waitForFunction(() => !/Impuestos: (quedan|queda|hoy)/.test(document.body.innerText), { timeout: 15000 }).catch(() => { })
            t = await txt(page)
            check('«Ya entregado» apaga el aviso', !/Impuestos: (quedan|queda|hoy)/.test(t) && /entregado el/.test(t))
            await page.goto(APP + '/', { waitUntil: 'networkidle2' })
            check('…también en el Inicio', !/Impuestos: (quedan|queda|hoy)/.test(await txt(page)))
            await page.goto(APP + '/fiscal', { waitUntil: 'networkidle2' })
            const deshacer = await page.$$('button').then(async bs => { for (const b of bs) if ((await b.evaluate(e => e.innerText)).includes('Deshacer')) return b })
            await deshacer.click()
            await page.waitForFunction(() => /Impuestos: (quedan|queda|hoy)/.test(document.body.innerText), { timeout: 15000 }).catch(() => { })
            check('«Deshacer» reactiva el aviso', /Impuestos: (quedan|queda|hoy)/.test(await txt(page)))
        }

        // Configuración: autónomo → 130; luego S.L. otra vez
        const boton = async texto => page.$$('button').then(async bs => { for (const b of bs) if ((await b.evaluate(e => e.innerText)).includes(texto)) return b })
        await (await boton('Autónomo')).click(); await esperar(300)
        await (await boton('Guardar configuración')).click()
        await page.waitForFunction(() => /Modelo 130 orientativo/.test(document.body.innerText), { timeout: 15000 }).catch(() => { })
        t = await txt(page)
        check('Régimen autónomo: aparece el modelo 130 y desaparece el 202', /Modelo 130 orientativo/.test(t) && !/Modelo 202/.test(t), (t.match(/.*Modelo 202.*/) || [''])[0])
        const { data: empA } = await admin.from('empresas').select('fiscal').eq('id', E).single()
        check('Configuración guardada en la empresa', empA.fiscal?.regimen === 'autonomo')
        await (await boton('Sociedad')).click(); await esperar(300)
        await (await boton('Guardar configuración')).click(); await esperar(2000)

        // Móvil
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
        await page.goto(APP + '/fiscal', { waitUntil: 'networkidle2' }); await esperar(600)
        const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        check('Móvil: sin scroll horizontal', desborde <= 1, `${desborde}px`)
        await page.screenshot({ path: path.join(SHOTS, 'fiscal_movil.png'), fullPage: true })
        check('Sin errores de JavaScript en el navegador', errores.length === 0, errores.join(' | '))

        // ── Telegram (solo contra la app local con Telegram simulado)
        if (LOCAL && process.env.SKIP_TELEGRAM !== '1') {
            await new Promise(r => mockTg.listen(3200, r))
            const { data: link } = await admin.from('telegram_links').select('id, chat_id, notificaciones').eq('user_id', perfil.user_id).eq('linked', true).maybeSingle()
            if (!link) { check('Telegram: hay un chat vinculado para probar', false); throw new Error('sin chat') }
            // Hoy no es día de recordatorio: se fuerza que el aviso empiece justo hoy
            const dias = Math.round((Date.parse('2026-10-20') - Date.parse(hoyMadrid())) / 86400000)
            await admin.from('empresas').update({ fiscal: { regimen: 'sociedad', modelos: {}, dias_aviso: Math.max(1, dias), dias_margen_asesor: 10 } }).eq('id', E)
            const cr = await (await fetch(`${APP}/api/cron/diario`, { headers: { Authorization: 'Bearer cron-test' } })).json()
            const msg = salidaTg.find(s => String(s.chat_id) === String(link.chat_id) && /Impuestos/.test(s.text || ''))
            check('Cron: aviso fiscal por Telegram aunque los avisos diarios estén apagados', cr.ok && !!msg, msg?.text || JSON.stringify(cr))
            const botones = msg?.reply_markup?.inline_keyboard?.flat() || []
            const cbEnt = botones.find(b => (b.callback_data || '').startsWith('fse:'))
            check('Aviso con botones «Preparar facturas» y «Ya entregado»', botones.some(b => /\/fiscal\?periodo=2026-3T/.test(b.url || '')) && !!cbEnt, JSON.stringify(botones))
            const r = await fetch(`${APP}/api/telegram/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'secret-test' }, body: JSON.stringify({ update_id: Date.now(), callback_query: { id: 'cbf1', from: { id: Number(link.chat_id), first_name: 'Prueba' }, message: { message_id: 5001, chat: { id: Number(link.chat_id) }, text: msg?.text || '' }, data: cbEnt?.callback_data } }) })
            await esperar(2500)
            const { data: ent } = await admin.from('fiscal_entregas').select('clave').eq('empresa_id', E).eq('clave', '2026-3T|2026-10').maybeSingle()
            check('Pulsar «Ya entregado» en Telegram lo registra', r.ok && !!ent)
            const antes = salidaTg.length
            await fetch(`${APP}/api/cron/diario`, { headers: { Authorization: 'Bearer cron-test' } })
            check('Una vez entregado, el cron ya no avisa de ese periodo', !salidaTg.slice(antes).some(s => /Impuestos/.test(s.text || '')))
            await admin.from('fiscal_entregas').delete().eq('empresa_id', E).eq('clave', '2026-3T|2026-10')
        }
    } catch (e) {
        console.error('ERROR EN TEST', e); fail++
    } finally {
        if (creados.gastos.length) await admin.from('gastos').delete().in('id', creados.gastos)
        if (creados.archivos.length) await admin.storage.from('gastos').remove(creados.archivos)
        await admin.from('fiscal_exportaciones').delete().eq('empresa_id', E).gte('created_at', inicio)
        await admin.from('fiscal_entregas').delete().eq('empresa_id', E).gte('entregado_at', inicio)
        await admin.from('empresas').update({ fiscal: emp0.fiscal }).eq('id', E)
        fs.rmSync(descargas, { recursive: true, force: true })
        await browser.close()
        mockTg.close()
        console.log(`\n${ok} OK · ${fail} fallos`)
        process.exit(fail ? 1 : 0)
    }
})()

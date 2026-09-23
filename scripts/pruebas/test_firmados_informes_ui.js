// Prueba en navegador: albaranes y partes firmados (subida con IA, unión a albarán
// y factura, sello en PDF, expediente), informes con filtros y módulos opcionales.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL en .env.local') })()
const fs = require('fs'), path = require('path'), os = require('os')
const puppeteer = require('puppeteer-core')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const { createClient } = require('@supabase/supabase-js')
const cookieDe = require('./cookie')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APP = process.env.BASE || 'http://localhost:3100'
const SHOTS = path.join(__dirname, 'capturas')
fs.mkdirSync(SHOTS, { recursive: true })

let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 200).replace(/\n/g, ' ⏎ ') : ''}`) }
const esperar = ms => new Promise(r => setTimeout(r, ms))
const txt = page => page.evaluate(() => document.body.innerText)

async function parteFirmadoPdf(cliente) {
    const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica), b = await d.embedFont(StandardFonts.HelveticaBold)
    const p = d.addPage([595, 842])
    p.drawText('PARTE DE TRABAJO N. 145', { x: 50, y: 790, size: 16, font: b })
    p.drawText(`Cliente: ${cliente}     Fecha: 21/09/2026`, { x: 50, y: 755, size: 12, font: f })
    p.drawText('Trabajo realizado: reparacion de eje y cambio de rodamientos en torno CNC', { x: 50, y: 720, size: 11, font: f })
    p.drawText('Horas: 3,5     Tecnico: Antonio', { x: 50, y: 700, size: 11, font: f })
    p.drawText('Conforme cliente: Maria Garcia', { x: 50, y: 520, size: 11, font: f })
    for (let i = 0; i < 7; i++) p.drawLine({ start: { x: 60 + i * 15, y: 490 + (i % 2) * 12 }, end: { x: 75 + i * 15, y: 502 - (i % 2) * 12 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.5) })
    return Buffer.from(await d.save())
}

;(async () => {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
    const { data: perfil } = await admin.from('perfiles').select('empresa_id').eq('email', EMAIL_PRUEBA).single()
    const { data: cli } = await admin.from('contactos').select('*').eq('empresa_id', perfil.empresa_id).limit(1).single()
    const { data: emp0 } = await admin.from('empresas').select('modulos').eq('id', perfil.empresa_id).single()
    const inicio = new Date().toISOString()
    const L = { fac: null, alb: null }
    try {
        // Factura de prueba (parte de trabajo = servicio facturado sin albarán)
        const { data: fac } = await admin.from('facturas').insert({ empresa_id: perfil.empresa_id, numero: 'FAC-96-2026', fecha: '2026-09-21', fecha_vencimiento: '2026-10-21', cliente_id: cli.id, cliente_razon_social: cli.razon_social, lineas: [{ descripcion: 'Reparación eje torno CNC (3,5 h)', cantidad: 1, precio_unitario: 210 }], subtotal: 210, base_imponible: 210, iva_porcentaje: 21, iva_importe: 44.1, total: 254.1, statuses: ['pendiente'], estado_cobro: 'pendiente', importe_cobrado: 0 }).select().single()
        L.fac = fac
        const { data: alb } = await admin.from('albaranes').insert({ empresa_id: perfil.empresa_id, numero: 'ALB-96-2026', fecha: '2026-09-20', cliente_id: cli.id, cliente_razon_social: cli.razon_social, lineas: [{ descripcion: 'Material', cantidad: 1, precio_unitario: 50 }], subtotal: 50, base_imponible: 50, iva_porcentaje: 21, iva_importe: 10.5, total: 60.5, statuses: ['pendiente'] }).select().single()
        L.alb = alb
        const parte = path.join(os.tmpdir(), 'parte-145.pdf')
        fs.writeFileSync(parte, await parteFirmadoPdf(cli.razon_social))

        const cookie = await cookieDe(EMAIL_PRUEBA)
        const host = new URL(APP).hostname
        await browser.setCookie(...cookie.split('; ').map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: host, path: '/' } }))
        const page = await browser.newPage()
        await page.setViewport({ width: 1440, height: 1000 })
        const errores = []
        page.on('pageerror', e => errores.push(e.message))

        // ── Albaranes y partes firmados
        await page.goto(APP + '/albaranes-firmados', { waitUntil: 'networkidle2' }); await esperar(1500)
        let t = await txt(page)
        check('Pantalla «Albaranes y partes firmados» con control de firmas', /Albaranes y partes firmados/.test(t) && /Albaranes sin firma/.test(t) && /Facturas sin soporte firmado/.test(t))
        check('Menú renombrado', await page.evaluate(() => [...document.querySelectorAll('nav a')].some(a => a.innerText.trim() === 'Albaranes y partes firmados')))
        const input = (await page.$$('input[type="file"][multiple]'))[0]
        await input.uploadFile(parte)
        await page.waitForFunction(() => /¿A qué documento lo unes\?/.test(document.body.innerText), { timeout: 90000 })
        await esperar(500)
        t = await txt(page)
        check('La IA lee el parte: tipo, firmante y horas', /Parte de trabajo/.test(t) && await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] input')].some(i => /Mar[ií]a Garc[ií]a/i.test(i.value))), t.slice(0, 200))
        check('Sugiere la factura FAC-96-2026', /Factura FAC-96-2026/.test(t))
        await page.screenshot({ path: `${SHOTS}/f1-asistente-firmado.png` })
        await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => /Factura FAC-96-2026/.test(b.innerText))?.click())
        await esperar(300)
        await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => /Guardar y unir/.test(b.innerText))?.click())
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 30000 }).catch(() => { })
        await esperar(1500)
        const { data: reg } = await admin.from('albaranes_firmados').select('*').eq('factura_id', fac.id).maybeSingle()
        check('Guardado y unido a la factura', !!reg && reg.tipo === 'parte_trabajo' && Number(reg.horas) === 3.5, JSON.stringify({ tipo: reg?.tipo, horas: reg?.horas, firmante: reg?.firmante_nombre }))
        const { data: facF } = await admin.from('facturas').select('soportes_firmados').eq('id', fac.id).single()
        check('Factura con soporte firmado', /firmado/.test(facF.soportes_firmados || ''), facF.soportes_firmados)
        t = await txt(page)
        check('Aparece en el listado unido a la factura', /Parte de trabajo/.test(t) && /Factura FAC-96-2026/.test(t))
        await page.screenshot({ path: `${SHOTS}/f2-listado-firmados.png` })

        // Cambiar la unión: al albarán
        await page.evaluate(() => document.querySelector('button[title^="Cambiar a qué documento"]')?.click())
        await page.waitForFunction(() => /¿A qué documento lo unes\?/.test(document.body.innerText), { timeout: 20000 })
        await page.waitForSelector('[role="dialog"] input[placeholder^="Buscar otro"]', { timeout: 30000 })
        await page.type('[role="dialog"] input[placeholder^="Buscar otro"]', 'ALB-96')
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some(b => /Albarán ALB-96-2026/.test(b.innerText)), { timeout: 15000 })
        await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => /Albarán ALB-96-2026/.test(b.innerText))?.click())
        await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Unir')?.click())
        await esperar(2500)
        const { data: reg2 } = await admin.from('albaranes_firmados').select('albaran_id, factura_id').eq('id', reg.id).single()
        const { data: albF } = await admin.from('albaranes').select('firmado_at, firmado_por').eq('id', alb.id).single()
        const { data: facF2 } = await admin.from('facturas').select('soportes_firmados').eq('id', fac.id).single()
        check('Re-unido al albarán: albarán firmado y la factura ya no lo lleva', reg2.albaran_id === alb.id && !reg2.factura_id && !!albF.firmado_at && !facF2.soportes_firmados, JSON.stringify({ reg2, albF, s: facF2.soportes_firmados }))

        // Listados: sello e icono
        await page.goto(APP + '/albaranes?q=ALB-96-2026', { waitUntil: 'networkidle2' })
        check('Albaranes: etiqueta FIRMADO', await page.waitForFunction(() => /ALB-96-2026[\s\S]*FIRMADO/.test(document.body.innerText), { timeout: 15000 }).then(() => true, () => false))
        await page.goto(APP + '/facturas?q=FAC-96-2026', { waitUntil: 'networkidle2' }); await esperar(1500)
        check('Facturas: botón de expediente', await page.evaluate(id => !!document.querySelector(`a[href="/api/expediente/${id}"]`), fac.id))

        // PDF servidor + expediente
        const cab = { headers: { cookie } }
        let r = await fetch(`${APP}/api/pdf/albaran/${alb.id}`, cab)
        check('PDF de albarán generado en servidor', r.ok && /pdf/.test(r.headers.get('content-type') || ''))
        await admin.from('albaranes_firmados').update({ factura_id: fac.id }).eq('id', reg.id)
        await admin.from('facturas').update({ albaran_ids: [alb.id] }).eq('id', fac.id)
        r = await fetch(`${APP}/api/expediente/${fac.id}`, cab)
        const buf = Buffer.from(await r.arrayBuffer())
        const pags = r.ok ? (await PDFDocument.load(buf)).getPageCount() : 0
        check('Expediente: índice + factura + albarán + parte firmado', r.ok && pags >= 4, `${pags} páginas · ${(buf.length / 1024).toFixed(0)} KB`)
        r = await fetch(`${APP}/api/expediente/${fac.id}`)
        check('Expediente sin sesión: bloqueado', !r.ok || !/pdf/.test(r.headers.get('content-type') || ''), r.status)

        // ── Informes
        for (const [q, esperado] of [['', 'Últimos 12 meses'], ['?preset=este_mes', 'Septiembre 2026'], ['?preset=mes&mes=2026-03', 'Marzo 2026'], ['?preset=trimestre', '3º trimestre 2026'], ['?preset=ano_anterior', 'Año 2025'], ['?preset=personalizado&desde=2026-09-01&hasta=2026-09-15', 'Del 01/09/2026 al 15/09/2026']]) {
            await page.goto(APP + '/informes' + q, { waitUntil: 'networkidle2' })
            check(`Informes ${q || '(por defecto)'} → ${esperado}`, (await txt(page)).includes(esperado))
        }
        for (const v of ['ventas', 'cobros', 'gastos', 'iva', 'presupuestos', 'albaranes']) {
            await page.goto(APP + `/informes?preset=este_ano&vista=${v}`, { waitUntil: 'networkidle2' })
            const tv = await txt(page)
            check(`Informes · pestaña ${v}`, !/Application error|Unhandled/.test(tv) && tv.length > 300)
        }
        await page.goto(APP + `/informes?preset=este_ano&cliente=${cli.id}`, { waitUntil: 'networkidle2' })
        check('Informe filtrado por cliente', (await txt(page)).includes(cli.razon_social))
        await page.goto(APP + '/informes?preset=este_ano&vista=cobros', { waitUntil: 'networkidle2' })
        check('Informe de cobros: deuda por antigüedad y exportar a Excel', /Más de 90 días/.test(await txt(page)) && await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Excel/.test(b.innerText))))
        await page.screenshot({ path: `${SHOTS}/f3-informes-cobros.png`, fullPage: true })
        await page.goto(APP + '/informes?preset=este_ano', { waitUntil: 'networkidle2' })
        await page.screenshot({ path: `${SHOTS}/f4-informes-resumen.png`, fullPage: true })
        await page.select('select', '2026-08')
        await page.waitForFunction(() => /Agosto 2026/.test(document.body.innerText), { timeout: 20000 }).then(() => check('Selector de mes concreto', true), () => check('Selector de mes concreto', false))

        // ── Módulos: desactivar la calculadora
        await admin.from('empresas').update({ modulos: { calculadora_mecanizado: false } }).eq('id', perfil.empresa_id)
        await page.goto(APP + '/', { waitUntil: 'networkidle2' }); await esperar(1500)
        check('Calculadora oculta en el menú al desactivar el módulo', !(await page.evaluate(() => [...document.querySelectorAll('nav a')].some(a => /Calculadora/.test(a.innerText)))))
        await page.goto(APP + '/calculadora', { waitUntil: 'networkidle2' })
        check('/calculadora avisa de módulo no activado', /Módulo no activado/.test(await txt(page)))
        await admin.from('empresas').update({ modulos: { calculadora_mecanizado: true } }).eq('id', perfil.empresa_id)
        await page.goto(APP + '/', { waitUntil: 'networkidle2' }); await esperar(1500)
        check('Activado: «Calculadora mecanizado» en la sección Módulos', await page.evaluate(() => [...document.querySelectorAll('nav a')].some(a => a.innerText.trim() === 'Calculadora mecanizado')) && /Módulos/i.test(await txt(page)))
        await page.goto(APP + '/ajustes', { waitUntil: 'networkidle2' }); await esperar(1000)
        await page.evaluate(() => { [...document.querySelectorAll('[role="tab"]')].find(t => t.innerText.includes('Módulos'))?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) }); await esperar(800)
        check('Ajustes → Módulos', /Calculadora de mecanizado/.test(await txt(page)) && /Talleres de mecanizado/i.test(await txt(page)))
        check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '))
    } catch (e) {
        check('Sin excepciones', false, e.message)
    } finally {
        const { data: docs } = await admin.from('albaranes_firmados').select('id, archivo_url').gte('created_at', inicio).eq('empresa_id', perfil.empresa_id)
        for (const d of docs || []) { const m = d.archivo_url?.match(/api\/archivos\/albaranes-firmados\/(.+)$/); if (m) await admin.storage.from('albaranes-firmados').remove([decodeURIComponent(m[1])]) }
        await admin.from('albaranes_firmados').delete().gte('created_at', inicio).eq('empresa_id', perfil.empresa_id)
        if (L.alb) await admin.from('albaranes').delete().eq('id', L.alb.id)
        if (L.fac) await admin.from('facturas').delete().eq('id', L.fac.id)
        await admin.from('empresas').update({ modulos: emp0.modulos }).eq('id', perfil.empresa_id)
        await browser.close()
        console.log(`\n${ok} OK · ${fail} fallos`)
        process.exit(fail ? 1 : 0)
    }
})()

// Recorre TODAS las pantallas y pulsa cada botón no destructivo: detecta errores
// de consola, excepciones de la página, peticiones fallidas (4xx/5xx) y botones
// que no hacen nada. No borra, no envía y no anula nada.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL
const puppeteer = require('puppeteer-core')
const cookieDe = require('./cookie')
const APP = process.env.BASE || 'http://localhost:3100'
const esperar = ms => new Promise(r => setTimeout(r, ms))

const RUTAS = ['/', '/contactos', '/proveedores', '/catalogo', '/presupuestos', '/presupuestos/new', '/albaranes', '/albaranes/new', '/facturas', '/facturas/new',
    '/albaranes-firmados', '/cobros', '/gastos', '/gastos/new', '/agenda', '/informes', '/fiscal', '/calculadora', '/planos', '/emails', '/ajustes']
// Nunca se pulsan: tienen efecto real o sacan de la sesión
const PELIGRO = /eliminar|borrar|anular|enviar|mandar|cerrar sesi|salir|desvincular|confirmar|guardar|crear|registrar|marcar|pagad|subir|importar|restablecer|ya entregado|exportar|descargar|aplicar|actualizar precios|duplicar|reclamar|convertir|facturar|aceptar|rechazar|unir/i

;(async () => {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
    const cookie = await cookieDe(EMAIL_PRUEBA)
    const host = new URL(APP).hostname
    await browser.setCookie(...cookie.split('; ').map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: host, path: '/' } }))
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    let problemas = []
    let actual = ''
    page.on('console', m => { if (m.type() === 'error' && !/favicon|Download the React DevTools/i.test(m.text())) problemas.push(`[consola] ${actual}: ${m.text().slice(0, 250)}`) })
    page.on('pageerror', e => problemas.push(`[excepción] ${actual}: ${e.message.slice(0, 250)}`))
    page.on('response', r => { if (r.status() >= 400 && !/favicon|_next\/static/.test(r.url())) problemas.push(`[HTTP ${r.status()}] ${actual}: ${r.request().method()} ${r.url().replace(APP, '').slice(0, 150)}`) })
    page.on('dialog', d => d.dismiss())

    let pulsados = 0
    const sinEfecto = []
    for (const ruta of RUTAS) {
        actual = ruta
        await page.goto(APP + ruta, { waitUntil: 'networkidle2' }).catch(e => problemas.push(`[carga] ${ruta}: ${e.message}`))
        await esperar(1500)
        // Cerrar avisos emergentes iniciales
        await page.keyboard.press('Escape')
        const textoPagina = await page.evaluate(() => document.body.innerText)
        if (/Application error|Algo salió mal|Unhandled Runtime Error/i.test(textoPagina)) problemas.push(`[pantalla de error] ${ruta}`)
        const etiquetas = await page.evaluate(() => [...document.querySelectorAll('main button, main [role="tab"], header button')]
            .filter(b => b.offsetParent && !b.disabled)
            .map(b => (b.innerText || b.getAttribute('aria-label') || b.title || '').trim().replace(/\s+/g, ' ')).filter(Boolean))
        const unicos = [...new Set(etiquetas)].filter(t => !PELIGRO.test(t)).slice(0, 40)
        for (const et of unicos) {
            actual = `${ruta} → «${et}»`
            const antes = await page.evaluate(() => document.body.innerHTML.length + '|' + location.href + '|' + document.querySelectorAll('[role="dialog"],[role="menu"],[role="listbox"],[data-state="open"]').length)
            const ok = await page.evaluate(t => {
                const b = [...document.querySelectorAll('main button, main [role="tab"], header button')].find(x => x.offsetParent && ((x.innerText || x.getAttribute('aria-label') || x.title || '').trim().replace(/\s+/g, ' ') === t))
                if (!b) return false
                b.scrollIntoView({ block: 'center' }); return true
            }, et)
            if (!ok) continue
            try {
                const handle = await page.evaluateHandle(t => [...document.querySelectorAll('main button, main [role="tab"], header button')].find(x => x.offsetParent && ((x.innerText || x.getAttribute('aria-label') || x.title || '').trim().replace(/\s+/g, ' ') === t)), et)
                await handle.asElement().click()
            } catch { continue }
            pulsados++
            await esperar(700)
            const despues = await page.evaluate(() => document.body.innerHTML.length + '|' + location.href + '|' + document.querySelectorAll('[role="dialog"],[role="menu"],[role="listbox"],[data-state="open"]').length)
            if (antes === despues) sinEfecto.push(actual)
            const txt = await page.evaluate(() => document.body.innerText)
            if (/Application error|Unhandled Runtime Error/i.test(txt)) problemas.push(`[pantalla de error] ${actual}`)
            await page.keyboard.press('Escape'); await esperar(200)
            if (!page.url().startsWith(APP + ruta) || page.url().replace(APP, '') !== ruta) {
                await page.goto(APP + ruta, { waitUntil: 'networkidle2' }).catch(() => { }); await esperar(800); await page.keyboard.press('Escape')
            }
        }
    }
    console.log(`Botones pulsados: ${pulsados}`)
    console.log(`\nProblemas (${problemas.length}):`); [...new Set(problemas)].forEach(p => console.log('  ' + p))
    console.log(`\nBotones sin efecto visible (${sinEfecto.length}):`); sinEfecto.forEach(p => console.log('  ' + p))
    await browser.close()
})().catch(e => { console.error(e); process.exit(1) })

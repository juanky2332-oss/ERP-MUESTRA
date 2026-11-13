// Presupuesto desde plano (motor de IndunexIA Presupuestos dentro del ERP), con Chrome e IA real:
// sube el plano de prueba de la mesa de inox, comprueba el despiece (material en kg, operaciones,
// componentes), edita el margen, guarda, y lo pasa a presupuesto del ERP con el cliente.
// Uso: npm run test:planos   (BASE=http://localhost:3100 por defecto; GRABAR=<carpeta> guarda capturas)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const path = require('path')
const fs = require('fs')
const puppeteer = require('puppeteer-core')
const cookieDe = require('./cookie')
const APP = process.env.BASE || 'http://localhost:3100'
const PLANO = process.env.PLANO || 'Mesa de inoxidable'
const GRABAR = process.env.GRABAR || ''
const esperar = ms => new Promise(r => setTimeout(r, ms))
let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 300) : ''}`) }

;(async () => {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' })
    const foto = async (page, n) => { if (GRABAR) { fs.mkdirSync(GRABAR, { recursive: true }); await page.screenshot({ path: path.join(GRABAR, n + '.png') }) } }
    try {
        const cookie = await cookieDe(process.env.TEST_USER_EMAIL)
        await browser.setCookie(...cookie.split('; ').map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: new URL(APP).hostname, path: '/' } }))
        const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 })
        const errores = []
        page.on('pageerror', e => errores.push(e.message))

        await page.goto(APP + '/planos', { waitUntil: 'networkidle2' }); await esperar(2500)
        await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find(b => b.innerText.trim() === 'Cerrar')?.click())
        const portada = await page.evaluate(() => document.body.innerText)
        check('Página carga con la subida y el historial', /Despiezar y presupuestar/.test(portada) && /Planos presupuestados/.test(portada))
        await foto(page, '01-subir')

        // Plano de prueba (ID=<plano ya leído> se salta la lectura con IA)
        if (process.env.ID) { await page.goto(APP + '/planos/' + process.env.ID, { waitUntil: 'networkidle2' }) } else {
        await page.evaluate(n => [...document.querySelectorAll('button')].find(b => b.innerText.includes(n))?.click(), PLANO)
        await page.waitForFunction(() => !!document.querySelector('figure img'), { timeout: 15000 })
        await foto(page, '02-plano')
        const t0 = Date.now()
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('Despiezar y presupuestar'))?.click())
        await esperar(4000)
        await foto(page, '03-leyendo')
        await page.waitForFunction(() => /\/planos\/[0-9a-f-]{36}/.test(location.pathname), { timeout: 240000 })
        await page.waitForFunction(() => document.body.innerText.includes('Total con IVA'), { timeout: 30000 })
        await esperar(1500)
        console.log(`   (lectura en ${Math.round((Date.now() - t0) / 1000)} s)`)
        }
        await page.waitForFunction(() => document.body.innerText.includes('Total con IVA'), { timeout: 30000 }); await esperar(1500)
        let txt = await page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText)
        check('Editor abierto con el despiece', /Material/.test(txt) && /Fabricación y servicios/.test(txt), txt.slice(0, 200))
        check('Material calculado en kg con inoxidable', /kg/.test(txt) && /304|Inoxidable/i.test(txt))
        check('Hay soldadura o plegado entre las operaciones', /sold|pleg/i.test(txt))
        check('Total con IVA mayor que cero', /Total con IVA\s*\n?\s*[1-9][\d.]*,\d{2}\s*€/.test(txt), txt.match(/Total con IVA[\s\S]{0,30}/)?.[0])
        await foto(page, '04-editor')

        // Lista de compra
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Ver lista')?.click())
        await esperar(800)
        txt = await page.evaluate(() => document.body.innerText)
        check('Lista de compra con barras o chapas enteras', /barras de|chapas? \d/i.test(txt), txt.match(/Lista de material[\s\S]{0,120}/)?.[0])
        await page.evaluate(() => document.querySelector('[id=resumen]')?.scrollIntoView())
        await foto(page, '05-compra')

        // Margen 40 % → se guarda solo
        await page.evaluate(() => { const i = document.querySelectorAll('#resumen input')[1]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '40'); i.dispatchEvent(new Event('input', { bubbles: true })) })
        await page.waitForFunction(() => document.body.innerText.includes('✓ Guardado'), { timeout: 15000 }).catch(() => { })
        await esperar(2500)
        txt = await page.evaluate(() => document.body.innerText)
        check('Margen cambiado y guardado', /Beneficio \(40 %\)/.test(txt) && /✓ Guardado/.test(txt))

        // Cliente + pasar a presupuesto
        const combo = await page.$('main [role=combobox]'); await page.evaluate(() => window.scrollTo(0, 0))
        await combo.click(); await esperar(800)
        await page.keyboard.type(process.env.CLIENTE || 'CLIENTE DEMO 1'); await esperar(1500)
        await page.keyboard.press('Enter')
        await esperar(1500)
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Pasar a presupuesto')?.click())
        await page.waitForFunction(() => /Pasado a PREP-/.test(document.body.innerText), { timeout: 30000 }).catch(() => { })
        txt = await page.evaluate(() => document.body.innerText)
        const numero = txt.match(/Pasado a (PREP-[\w-]+)/)?.[1]
        check('Presupuesto creado en el ERP', !!numero, numero)
        await foto(page, '06-pasado')

        if (numero) {
            await page.goto(APP + '/presupuestos?q=' + encodeURIComponent(numero), { waitUntil: 'networkidle2' }); await esperar(3000)
            const lista = await page.evaluate(() => document.body.innerText)
            check('El presupuesto sale en Presupuestos', lista.includes(numero))
            await foto(page, '07-presupuesto')
        }
        await page.goto(APP + '/planos', { waitUntil: 'networkidle2' }); await esperar(2500)
        txt = await page.evaluate(() => document.body.innerText)
        check('Historial con el plano y su presupuesto', numero ? txt.includes(numero) : false)
        check('Sin errores de página', errores.length === 0, errores.join(' | '))
    } catch (e) {
        check('Prueba completa', false, e.message)
    } finally {
        await browser.close()
        console.log(`\n${ok} bien, ${fail} mal`)
        process.exit(fail ? 1 : 0)
    }
})()

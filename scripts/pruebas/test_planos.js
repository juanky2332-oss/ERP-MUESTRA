// Presupuesto desde plano (Chrome + IA real): sube un plano de pieza, un croquis
// de mesa de inox y un esquema eléctrico, y comprueba que se lee lo dibujado,
// que no se inventa lo que no está y que el precio sale de las tarifas/catálogo.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const path = require('path')
const puppeteer = require('puppeteer-core')
const cookieDe = require('./cookie')
const APP = process.env.BASE || 'http://localhost:3100'
const esperar = ms => new Promise(r => setTimeout(r, ms))
let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 300) : ''}`) }

;(async () => {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' })
    try {
        // Planos de prueba (ficticios) → PNG
        const pngs = {}
        const pg = await browser.newPage(); await pg.setViewport({ width: 1400, height: 900 })
        for (const n of ['eje', 'mesa', 'esquema']) {
            await pg.goto('file:///' + path.join(__dirname, 'planos', n + '.html').split(path.sep).join('/'))
            pngs[n] = path.join(require('os').tmpdir(), `plano_${n}.png`)
            await pg.screenshot({ path: pngs[n] })
        }
        await pg.close()

        const cookie = await cookieDe(process.env.TEST_USER_EMAIL)
        await browser.setCookie(...cookie.split('; ').map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: new URL(APP).hostname, path: '/' } }))
        const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 })
        const errores = []
        page.on('pageerror', e => errores.push(e.message))
        const leer = async (n, modo) => {
            await page.goto(APP + '/planos', { waitUntil: 'networkidle2' }); await esperar(2500)
            await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find(b => b.innerText.trim() === 'Cerrar')?.click())
            const input = await page.$('input[type=file]'); await input.uploadFile(pngs[n])
            await page.evaluate(m => [...document.querySelectorAll('button')].find(b => b.innerText.startsWith(m))?.click(), modo)
            await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('Leer y presupuestar'))?.click())
            await page.waitForFunction(() => !document.body.innerText.includes('Leyendo el plano'), { timeout: 120000 })
            await esperar(800)
            return page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText)
        }
        const valores = () => page.evaluate(() => [...document.querySelectorAll('main input, main select')].map(e => e.tagName === 'SELECT' ? e.options[e.selectedIndex]?.text : e.value))

        const SOLO = process.env.SOLO || ''
        let txt, v
        // 1) Pieza mecanizada
        if (!SOLO || SOLO === 'eje') {
        txt = await leer('eje', 'Pieza mecanizada')
        v = await valores()
        check('Pieza: material 42CrMo4 reconocido', v.some(x => /42CrMo4/.test(x || '')), v.slice(0, 8).join(' | '))
        check('Pieza: cantidad 12', v.includes('12'))
        check('Pieza: diámetro mayor 80 y largo 900', v.includes('80') && v.includes('900'), v.join(' | '))
        check('Pieza: tolerancias y tratamiento leídos', /h7|k6/i.test(txt) && /Nitrurado/i.test(txt))
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('Abrir en la calculadora'))?.click())
        await page.waitForFunction(() => location.pathname === '/calculadora', { timeout: 15000 }).catch(() => { })
        await esperar(3500)
        const calc = await page.evaluate(() => document.body.innerText)
        check('Pieza: se abre en la calculadora con precio calculado', /cargada desde el plano/.test(calc) || /Precio por pieza/.test(calc), calc.match(/Precio por pieza[\s\S]{0,40}/)?.[0])

        }
        // 2) Mesa de inox
        if (!SOLO || SOLO === 'mesa') {
        txt = await leer('mesa', 'Calderería')
        v = await valores()
        check('Mesa: modo calderería con despiece', /Despiece/.test(txt), txt.slice(0, 200))
        check('Mesa: inox AISI 304', v.some(x => /304/.test(x || '')))
        check('Mesa: chapa de 1,5 mm', v.includes('1.5') || v.includes('1,5'), v.join(' | '))
        check('Mesa: 6 unidades del conjunto (no del estante)', v[2] === '6', `unidades=${v[2]}`)
        const iT = v.indexOf('Tablero') >= 0 ? v.indexOf('Tablero') : v.findIndex(x => /tablero/i.test(x || ''))
        check('Mesa: tablero en desarrollo con faldón (1280 × 780)', v.slice(iT, iT + 9).includes('1280') && v.slice(iT, iT + 9).includes('780'), v.slice(iT, iT + 9).join(' | '))
        check('Mesa: patas con largo (deducido del alto)', v.some(x => x === '898.5' || x === '900' || x === '898,5'))
        const precio = txt.match(/Precio por unidad \(sin IVA\)\s*([\d.,]+\s*€)/i)?.[1]
        check('Mesa: precio por unidad calculado', !!precio, precio)

        }
        // 3) Esquema eléctrico
        if (!SOLO || SOLO === 'esquema') {
        txt = await leer('esquema', 'Esquema')
        if (process.env.VER) console.log(txt)
        check('Esquema: contactores 9A (×2) leídos', /Contactor/i.test(txt) && /9 ?A/.test(txt), txt.slice(0, 300))
        check('Esquema: guardamotores y diferencial', /Guardamotor/i.test(txt) && /Diferencial/i.test(txt))
        check('Esquema: sin precios inventados (no están en el catálogo)', /sin precio/i.test(txt))
        }
        check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '))
    } finally {
        await browser.close()
        console.log(`\n${ok} OK · ${fail} fallos`)
        process.exit(fail ? 1 : 0)
    }
})()

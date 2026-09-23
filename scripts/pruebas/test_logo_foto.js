// Subir como logo una FOTO real (JPEG grande, muchos colores) y comprobar que se guarda
// sin quedarse cargando. Deja los logos como estaban al terminar.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL en .env.local') })()
const fs = require('fs'), path = require('path'), os = require('os')
const puppeteer = require('puppeteer-core')
const { createClient } = require('@supabase/supabase-js')
const cookieDe = require('./cookie')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APP = process.env.BASE || 'http://localhost:3100'
// Tamaño de la foto: 4000×3000 = foto de móvil típica (~8 MB en JPEG)
const [ANCHO, ALTO] = (process.env.FOTO || '4000x3000').split('x').map(Number)

let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 220) : ''}`) }
const esperar = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
    const { data: perfil } = await admin.from('perfiles').select('empresa_id').eq('email', EMAIL_PRUEBA).single()
    const { data: empAntes } = await admin.from('empresas').select('logo_documentos_url, logo_app_url').eq('id', perfil.empresa_id).single()
    try {
        const page = await browser.newPage()
        // Foto sintética con ruido (como la de un móvil): el PNG resultante pesa varios MB
        await page.setContent(`<canvas id=c width=${ANCHO} height=${ALTO}></canvas>`)
        const b64 = await page.evaluate((w, h) => {
            const c = document.getElementById('c'), x = c.getContext('2d'), d = x.createImageData(w, h)
            for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = (i / w) % 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255 }
            x.putImageData(d, 0, 0)
            return c.toDataURL('image/jpeg', 0.92).split(',')[1]
        }, ANCHO, ALTO)
        const foto = path.join(os.tmpdir(), 'erp-foto-logo.jpg')
        fs.writeFileSync(foto, Buffer.from(b64, 'base64'))
        console.log(`Foto de prueba: ${(fs.statSync(foto).size / 1024 / 1024).toFixed(2)} MB`)

        const cookie = await cookieDe(EMAIL_PRUEBA)
        const host = new URL(APP).hostname
        await browser.setCookie(...cookie.split('; ').map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: host, path: '/' } }))
        await page.setViewport({ width: 1440, height: 1000 })
        await page.goto(APP + '/ajustes?tab=marca', { waitUntil: 'networkidle2' }); await esperar(1500)
        await page.evaluate(() => { [...document.querySelectorAll('[role="tab"]')].find(t => t.innerText.includes('Marca'))?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) }); await esperar(800)

        for (const [i, tipo, col] of [[0, 'app', 'logo_app_url'], [1, 'documentos', 'logo_documentos_url']]) {
            const inputs = await page.$$('input[type="file"][accept*="image"]')
            await inputs[i].uploadFile(foto)
            await page.waitForFunction(t => new RegExp(`Confirmar nuevo logo de ${t === 'app' ? 'la app' : 'documentos'}`).test(document.body.innerText), { timeout: 30000 }, tipo)
            const t0 = Date.now()
            await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => /Confirmar cambio/.test(b.innerText))?.click())
            let guardado = null
            for (let k = 0; k < 40 && !guardado; k++) {
                await esperar(500)
                const v = (await admin.from('empresas').select(col).eq('id', perfil.empresa_id).single()).data[col]
                if (v && v !== empAntes[col]) guardado = v
            }
            const cerrado = await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 5000 }).then(() => true, () => false)
            check(`Logo de ${tipo} desde foto grande: guardado`, !!guardado, guardado ? `${((Date.now() - t0) / 1000).toFixed(1)} s` : 'no llegó a guardarse')
            check(`Logo de ${tipo}: el diálogo se cierra (no se queda cargando)`, cerrado)
            if (guardado) {
                const r = await fetch(guardado); const kb = Number(r.headers.get('content-length') || 0) / 1024
                check(`Logo de ${tipo}: archivo ligero`, r.ok && kb < 800, `${kb.toFixed(0)} KB · ${r.headers.get('content-type')}`)
            }
            await esperar(800)
        }
    } catch (e) {
        check('Sin excepciones', false, e.message)
    } finally {
        await admin.from('empresas').update({ logo_documentos_url: empAntes.logo_documentos_url, logo_app_url: empAntes.logo_app_url }).eq('id', perfil.empresa_id)
        await browser.close()
        console.log(`\n${ok} OK · ${fail} fallos`)
        process.exit(fail ? 1 : 0)
    }
})()

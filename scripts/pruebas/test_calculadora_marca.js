// Prueba en navegador de la calculadora de mecanizado y de la personalización de marca.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL en .env.local') })()
const puppeteer = require('puppeteer-core')
const { createClient } = require('@supabase/supabase-js')
const cookieDe = require('./cookie')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APP = process.env.BASE || 'http://localhost:3100'
const SHOTS = require('path').join(__dirname, 'capturas')
require('fs').mkdirSync(SHOTS, { recursive: true })

let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 220) : ''}`) }
const esperar = ms => new Promise(r => setTimeout(r, ms))
const clic = (page, texto) => page.evaluate(t => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim().includes(t)); b?.click(); return !!b }, texto)

;(async () => {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
    const limpieza = { presupuestos: [], calculos: [] }
    const { data: perfil } = await admin.from('perfiles').select('empresa_id').eq('email', EMAIL_PRUEBA).single()
    const { data: empAntes } = await admin.from('empresas').select('logo_documentos_url, logo_app_url').eq('id', perfil.empresa_id).single()
    try {
        const cookie = await cookieDe(EMAIL_PRUEBA)
        const host = new URL(APP).hostname
        await browser.setCookie(...cookie.split('; ').map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: host, path: '/' } }))
        const page = await browser.newPage()
        await page.setViewport({ width: 1440, height: 1000 })
        const errores = []
        page.on('pageerror', e => errores.push(e.message))

        // Calculadora
        await page.goto(APP + '/calculadora', { waitUntil: 'networkidle2' }); await esperar(2000)
        const txt = await page.evaluate(() => document.body.innerText)
        check('Cotizaciones de mercado en €/kg', /Aluminio · hoy[\s\S]*€\/kg/i.test(txt) && /Cobre · hoy[\s\S]*€\/kg/i.test(txt))
        check('Peso de eje Ø40×120 en C45 = 1,184 kg', /1,184 kg/.test(txt))
        check('Bruto con creces y medida comercial (Ø45 × 125)', /D 45 · L 125/.test(txt), (txt.match(/Bruto:[^\n]*/) || [''])[0])
        check('Precio por pieza y precio según cantidad', /Precio por pieza/i.test(txt) && /Precio según cantidad/i.test(txt))
        await page.screenshot({ path: `${SHOTS}/c1-calculadora.png`, fullPage: false })

        // Estimar ciclo con la varita
        await page.evaluate(() => document.querySelectorAll('button[title^="Estimar"]')[1]?.click())
        await esperar(500)
        check('Estimación de ciclo', /Ciclo estimado/.test(await page.evaluate(() => document.body.innerText)))

        // Actualizar precios con el mercado
        await clic(page, 'Actualizar mis precios con el mercado'); await esperar(4000)
        const { data: cfg } = await admin.from('calculadora_config').select('precios').eq('empresa_id', perfil.empresa_id).maybeSingle()
        check('Precios actualizados con el mercado y guardados por empresa', !!cfg && Object.keys(cfg.precios || {}).length >= 20, `${Object.keys(cfg?.precios || {}).length} materiales`)

        // Crear presupuesto con la pieza
        await clic(page, 'Crear presupuesto'); await esperar(800)
        await page.evaluate(() => document.querySelector('[role="dialog"] button[role="combobox"]')?.click()); await esperar(700)
        await page.evaluate(() => document.querySelector('[cmdk-item], [role="option"]')?.click()); await esperar(500)
        await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Crear presupuesto')?.click())
        await esperar(4000)
        const { data: pres } = await admin.from('presupuestos').select('id, numero, lineas, total').eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false }).limit(1).single()
        const linea = pres?.lineas?.[0]?.descripcion || ''
        if (pres && /Ø40 ?× ?120/.test(linea)) limpieza.presupuestos.push(pres.id)
        check('Presupuesto borrador creado con la línea de la pieza', /^Eje\nBarra redonda Ø40 × 120 mm\nMaterial: Acero C45/.test(linea), `${pres?.numero} · ${linea}`)
        const { data: calc } = await admin.from('calculos_piezas').select('id').eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (calc) limpieza.calculos.push(calc.id)
        check('Cálculo guardado en el historial', !!calc)

        // Marca: logo de documentos con confirmación
        await page.goto(APP + '/ajustes', { waitUntil: 'networkidle2' }); await esperar(1200)
        await clic(page, 'Marca y documentos'); await esperar(800)
        await page.evaluate(() => { [...document.querySelectorAll('[role="tab"]')].find(t => t.innerText.includes('Marca'))?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        await esperar(800)
        const inputs = await page.$$('input[type="file"]')
        check('Dos selectores de logo (app y documentos)', inputs.length === 2, inputs.length)
        await inputs[1].uploadFile(require('path').join(__dirname, '../../public/icon-192.png'))
        await page.waitForFunction(() => !!document.querySelector('[role="dialog"] iframe'), { timeout: 15000 })
        check('Vista previa del PDF antes de confirmar', true)
        await page.screenshot({ path: `${SHOTS}/c2-confirmar-logo-documentos.png` })
        const antes = (await admin.from('empresas').select('logo_documentos_url').eq('id', perfil.empresa_id).single()).data.logo_documentos_url
        check('Sin confirmar no cambia nada', antes === empAntes.logo_documentos_url)
        await clic(page, 'Confirmar cambio'); await esperar(4000)
        const despues = (await admin.from('empresas').select('logo_documentos_url').eq('id', perfil.empresa_id).single()).data.logo_documentos_url
        check('Tras confirmar se guarda el nuevo logo de documentos', !!despues && despues !== antes, despues)
        const r = await fetch(despues)
        check('El logo es accesible para generar los PDF', r.ok && /image\/png/.test(r.headers.get('content-type') || ''))
        const { data: aud } = await admin.from('auditoria').select('accion').eq('empresa_id', perfil.empresa_id).eq('accion', 'logo_documentos_cambiado').limit(1)
        check('Cambio de logo auditado', (aud || []).length > 0)

        // Logo de app
        await inputs[0].uploadFile(require('path').join(__dirname, '../../public/icon-192.png'))
        await page.waitForFunction(() => /Confirmar nuevo logo de la app/.test(document.body.innerText), { timeout: 10000 })
        await clic(page, 'Confirmar cambio'); await esperar(3500)
        const app = (await admin.from('empresas').select('logo_app_url').eq('id', perfil.empresa_id).single()).data.logo_app_url
        check('Logo de la app guardado', !!app)
        const marca = await (await fetch(APP + '/api/marca')).json()
        check('Pantalla de acceso recibe el logo (sin sesión)', marca.logo === app, JSON.stringify(marca))
        await page.goto(APP + '/', { waitUntil: 'networkidle2' }); await esperar(1500)
        check('El menú muestra el logo', await page.evaluate(u => !!document.querySelector(`img[src="${u}"]`), app))
        await page.screenshot({ path: `${SHOTS}/c3-menu-con-logo.png` })

        check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '))
    } catch (e) {
        console.error('ERROR', e); fail++
    } finally {
        for (const id of limpieza.calculos) await admin.from('calculos_piezas').delete().eq('id', id)
        for (const id of limpieza.presupuestos) { await admin.from('document_status').delete().eq('document_id', id); await admin.from('presupuestos').delete().eq('id', id) }
        // Deja los logos como estaban
        await admin.from('empresas').update({ logo_documentos_url: empAntes.logo_documentos_url, logo_app_url: empAntes.logo_app_url }).eq('id', perfil.empresa_id)
        await browser.close()
        console.log(`\n${ok} OK · ${fail} fallos`)
    }
})()

// Prueba de interfaz en navegador real (Chrome headless) contra la app local.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL (usuario propietario con el que probar) en .env.local') })()
const puppeteer = require('puppeteer-core')
const { createClient } = require('@supabase/supabase-js')
const cookieDe = require('./cookie')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APP = process.env.BASE || 'http://localhost:3100'
const SHOTS = require('path').join(__dirname, 'capturas')
require('fs').mkdirSync(SHOTS, { recursive: true })

let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 200) : ''}`) }
const esperar = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
    const limpieza = { facturas: [], eventos: [], catalogo: [] }
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
    try {
        const { data: perfil } = await admin.from('perfiles').select('empresa_id').eq('email', EMAIL_PRUEBA).single()
        const { data: cli } = await admin.from('contactos').select('*').eq('empresa_id', perfil.empresa_id).limit(1).single()
        const { data: fac } = await admin.from('facturas').insert({ empresa_id: perfil.empresa_id, numero: 'FAC-95-2026', fecha: '2026-08-01', fecha_vencimiento: '2026-09-05', cliente_id: cli.id, cliente_razon_social: cli.razon_social, lineas: [{ descripcion: 'Prueba UI', cantidad: 1, precio_unitario: 500 }], subtotal: 500, base_imponible: 500, iva_porcentaje: 21, iva_importe: 105, total: 605, statuses: ['pendiente'] }).select().single()
        limpieza.facturas.push(fac.id)
        await admin.from('avisos_mostrados').delete().eq('clave', 'cobros')

        const cookie = await cookieDe(EMAIL_PRUEBA)
        const host = new URL(APP).hostname
        const cookies = cookie.split('; ').map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: host, path: '/' } })

        const page = await browser.newPage()
        await page.setViewport({ width: 1440, height: 900 })
        const errores = []
        page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(404|401)/i.test(m.text())) errores.push(m.text()) })
        page.on('pageerror', e => errores.push('pageerror: ' + e.message))
        await browser.setCookie(...cookies)

        // Dashboard + aviso emergente de vencidas
        await page.goto(APP + '/', { waitUntil: 'networkidle2' })
        await esperar(2500)
        const html = await page.content()
        check('Dashboard "Control de hoy" con saludo y resumen', /Hoy tienes/.test(html) && /Cobros prioritarios/.test(html))
        const aviso = await page.$('[role="dialog"][aria-label="Facturas vencidas"]')
        check('Aviso emergente de facturas vencidas al entrar', !!aviso && /FAC-95-2026/.test(await page.evaluate(e => e.innerText, aviso)))
        await page.screenshot({ path: `${SHOTS}/1-dashboard.png` })

        // Cerrar aviso → no vuelve a salir al navegar
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Cerrar')?.click())
        await esperar(800)
        await page.goto(APP + '/', { waitUntil: 'networkidle2' }); await esperar(2500)
        const aviso2 = await page.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-label="Facturas vencidas"]'); return d ? getComputedStyle(d).opacity : 'none' })
        check('Cerrado: no se repite en la misma jornada', aviso2 === 'none' || aviso2 === '0', aviso2)

        // Cobros: marcar pagada desde la pantalla de cobros
        await page.goto(APP + '/cobros', { waitUntil: 'networkidle2' }); await esperar(1500)
        check('Pantalla Cobros muestra la factura vencida', /FAC-95-2026/.test(await page.content()))
        await page.screenshot({ path: `${SHOTS}/2-cobros.png` })
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Parcial')?.click())
        await page.waitForSelector('input[inputmode="decimal"]', { timeout: 8000 })
        await page.type('input[inputmode="decimal"]', '105')
        await page.screenshot({ path: `${SHOTS}/3-pago-parcial.png` })
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Registrar pago$/.test(b.innerText.trim()))?.click())
        await esperar(3000)
        let { data: f1 } = await admin.from('facturas').select('estado_cobro, importe_cobrado').eq('id', fac.id).single()
        check('Pago parcial desde la web (105 €)', f1.estado_cobro === 'parcial' && Number(f1.importe_cobrado) === 105, JSON.stringify(f1))

        // Facturas: "Pagada" rápido desde la lista
        await page.goto(APP + '/facturas?buscar=FAC-95', { waitUntil: 'networkidle2' }); await esperar(2000)
        await page.screenshot({ path: `${SHOTS}/4-facturas.png` })
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Pagada')?.click())
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /Confirmar pago/.test(b.innerText)), { timeout: 8000 })
        const modal = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText || '')
        check('Modal muestra total, cobrado y pendiente', /605,00/.test(modal) && /105,00/.test(modal) && /500,00/.test(modal), modal.replace(/\n/g, ' | '))
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Confirmar pago/.test(b.innerText))?.click())
        await esperar(3000)
        ;({ data: f1 } = await admin.from('facturas').select('estado_cobro, importe_cobrado').eq('id', fac.id).single())
        check('"Marcar como pagada" liquida el saldo restante', f1.estado_cobro === 'pagada' && Number(f1.importe_cobrado) === 605, JSON.stringify(f1))

        // Agenda: vista y crear evento
        await page.goto(APP + '/agenda?nuevo=1', { waitUntil: 'networkidle2' }); await esperar(1500)
        await page.waitForSelector('input[placeholder="Llamar a Construcciones López"]', { timeout: 8000 })
        await page.type('input[placeholder="Llamar a Construcciones López"]', 'Llamada de prueba UI')
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Guardar')?.click())
        await esperar(2500)
        const { data: ev } = await admin.from('eventos').select('id').eq('titulo', 'Llamada de prueba UI').maybeSingle()
        if (ev) limpieza.eventos.push(ev.id)
        check('Crear evento en la agenda', !!ev)
        await page.screenshot({ path: `${SHOTS}/5-agenda.png` })

        // Catálogo: crear producto
        await page.goto(APP + '/catalogo', { waitUntil: 'networkidle2' }); await esperar(1000)
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Nuevo elemento/.test(b.innerText))?.click())
        await page.waitForSelector('[role="dialog"] input', { timeout: 8000 })
        const inputs = await page.$$('[role="dialog"] input')
        await inputs[0].type('Tornillo prueba UI')
        await page.evaluate(() => { const ins = [...document.querySelectorAll('[role="dialog"] input[inputmode="decimal"]')]; return ins.length })
        const dec = await page.$$('[role="dialog"] input[inputmode="decimal"]')
        await dec[0].type('0,50'); await dec[1].type('1,20')
        await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Guardar')?.click())
        await esperar(2500)
        const { data: prod } = await admin.from('catalogo').select('id, precio_venta').eq('nombre', 'Tornillo prueba UI').maybeSingle()
        if (prod) limpieza.catalogo.push(prod.id)
        check('Crear producto en el catálogo', !!prod && Number(prod.precio_venta) === 1.2, JSON.stringify(prod))

        // Nueva factura: vencimiento calculado según el cliente
        await admin.from('contactos').update({ condicion_pago_tipo: 'dias', condicion_pago_dias: 60, metodo_pago: 'transferencia' }).eq('id', cli.id)
        await page.goto(APP + '/facturas/new', { waitUntil: 'networkidle2' }); await esperar(1500)
        await page.evaluate(() => [...document.querySelectorAll('button[role="combobox"]')][0]?.click())
        await esperar(800)
        await page.evaluate((nombre) => [...document.querySelectorAll('[cmdk-item], [role="option"]')].find(o => o.innerText.includes(nombre))?.click(), cli.razon_social)
        await esperar(2500)
        const venc = await page.evaluate(() => document.querySelector('input[type="date"]')?.value)
        const esperado = (() => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10) })()
        check('Factura nueva: vencimiento calculado a 60 días', venc === esperado, `${venc} vs ${esperado}`)
        await page.screenshot({ path: `${SHOTS}/6-factura-nueva.png` })
        await admin.from('contactos').update({ condicion_pago_tipo: 'dias', condicion_pago_dias: 30, metodo_pago: null }).eq('id', cli.id)

        // Clientes: ficha
        await page.goto(APP + '/contactos', { waitUntil: 'networkidle2' }); await esperar(1500)
        await page.evaluate((nombre) => [...document.querySelectorAll('button')].find(b => b.innerText.includes(nombre))?.click(), cli.razon_social)
        await esperar(2500)
        const ficha = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText || '')
        check('Ficha de cliente con tarjeta rápida', /Facturado total/i.test(ficha) && /Pendiente de cobro/i.test(ficha) && /Plazo habitual/i.test(ficha))
        await page.screenshot({ path: `${SHOTS}/7-ficha-cliente.png` })

        // Ajustes, informes, proveedores, gastos, presupuestos
        for (const [ruta, patron] of [['/ajustes', /Usuarios/], ['/informes', /Últimos 12 meses/], ['/proveedores', /Proveedores/], ['/gastos', /Gastos/], ['/presupuestos', /Presupuestos/], ['/albaranes', /Albaran/i]]) {
            await page.goto(APP + ruta, { waitUntil: 'networkidle2' }); await esperar(1200)
            check(`Página ${ruta} carga`, patron.test(await page.content()))
        }
        await page.goto(APP + '/ajustes', { waitUntil: 'networkidle2' }); await esperar(800)
        await page.screenshot({ path: `${SHOTS}/8-ajustes.png` })

        // Móvil + modo oscuro
        await page.setViewport({ width: 390, height: 844, isMobile: true })
        await page.goto(APP + '/', { waitUntil: 'networkidle2' }); await esperar(1500)
        const barra = await page.evaluate(() => [...document.querySelectorAll('nav')].map(n => n.innerText).join(' '))
        check('Barra móvil Inicio · Agenda · Cobros · Más', /Inicio/.test(barra) && /Agenda/.test(barra) && /Cobros/.test(barra) && /Más/.test(barra))
        const scrollH = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
        check('Sin scroll horizontal en móvil', scrollH)
        await page.screenshot({ path: `${SHOTS}/9-movil.png` })
        await page.evaluate(() => { localStorage.setItem('theme', 'dark') })
        await page.setViewport({ width: 1440, height: 900 })
        await page.goto(APP + '/cobros', { waitUntil: 'networkidle2' }); await esperar(1500)
        const oscuro = await page.evaluate(() => document.documentElement.classList.contains('dark'))
        check('Tema oscuro', oscuro)
        await page.screenshot({ path: `${SHOTS}/10-oscuro.png` })

        check('Sin errores de JavaScript en consola', errores.length === 0, errores.slice(0, 3).join(' || '))
    } catch (e) {
        console.error('ERROR EN TEST UI', e); fail++
    } finally {
        for (const id of limpieza.facturas) { await admin.from('cobros').delete().eq('factura_id', id); await admin.from('facturas').delete().eq('id', id) }
        for (const id of limpieza.eventos) await admin.from('eventos').delete().eq('id', id)
        for (const id of limpieza.catalogo) await admin.from('catalogo').delete().eq('id', id)
        await admin.from('avisos_mostrados').delete().eq('clave', 'cobros')
        await browser.close()
        console.log(`\n${ok} OK · ${fail} fallos`)
    }
})()

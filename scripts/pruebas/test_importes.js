// Importes y reglas fiscales de punta a punta (contra la app arrancada en BASE):
//  - factura con IVA 0 % desde El Maikel: no pasa a 21 %, líneas con importe, total al céntimo
//  - gasto dictado solo con el total: se desglosa base e IVA (antes quedaban a 0)
//  - gasto con retención de IRPF (alquiler 19 %)
//  - no se puede borrar una factura que no es la última de la serie; la última sí,
//    y su albarán vuelve a quedar pendiente de facturar
// Crea y borra sus propios datos.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL = process.env.TEST_USER_EMAIL
const puppeteer = require('puppeteer-core')
const { createClient } = require('@supabase/supabase-js')
const cookieDe = require('./cookie')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BASE = process.env.BASE || 'http://localhost:3100'
const esperar = ms => new Promise(r => setTimeout(r, ms))
let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 220) : ''}`) }

;(async () => {
    const cookie = await cookieDe(EMAIL)
    const H = { 'Content-Type': 'application/json', Cookie: cookie }
    const { data: perfil } = await admin.from('perfiles').select('empresa_id').eq('email', EMAIL).single()
    const limpiar = { facturas: [], gastos: [], albaranes: [] }
    const chat = async (historial, texto) => {
        historial.push({ role: 'user', content: texto })
        const d = await (await fetch(BASE + '/api/chat', { method: 'POST', headers: H, body: JSON.stringify({ messages: historial }) })).json()
        historial.push({ role: 'assistant', content: d.content, accion_id: d.accion?.id })
        return d
    }
    const confirmar = async id => (await fetch(BASE + '/api/chat/accion', { method: 'POST', headers: H, body: JSON.stringify({ id, decision: 'confirmar' }) })).json()

    try {
        // 1) Factura con IVA 0 % (inversión del sujeto pasivo) y precios con 3 decimales
        let h = []
        let d = await chat(h, 'Hazme una factura para EMPRESA A con 3 unidades de "Soporte mecanizado" a 12,345 € y 7 de "Tornillo especial" a 0,333 €, con IVA 0% porque es inversión del sujeto pasivo')
        check('El Maikel prepara la factura', d.accion?.tipo === 'documento', d.content)
        if (d.accion) {
            const r = await confirmar(d.accion.id)
            const { data: f } = await admin.from('facturas').select('*').eq('id', r.datos?.id || '00000000-0000-0000-0000-000000000000').maybeSingle()
            if (f) limpiar.facturas.push(f.id)
            check('IVA 0 % guardado (no 21 %)', f && Number(f.iva_porcentaje) === 0 && Number(f.iva_importe) === 0, f && `${f.iva_porcentaje}% · ${f.iva_importe}`)
            check('Importe de cada línea guardado', f && f.lineas.map(l => l.importe).join('|') === '37.04|2.33', f && JSON.stringify(f.lineas.map(l => l.importe)))
            check('Base y total al céntimo', f && Number(f.base_imponible) === 39.37 && Number(f.total) === 39.37, f && `${f.base_imponible} / ${f.total}`)
            if (f) {
                const pdf = await fetch(`${BASE}/api/pdf/factura/${f.id}`, { headers: { Cookie: cookie } })
                const txt = Buffer.from(await pdf.arrayBuffer()).toString('latin1')
                check('PDF de la factura generado', pdf.status === 200 && txt.startsWith('%PDF'), `HTTP ${pdf.status}`)
            }
        }

        // 2) Gasto dictado solo con el total
        h = []
        d = await chat(h, 'Apunta un gasto de 121 € en Ferretería Industrial Pérez de material de taller, con IVA 21%')
        check('El Maikel prepara el gasto', d.accion?.tipo === 'gasto', d.content)
        if (d.accion) {
            const r = await confirmar(d.accion.id)
            const { data: g } = await admin.from('gastos').select('*').eq('id', r.datos?.id || '00000000-0000-0000-0000-000000000000').maybeSingle()
            if (g) limpiar.gastos.push(g.id)
            check('Gasto desglosado: base 100 € + IVA 21 €', g && Number(g.base_imponible) === 100 && Number(g.iva_importe) === 21 && Number(g.total) === 121, g && `${g.base_imponible} + ${g.iva_importe} = ${g.total}`)
        }

        // 3) Gasto de alquiler con retención del 19 %
        h = []
        d = await chat(h, 'Registra el alquiler de la nave de este mes: base 1000 €, IVA 21% y retención del 19%, proveedor Inmuebles Ejemplo SL, total 1020 €')
        if (d.accion) {
            const r = await confirmar(d.accion.id)
            const { data: g } = await admin.from('gastos').select('*').eq('id', r.datos?.id || '00000000-0000-0000-0000-000000000000').maybeSingle()
            if (g) limpiar.gastos.push(g.id)
            check('Retención de alquiler guardada (modelo 115)', g && Number(g.retencion_importe) === 190 && Number(g.retencion_porcentaje) === 19, g && `${g.retencion_porcentaje}% · ${g.retencion_importe}`)
        } else check('El Maikel prepara el gasto de alquiler', false, d.content)

        // 4) Borrado de facturas: solo la última de la serie y no enviada
        const { data: cli } = await admin.from('contactos').select('*').eq('empresa_id', perfil.empresa_id).ilike('razon_social', 'EMPRESA A%').limit(1).single()
        const { data: alb } = await admin.from('albaranes').insert({ empresa_id: perfil.empresa_id, numero: 'ALB-96-2026', fecha: '2026-10-01', cliente_id: cli.id, cliente_razon_social: cli.razon_social, lineas: [{ descripcion: 'Prueba borrado', cantidad: 1, precio_unitario: 10, importe: 10 }], subtotal: 10, base_imponible: 10, iva_porcentaje: 21, iva_importe: 2.1, total: 12.1, statuses: ['pendiente'] }).select().single()
        limpiar.albaranes.push(alb.id)
        h = []
        d = await chat(h, 'Factura el albarán ALB-96-2026')
        let facAlb = null
        if (d.accion) { const r = await confirmar(d.accion.id); facAlb = r.datos?.id; if (facAlb) limpiar.facturas.push(facAlb) }
        const { data: albTras } = await admin.from('albaranes').select('statuses, factura_id').eq('id', alb.id).single()
        check('Albarán facturado y marcado traspasado', !!facAlb && albTras.factura_id === facAlb && albTras.statuses.includes('traspasado'), JSON.stringify(albTras))

        const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' })
        await browser.setCookie(...cookie.split('; ').map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: new URL(BASE).hostname, path: '/' } }))
        const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 })
        page.on('dialog', x => x.accept())
        const borrarDesdeLista = async numero => {
            await page.goto(BASE + '/facturas?q=' + encodeURIComponent(numero), { waitUntil: 'networkidle2' }); await esperar(2500)
            await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find(b => b.innerText.trim() === 'Cerrar')?.click()); await esperar(500)
            const fila = await page.evaluateHandle(n => [...document.querySelectorAll('tbody tr')].find(t => t.innerText.includes(n)), numero)
            const papelera = await fila.asElement()?.$('button.text-rose-400')
            if (!papelera) return 'sin botón'
            await papelera.click(); await esperar(2500)
            return page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.innerText).join(' | '))
        }
        const t1 = await borrarDesdeLista('FAC-03-2026')
        const { data: sigue } = await admin.from('facturas').select('id').eq('empresa_id', perfil.empresa_id).eq('numero', 'FAC-03-2026').maybeSingle()
        check('FAC-03 (no es la última de la serie) NO se borra', !!sigue && /no se puede borrar|no es la última/i.test(t1), t1)

        const { data: fUlt } = await admin.from('facturas').select('numero').eq('id', facAlb).single()
        const t2 = await borrarDesdeLista(fUlt.numero)
        const { data: borrada } = await admin.from('facturas').select('id').eq('id', facAlb).maybeSingle()
        check(`La última factura (${fUlt.numero}, sin enviar) sí se borra`, !borrada, t2)
        const { data: albDesp } = await admin.from('albaranes').select('statuses, factura_id').eq('id', alb.id).single()
        check('Su albarán vuelve a quedar pendiente de facturar', !albDesp.factura_id && !albDesp.statuses.includes('traspasado'), JSON.stringify(albDesp))
        await browser.close()
    } finally {
        for (const id of limpiar.facturas.reverse()) { await admin.from('document_status').delete().eq('document_id', id); await admin.from('facturas').delete().eq('id', id) }
        for (const id of limpiar.albaranes) { await admin.from('document_status').delete().eq('document_id', id); await admin.from('albaranes').delete().eq('id', id) }
        for (const id of limpiar.gastos) await admin.from('gastos').delete().eq('id', id)
        await admin.from('proveedores').delete().eq('empresa_id', perfil.empresa_id).in('razon_social', ['FERRETERÍA INDUSTRIAL PÉREZ', 'Ferretería Industrial Pérez', 'INMUEBLES EJEMPLO SL', 'Inmuebles Ejemplo SL', 'Inmuebles Ejemplo S.L.', 'INMUEBLES EJEMPLO, S.L.'])
        console.log(`\n${ok} OK · ${fail} fallos`)
        process.exit(fail ? 1 : 0)
    }
})()

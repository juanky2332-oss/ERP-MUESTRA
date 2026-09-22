// Prueba end-to-end por HTTP contra la app arrancada (BASE), con sesión real.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL (usuario propietario con el que probar) en .env.local') })()
const cookieDe = require('./cookie')
const BASE = process.env.BASE || 'http://localhost:3100'
const ENVIAR = process.argv.includes('--enviar')

let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`) }

;(async () => {
    const cookie = await cookieDe(EMAIL_PRUEBA)
    const H = { Cookie: cookie, 'Content-Type': 'application/json' }

    // Páginas principales
    for (const ruta of ['/', '/cobros', '/agenda', '/facturas', '/contactos', '/proveedores', '/catalogo', '/informes', '/ajustes', '/gastos', '/presupuestos']) {
        const r = await fetch(BASE + ruta, { headers: { Cookie: cookie }, redirect: 'manual' })
        check(`GET ${ruta}`, r.status === 200, `HTTP ${r.status}`)
    }
    const sinSesion = await fetch(BASE + '/cobros', { redirect: 'manual' })
    check('Sin sesión redirige a /login', sinSesion.status === 307 || sinSesion.status === 308, `HTTP ${sinSesion.status} → ${sinSesion.headers.get('location')}`)
    const chatSinSesion = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"messages":[]}', redirect: 'manual' })
    check('API chat sin sesión bloqueada', chatSinSesion.status >= 300, `HTTP ${chatSinSesion.status}`)

    // El caso que fallaba: pedir a la IA que mande la factura por correo
    const historial = []
    const turno = async (texto) => {
        historial.push({ role: 'user', content: texto })
        const r = await fetch(BASE + '/api/chat', { method: 'POST', headers: H, body: JSON.stringify({ messages: historial }) })
        const d = await r.json()
        historial.push({ role: 'assistant', content: d.content, accion_id: d.accion?.id })
        console.log(`\n👤 ${texto}\n🤖 ${d.content}${d.accion ? `\n   [ACCIÓN ${d.accion.tipo}]\n   ${d.accion.resumen.replace(/\n/g, '\n   ')}` : ''}${d.ejecutada ? `\n   [EJECUTADA ok=${d.ejecutada.ok}]` : ''}\n`)
        return d
    }

    const d1 = await turno('Mándale un correo a la empresa a, adjuntando la factura fac 01')
    check('La IA prepara el envío (no dice "procederé" sin hacer nada)', d1.accion?.tipo === 'email_documento')
    check('Destinatario resuelto desde la ficha del cliente', /juancarlosrosbautista@gmail\.com/.test(d1.accion?.resumen || ''))

    const d2 = await turno('Mensaje estándar indicando que tiene adjunta la factura, que necesitamos que nos diga que le ha llegado el correo, correo formal')
    check('La IA ajusta el texto y vuelve a pedir confirmación', d2.accion?.tipo === 'email_documento' && !d2.ejecutada)

    if (ENVIAR) {
        const d3 = await turno('Ok, envíalo')
        check('Con "Ok, envíalo" el correo SE ENVÍA de verdad', d3.ejecutada?.ok === true, d3.content)
        const d4 = await turno('Ok, envíalo')
        check('Repetir la confirmación no reenvía el correo', !(d4.ejecutada?.ok && /Correo enviado/.test(d4.content)))
    } else {
        const r = await fetch(BASE + '/api/chat/accion', { method: 'POST', headers: H, body: JSON.stringify({ id: d2.accion.id, decision: 'cancelar' }) })
        const d = await r.json()
        check('Cancelar la acción no envía nada', d.ok && /Cancelado/.test(d.mensaje))
    }

    // Cobro por lenguaje natural → se prepara, NO se ejecuta
    const d5 = await turno('La factura 1 está pagada')
    check('"La factura 1 está pagada" prepara un cobro pendiente de confirmar', d5.accion?.tipo === 'cobro' && !d5.ejecutada)
    if (d5.accion) await fetch(BASE + '/api/chat/accion', { method: 'POST', headers: H, body: JSON.stringify({ id: d5.accion.id, decision: 'cancelar' }) })

    const d6 = await turno('¿Qué facturas tengo pendientes de cobro y cuándo vencen?')
    check('Consulta de cobros responde con datos', /FAC-01-2026/.test(d6.content), d6.content.slice(0, 80))

    console.log(`\n${ok} OK · ${fail} fallos`)
})().catch(e => { console.error(e); process.exit(1) })

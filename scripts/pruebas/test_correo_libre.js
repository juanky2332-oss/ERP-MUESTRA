// El asistente prepara correos libres (a proveedores/clientes) SIN adjuntos salvo que se pidan,
// y calcula pesos de piezas. No envía nada: cancela las acciones al final.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL en .env.local') })()
const { createClient } = require('@supabase/supabase-js')
const cookieDe = require('./cookie')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BASE = process.env.BASE || 'http://localhost:3100'

let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 260).replace(/\n/g, ' ⏎ ') : ''}`) }

;(async () => {
    const { data: perfil } = await admin.from('perfiles').select('empresa_id').eq('email', EMAIL_PRUEBA).single()
    const { data: prov } = await admin.from('proveedores').insert({ empresa_id: perfil.empresa_id, razon_social: 'ACEROS DE PRUEBA SL', email: 'pedidos@aceros-prueba.test' }).select().single()
    const cookie = await cookieDe(EMAIL_PRUEBA)
    const H = { Cookie: cookie, 'Content-Type': 'application/json' }
    const acciones = []
    const turno = async (historial, texto) => {
        historial.push({ role: 'user', content: texto })
        const d = await (await fetch(BASE + '/api/chat', { method: 'POST', headers: H, body: JSON.stringify({ messages: historial }) })).json()
        historial.push({ role: 'assistant', content: d.content, accion_id: d.accion?.id })
        if (d.accion) acciones.push(d.accion.id)
        return d
    }
    try {
        const h1 = []
        const d1 = await turno(h1, 'Mándale un correo a Aceros de Prueba pidiendo precio de 6 metros de barra redonda de 50 en C45')
        check('Correo a proveedor preparado', d1.accion?.tipo === 'email_libre' && /pedidos@aceros-prueba\.test/.test(d1.accion?.resumen || ''), d1.accion?.resumen)
        check('Sin pedir adjuntos → Adjuntos: ninguno', /Adjuntos: ninguno/.test(d1.accion?.resumen || ''))

        const h2 = []
        const d2 = await turno(h2, 'Envíale un correo a Aceros de Prueba diciendo que les pagamos la semana que viene y adjunta la factura 1 en PDF')
        check('Pidiendo adjunto expresamente → lo adjunta', d2.accion?.tipo === 'email_libre' && /Adjuntos: PDF de FAC-01-2026/.test(d2.accion?.resumen || ''), d2.accion?.resumen)

        const h3 = []
        const d3 = await turno(h3, '¿Cuánto pesa una barra redonda de 50 mm de diámetro y 6 metros en acero C45 y cuánto cuesta el material?')
        check('Peso de barra Ø50×6000 en C45 ≈ 92,5 kg', /92[,.][45]/.test(d3.content), d3.content)
    } catch (e) {
        console.error(e); fail++
    } finally {
        for (const id of acciones) await fetch(BASE + '/api/chat/accion', { method: 'POST', headers: H, body: JSON.stringify({ id, decision: 'cancelar' }) })
        await admin.from('proveedores').delete().eq('id', prov.id)
        console.log(`\n${ok} OK · ${fail} fallos`)
    }
})()

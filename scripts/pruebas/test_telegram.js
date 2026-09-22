// Prueba end-to-end del bot de Telegram contra la app local, con un servidor
// de Telegram SIMULADO (puerto 3200) que registra todas las respuestas.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL (usuario propietario con el que probar) en .env.local') })()
const http = require('http')
const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APP = 'http://localhost:3100'
const SECRET = 'secret-test'

// ───────── Telegram simulado ─────────
const salida = []          // todo lo que el bot "envía"
const archivos = {}        // file_id -> {buffer, path}
let msgId = 1000
const mock = http.createServer((req, res) => {
    let body = []
    req.on('data', c => body.push(c))
    req.on('end', () => {
        const raw = Buffer.concat(body)
        const m = req.url.match(/\/bot[^/]+\/(\w+)/)
        if (req.url.startsWith('/file/')) {
            const f = Object.values(archivos).find(a => req.url.endsWith(a.path))
            res.writeHead(f ? 200 : 404); return res.end(f ? f.buffer : '')
        }
        const metodo = m?.[1]
        let json = {}
        try { json = JSON.parse(raw.toString() || '{}') } catch { json = { multipart: true } }
        if (metodo === 'getFile') {
            const a = archivos[json.file_id]
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ ok: true, result: { file_id: json.file_id, file_path: a.path, file_size: a.buffer.length } }))
        }
        salida.push({ metodo, ...json })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, result: { message_id: ++msgId } }))
    })
})

let updateId = Math.floor(Date.now() / 1000) * 10
async function enviarUpdate(update) {
    const desde = salida.length
    const r = await fetch(`${APP}/api/telegram/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET }, body: JSON.stringify({ update_id: ++updateId, ...update }) })
    if (r.status !== 200) console.log('webhook HTTP', r.status)
    return salida.slice(desde).filter(s => s.metodo !== 'sendChatAction')
}
const texto = (chat, t) => enviarUpdate({ message: { message_id: ++msgId, chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'Test' }, text: t } })
const boton = (chat, data) => enviarUpdate({ callback_query: { id: 'cb' + (++msgId), data, from: { id: chat }, message: { message_id: 555, chat: { id: chat, type: 'private' } } } })
const doc = (chat, fileId, mime, caption) => enviarUpdate({ message: { message_id: ++msgId, chat: { id: chat, type: 'private' }, from: { id: chat }, document: { file_id: fileId, mime_type: mime, file_name: 'x' }, caption } })
const voz = (chat, fileId) => enviarUpdate({ message: { message_id: ++msgId, chat: { id: chat, type: 'private' }, from: { id: chat }, voice: { file_id: fileId, duration: 3 } } })

const botones = (out) => out.flatMap(o => (o.reply_markup?.inline_keyboard || []).flat())
const textos = (out) => out.map(o => o.text || '').join('\n---\n')
const cb = (out, prefijo) => botones(out).find(b => b.callback_data?.startsWith(prefijo))?.callback_data

let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 160).replace(/\n/g, ' ⏎ ') : ''}`) }

const OWNER = 999000111, COMERCIAL = 999000222, EXTRANO = 999000333
const limpieza = { users: [], facturas: [], links: [], gastos: [] }

;(async () => {
    await new Promise(r => mock.listen(3200, r))
    try {
        const { data: perfil } = await admin.from('perfiles').select('user_id, empresa_id').eq('email', EMAIL_PRUEBA).single()
        const { data: cli } = await admin.from('contactos').select('*').eq('empresa_id', perfil.empresa_id).limit(1).single()

        // Datos de prueba: dos facturas (una vencida) y un usuario comercial
        const mkFac = async (numero, venc) => {
            const { data } = await admin.from('facturas').insert({ empresa_id: perfil.empresa_id, numero, fecha: '2026-08-01', fecha_vencimiento: venc, cliente_id: cli.id, cliente_razon_social: cli.razon_social, lineas: [{ descripcion: 'Prueba', cantidad: 1, precio_unitario: 1000 }], subtotal: 1000, base_imponible: 1000, iva_porcentaje: 21, iva_importe: 210, total: 1210, statuses: ['pendiente'] }).select().single()
            limpieza.facturas.push(data.id); return data
        }
        const f90 = await mkFac('FAC-90-2026', '2026-09-01')
        const f91 = await mkFac('FAC-91-2026', '2026-12-31')
        const { data: u } = await admin.auth.admin.createUser({ email: 'test-comercial-a@erp-test.local', password: 'TestPass!12345', email_confirm: true })
        limpieza.users.push(u.user.id)
        await admin.from('perfiles').insert({ user_id: u.user.id, empresa_id: perfil.empresa_id, email: 'test-comercial-a@erp-test.local', nombre: 'Comercial Test', rol: 'comercial' })
        const { data: lOwner } = await admin.from('telegram_links').insert({ chat_id: String(OWNER), linked: true, user_id: perfil.user_id, empresa_id: perfil.empresa_id, conversation: [] }).select().single()
        limpieza.links.push(lOwner.id)
        const { data: lCom } = await admin.from('telegram_links').insert({ link_code: 'TSTCOD', linked: false, code_expires_at: new Date(Date.now() + 600000).toISOString(), user_id: u.user.id, empresa_id: perfil.empresa_id }).select().single()
        limpieza.links.push(lCom.id)

        // 1. Chat no vinculado
        let out = await texto(EXTRANO, '/inicio')
        check('Chat no vinculado: no da acceso', /no está vinculado/.test(textos(out)), textos(out))
        out = await texto(EXTRANO, '/vincular MALO99')
        check('Código incorrecto rechazado', /no es válido|caducado/.test(textos(out)))

        // 2. Vinculación del comercial
        out = await texto(COMERCIAL, '/vincular TSTCOD')
        check('Vinculación con código temporal', /vinculada/i.test(textos(out)), textos(out))
        const { data: lc2 } = await admin.from('telegram_links').select('linked, chat_id, link_code').eq('id', lCom.id).single()
        check('El código se consume (un solo uso)', lc2.linked && lc2.chat_id === String(COMERCIAL) && !lc2.link_code)

        // 3. Panel y consultas
        out = await texto(OWNER, '/inicio')
        check('/inicio muestra panel con botones', botones(out).length >= 8, botones(out).map(b => b.text).join(' | '))
        const outCom = await texto(COMERCIAL, '/inicio')
        check('Botones según permisos (comercial sin Cobros)', !botones(outCom).some(b => b.callback_data === 'm:cobros'))
        out = await texto(OWNER, '/vencidas')
        check('/vencidas lista la factura vencida', /FAC-90-2026/.test(textos(out)), textos(out))
        out = await texto(COMERCIAL, '/vencidas')
        check('Comercial sin permisos económicos no ve cobros', /no tiene acceso/.test(textos(out)))
        out = await texto(OWNER, '/hoy')
        check('/hoy responde', /Hoy/.test(textos(out)))
        out = await texto(OWNER, '/resumen')
        check('/resumen responde con cifras', /Pendiente de cobro/.test(textos(out)))
        out = await texto(OWNER, `/cliente ${cli.razon_social.slice(0, 6)}`)
        check('/cliente muestra ficha', new RegExp(cli.razon_social).test(textos(out)))

        // 4. Marcar pagada con confirmación, método y botón caducado
        out = await texto(OWNER, '/pagada 90')
        const okBtn = cb(out, 'ok:')
        check('/pagada 90 prepara el cobro con botones', !!okBtn && /1\.?210,00/.test(textos(out)), botones(out).map(b => b.text).join(' | '))
        const accionId = okBtn.split(':')[1]
        out = await boton(OWNER, `mt:${accionId}:transferencia`)
        check('Elegir método de pago', /Transferencia/.test(textos(out)))
        out = await boton(OWNER, `ok:${accionId}`)
        check('Confirmar → cobro registrado y factura PAGADA', /registrado/.test(textos(out)) && /PAGADA/.test(textos(out)), textos(out))
        const { data: f90b } = await admin.from('facturas').select('estado_cobro, importe_cobrado').eq('id', f90.id).single()
        check('La factura queda pagada en la base de datos', f90b.estado_cobro === 'pagada')
        const { data: cobros90 } = await admin.from('cobros').select('origen, metodo, usuario_nombre').eq('factura_id', f90.id)
        check('Cobro guarda origen Telegram, método y usuario', cobros90.length === 1 && cobros90[0].origen === 'telegram' && cobros90[0].metodo === 'transferencia', JSON.stringify(cobros90))
        out = await boton(OWNER, `ok:${accionId}`)
        const { count: n90 } = await admin.from('cobros').select('id', { count: 'exact', head: true }).eq('factura_id', f90.id)
        check('Pulsar el botón otra vez NO duplica el cobro', n90 === 1)

        // 5. Update duplicado (reintento de Telegram)
        const upd = { update_id: ++updateId, message: { message_id: 1, chat: { id: OWNER, type: 'private' }, from: { id: OWNER }, text: '/hoy' } }
        const post = () => fetch(`${APP}/api/telegram/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET }, body: JSON.stringify(upd) })
        let antes = salida.length; await post(); const primera = salida.length - antes
        antes = salida.length; await post(); const segunda = salida.length - antes
        check('Mensaje duplicado (mismo update_id) se ignora', primera > 0 && segunda === 0, `${primera} / ${segunda}`)
        const sinSecreto = await fetch(`${APP}/api/telegram/webhook`, { method: 'POST', body: '{}' })
        check('Webhook sin secreto rechazado', sinSecreto.status === 401)

        // 6. Pago parcial
        out = await boton(OWNER, `par:${f91.id}`)
        check('Pago parcial pide el importe', /importe/.test(textos(out)))
        out = await texto(OWNER, '300')
        const okPar = cb(out, 'ok:')
        check('Importe parcial preparado', !!okPar && /300,00/.test(textos(out)), textos(out))
        out = await boton(OWNER, okPar)
        const { data: f91b } = await admin.from('facturas').select('estado_cobro, importe_cobrado').eq('id', f91.id).single()
        check('Factura parcialmente pagada (300 de 1.210)', f91b.estado_cobro === 'parcial' && Number(f91b.importe_cobrado) === 300, JSON.stringify(f91b))

        // 7. Comercial intenta marcar pagada → propuesta + aviso a administración
        out = await texto(COMERCIAL, '/pagada 91')
        const okCom = cb(out, 'ok:')
        check('Comercial ve aviso de que será propuesta', /propuesta/.test(textos(out)))
        antes = salida.length
        out = await boton(COMERCIAL, okCom)
        check('Comercial: queda como PROPUESTA', /PROPUESTA/.test(textos(out)), textos(out))
        const avisos = salida.slice(antes).filter(s => String(s.chat_id) === String(OWNER))
        check('Administración recibe el aviso con botón para confirmar', avisos.some(a => /Propuesta de cobro/.test(a.text || '') && botones([a]).some(b => b.callback_data?.startsWith('cpc:'))))
        const { data: f91c } = await admin.from('facturas').select('importe_cobrado').eq('id', f91.id).single()
        check('La propuesta NO cambia el cobrado', Number(f91c.importe_cobrado) === 300)
        const cpc = botones(avisos).find(b => b.callback_data?.startsWith('cpc:'))?.callback_data
        await boton(OWNER, cpc)
        const { data: f91d } = await admin.from('facturas').select('estado_cobro').eq('id', f91.id).single()
        check('Propietario confirma la propuesta → pagada', f91d.estado_cobro === 'pagada')

        // 8. Ticket (PDF) → borrador de gasto → IVA → guardar
        const { jsPDF } = require('jspdf/dist/jspdf.node.min.js')
        const pdf = new jsPDF()
        ;['FERRETERIA LOPEZ S.L.', 'CIF: B12345678', 'C/ Mayor 3, Murcia', 'FACTURA SIMPLIFICADA N. T-2026-0457', 'Fecha: 20/09/2026', '', 'Tornillos inox M8 (caja 100)      41,32', 'Brocas HSS 8 mm                    8,68', '', 'BASE IMPONIBLE: 50,00 EUR', 'IVA 21%: 10,50 EUR', 'TOTAL: 60,50 EUR', 'Cliente: EMPRESA X, S.L. NIF B00000000'].forEach((l, i) => pdf.text(l, 15, 20 + i * 8))
        archivos['ticket1'] = { buffer: Buffer.from(pdf.output('arraybuffer')), path: 'documents/ticket1.pdf' }
        out = await doc(OWNER, 'ticket1', 'application/pdf')
        const okG = cb(out, 'ok:')
        check('Foto/PDF de ticket → borrador de gasto', !!okG && /FERRETERIA LOPEZ/i.test(textos(out)) && /60,50/.test(textos(out)), textos(out))
        out = await boton(OWNER, `cat:${okG.split(':')[1]}:0`)
        check('Asignar categoría con botón', /Material/.test(textos(out)))
        out = await boton(OWNER, okG)
        const { data: gasto } = await admin.from('gastos').select('id, proveedor, total, categoria, archivo_url, origen, proveedor_id').eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false }).limit(1).single()
        limpieza.gastos.push(gasto.id)
        check('Gasto guardado con documento privado y proveedor enlazado', Number(gasto.total) === 60.5 && gasto.categoria === 'Material' && gasto.archivo_url?.startsWith('/api/archivos/gastos/') && gasto.origen === 'telegram' && !!gasto.proveedor_id, JSON.stringify(gasto))

        // 9. Justificante con "pagada" → propone cobro de la factura indicada
        const f92 = await mkFac('FAC-92-2026', '2026-10-15')
        archivos['just1'] = { buffer: archivos['ticket1'].buffer, path: 'documents/just1.pdf' }
        out = await doc(OWNER, 'just1', 'application/pdf', 'pagada FAC-92-2026')
        check('Justificante + "pagada" → cobro preparado con justificante', /FAC-92-2026/.test(textos(out)) && /Justificante adjunto/.test(textos(out)), textos(out))
        const noJ = cb(out, 'no:')
        out = await boton(OWNER, noJ)
        check('Cancelar no registra nada', /Cancelado/.test(textos(out)))

        // 10. Nota de voz
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const mp3 = Buffer.from(await (await openai.audio.speech.create({ model: 'tts-1', voice: 'alloy', input: '¿Cuánto tengo pendiente de cobro en total?' })).arrayBuffer())
        archivos['voz1'] = { buffer: mp3, path: 'voice/voz1.mp3' }
        out = await voz(OWNER, 'voz1')
        check('Nota de voz transcrita y respondida', /pendiente/i.test(textos(out)) && out.length >= 2, textos(out))

        // 11. Lenguaje natural: la factura X está pagada
        out = await texto(OWNER, 'La factura 92 está pagada por bizum')
        check('"La factura 92 está pagada" → confirmación con botones', !!cb(out, 'ok:') && /FAC-92-2026/.test(textos(out)), textos(out))
        await boton(OWNER, cb(out, 'no:'))

        // 12. Cron diario (resumen + alertas) sin secreto y con secreto
        const sin = await fetch(`${APP}/api/cron/diario`)
        check('Cron sin secreto rechazado', sin.status === 401)
        antes = salida.length
        const cr = await (await fetch(`${APP}/api/cron/diario`, { headers: { Authorization: 'Bearer cron-test' } })).json()
        const alOwner = salida.slice(antes).filter(s => String(s.chat_id) === String(OWNER))
        check('Cron envía resumen diario', cr.ok && alOwner.some(s => /Buenos días/.test(s.text || '')), JSON.stringify(cr))

        // 13. Desvincular
        out = await boton(COMERCIAL, 'desv:si')
        const { data: lcFin } = await admin.from('telegram_links').select('id').eq('id', lCom.id).maybeSingle()
        check('/desvincular elimina el enlace', !lcFin)
        out = await texto(COMERCIAL, '/inicio')
        check('Tras desvincular ya no hay acceso', /no está vinculado/.test(textos(out)))
    } catch (e) {
        console.error('ERROR EN TEST', e); fail++
    } finally {
        for (const id of limpieza.gastos) await admin.from('gastos').delete().eq('id', id)
        for (const id of limpieza.facturas) { await admin.from('cobros').delete().eq('factura_id', id); await admin.from('facturas').delete().eq('id', id) }
        await admin.from('proveedores').delete().ilike('razon_social', '%FERRETERIA LOPEZ%')
        for (const id of limpieza.links) await admin.from('telegram_links').delete().eq('id', id)
        await admin.from('telegram_links').delete().in('chat_id', [String(OWNER), String(COMERCIAL), String(EXTRANO)])
        for (const u of limpieza.users) { await admin.from('acciones_pendientes').delete().eq('usuario_id', u); await admin.from('auditoria').delete().eq('usuario_id', u); await admin.auth.admin.deleteUser(u) }
        console.log(`\n${ok} OK · ${fail} fallos`)
        mock.close()
    }
})()

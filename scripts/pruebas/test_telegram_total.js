// Trabajar el día entero desde Telegram: informes, albaranes (facturar, PDF),
// presupuestos (aceptar, pasar a albarán), albaranes/partes FIRMADOS por foto/PDF
// unidos a su albarán y factura, expediente PDF y lenguaje natural (crear
// albarán, pedir PDF, informe). Telegram simulado en el puerto 3200.
// Arrancar la app con: TELEGRAM_API_BASE=http://localhost:3200 TELEGRAM_BOT_TOKEN=TEST TELEGRAM_WEBHOOK_SECRET=secret-test
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL en .env.local') })()
const http = require('http')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const { createClient } = require('@supabase/supabase-js')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APP = process.env.BASE || 'http://localhost:3100'
const SECRET = 'secret-test'

const salida = [], archivos = {}
let msgId = 5000
const mock = http.createServer((req, res) => {
    const body = []
    req.on('data', c => body.push(c))
    req.on('end', () => {
        const raw = Buffer.concat(body)
        if (req.url.startsWith('/file/')) { const f = Object.values(archivos).find(a => req.url.endsWith(a.path)); res.writeHead(f ? 200 : 404); return res.end(f ? f.buffer : '') }
        const metodo = req.url.match(/\/bot[^/]+\/(\w+)/)?.[1]
        let json = {}
        try { json = JSON.parse(raw.toString() || '{}') } catch { json = { multipart: true, tam: raw.length } }
        if (metodo === 'getFile') { const a = archivos[json.file_id]; res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, result: { file_id: json.file_id, file_path: a.path, file_size: a.buffer.length } })) }
        salida.push({ metodo, ...json })
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: { message_id: ++msgId } }))
    })
})
let updateId = Math.floor(Date.now() / 1000) * 10 + 7
async function upd(update) {
    const desde = salida.length
    const r = await fetch(`${APP}/api/telegram/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET }, body: JSON.stringify({ update_id: ++updateId, ...update }) })
    if (r.status !== 200) console.log('webhook HTTP', r.status)
    return salida.slice(desde).filter(s => s.metodo !== 'sendChatAction')
}
const CHAT = 999000777
const texto = t => upd({ message: { message_id: ++msgId, chat: { id: CHAT, type: 'private' }, from: { id: CHAT, first_name: 'Test' }, text: t } })
const boton = data => upd({ callback_query: { id: 'cb' + (++msgId), data, from: { id: CHAT }, message: { message_id: 777, chat: { id: CHAT, type: 'private' } } } })
const doc = (fileId, mime, caption, nombre = 'doc.pdf') => upd({ message: { message_id: ++msgId, chat: { id: CHAT, type: 'private' }, from: { id: CHAT }, document: { file_id: fileId, mime_type: mime, file_name: nombre }, caption } })
const botones = out => out.flatMap(o => (o.reply_markup?.inline_keyboard || []).flat())
const textos = out => out.map(o => o.text || '').join('\n---\n')
const cb = (out, prefijo, filtro = () => true) => botones(out).find(b => b.callback_data?.startsWith(prefijo) && filtro(b))?.callback_data
const pdfs = out => out.filter(o => o.metodo === 'sendDocument')

let ok = 0, fail = 0
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + String(x).slice(0, 180).replace(/\n/g, ' ⏎ ') : ''}`) }

async function albaranFirmadoPdf(numero, cliente) {
    const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica), b = await d.embedFont(StandardFonts.HelveticaBold)
    const p = d.addPage([595, 842])
    p.drawText('EMPRESA X, S.L.  -  ALBARAN DE ENTREGA', { x: 50, y: 790, size: 16, font: b })
    p.drawText(`Albaran n.: ${numero}      Fecha: 22/09/2026`, { x: 50, y: 750, size: 12, font: f })
    p.drawText(`Cliente: ${cliente}`, { x: 50, y: 730, size: 12, font: f })
    p.drawText('10 x Eje D40x120 acero C45', { x: 50, y: 690, size: 11, font: f })
    p.drawText('Recibido conforme. Falta 1 caja de tornillos (anotado por el cliente).', { x: 50, y: 520, size: 11, font: f })
    p.drawText('Recibido por: Juan Perez Lopez   DNI 12345678Z', { x: 50, y: 480, size: 11, font: f })
    p.drawText('Firma:', { x: 50, y: 440, size: 11, font: f })
    for (let i = 0; i < 6; i++) p.drawLine({ start: { x: 100 + i * 18, y: 430 + (i % 2) * 14 }, end: { x: 118 + i * 18, y: 444 - (i % 2) * 14 }, thickness: 1.6, color: rgb(0.05, 0.1, 0.5) })
    return Buffer.from(await d.save())
}

;(async () => {
    await new Promise(r => mock.listen(3200, r))
    const { data: perfil } = await admin.from('perfiles').select('user_id, empresa_id').eq('email', EMAIL_PRUEBA).single()
    const { data: cli } = await admin.from('contactos').select('*').eq('empresa_id', perfil.empresa_id).limit(1).single()
    const { data: contadoresAntes } = await admin.from('contadores').select('*')
    const L = { albaranes: [], facturas: [], presupuestos: [], firmados: [] }
    const inicioPrueba = new Date().toISOString()
    try {
        const { data: link } = await admin.from('telegram_links').insert({ chat_id: String(CHAT), linked: true, user_id: perfil.user_id, empresa_id: perfil.empresa_id, conversation: [] }).select().single()
        const base = { empresa_id: perfil.empresa_id, cliente_id: cli.id, cliente_razon_social: cli.razon_social, cliente_cif: cli.cif, lineas: [{ descripcion: 'Eje Ø40×120 C45', cantidad: 10, precio_unitario: 18.5 }], subtotal: 185, base_imponible: 185, iva_porcentaje: 21, iva_importe: 38.85, total: 223.85, statuses: ['pendiente'], estado_vida: 'Pendiente' }
        const { data: alb } = await admin.from('albaranes').insert({ ...base, numero: 'ALB-97-2026', fecha: '2026-09-22' }).select().single(); L.albaranes.push(alb.id)
        const { data: pre } = await admin.from('presupuestos').insert({ ...base, numero: 'PRE-97-2026', fecha: '2026-09-20', aceptado: false, rechazado: false }).select().single(); L.presupuestos.push(pre.id)

        // Panel
        let out = await texto('/inicio')
        const bs = botones(out).map(b => b.text).join(' | ')
        check('Panel con Albaranes, Subir firmado e Informes', /Albaranes/.test(bs) && /Subir firmado/.test(bs) && /Informes/.test(bs), bs)

        // Informes
        out = await texto('/informe')
        check('/informe ofrece periodos', !!cb(out, 'inf:trimestre') && !!cb(out, 'inf:m:'))
        out = await boton('inf:este_mes')
        check('Informe del mes con comparación', /Facturado/.test(textos(out)) && /vs /.test(textos(out)), textos(out))
        out = await texto('/informe marzo')
        check('/informe marzo → marzo', /Marzo 2026/.test(textos(out)), textos(out).slice(0, 80))
        out = await boton('inf:trimestre_anterior')
        check('Trimestre anterior', /2º trimestre 2026/.test(textos(out)))

        // Albaranes: detalle y facturar
        out = await texto('/albaranes')
        check('/albaranes lista el albarán sin facturar', /ALB-97-2026/.test(textos(out)) && !!cb(out, `alb:${alb.id}`))
        out = await boton(`alb:${alb.id}`)
        check('Detalle de albarán con Facturar y Subir firmado', !!cb(out, `cnv:af:${alb.id}`) && !!cb(out, `fir:${alb.id}`), textos(out))
        out = await boton(`pdf:a:${alb.id}`)
        check('PDF del albarán enviado', pdfs(out).length === 1)
        out = await boton(`cnv:af:${alb.id}`)
        check('Facturar pide confirmación', !!cb(out, 'ok:') && /Convertir albarán ALB-97-2026/.test(textos(out)), textos(out))
        out = await boton(cb(out, 'ok:'))
        const { data: fac } = await admin.from('facturas').select('*').filter('albaran_ids', 'cs', JSON.stringify([alb.id])).maybeSingle()
        if (fac) L.facturas.push(fac.id)
        check('Factura creada desde el albarán', !!fac && Number(fac.total) === 223.85 && !!fac.fecha_vencimiento, fac?.numero)
        check('Tras crear, botón con su PDF', !!cb(out, `pdf:f:${fac?.id}`), textos(out))

        // Firmado: PDF del albarán firmado con pie «albarán firmado»
        archivos['FIRM1'] = { path: 'documents/firmado1.pdf', buffer: await albaranFirmadoPdf('ALB-97-2026', cli.razon_social) }
        out = await doc('FIRM1', 'application/pdf', 'albarán firmado', 'firmado1.pdf')
        const t = textos(out)
        check('Firmado leído por la IA con propuesta de unión', /firmado/i.test(t) && /ALB-97-2026/.test(t) && !!cb(out, 'frm:'), t)
        check('Propone unir al albarán correcto (preseleccionado)', botones(out).some(b => /^✅ Alb\. ALB-97-2026/.test(b.text)), botones(out).map(b => b.text).join(' | '))
        check('Detecta firmante e incidencia', /Juan P[eé]rez/i.test(t) && /caja|falta/i.test(t), t)
        out = await boton(cb(out, 'ok:'))
        check('Guardado y unido', /unido a albarán ALB-97-2026/.test(textos(out)) && new RegExp(fac?.numero).test(textos(out)), textos(out))
        const { data: firm } = await admin.from('albaranes_firmados').select('*').eq('albaran_id', alb.id).maybeSingle()
        if (firm) L.firmados.push(firm)
        check('Registro con albarán, factura, firmante e incidencias', firm?.factura_id === fac?.id && /juan/i.test(firm?.firmante_nombre || '') && firm?.con_incidencias && firm?.origen === 'telegram', JSON.stringify({ f: firm?.factura_id, n: firm?.firmante_nombre, i: firm?.incidencias }))
        const { data: albF } = await admin.from('albaranes').select('firmado_at, firmado_por, documento_firmado_url').eq('id', alb.id).single()
        const { data: facF } = await admin.from('facturas').select('soportes_firmados').eq('id', fac.id).single()
        check('Albarán marcado como firmado', !!albF.firmado_at && !!albF.documento_firmado_url)
        check('Factura con soporte firmado', /firmado/.test(facF.soportes_firmados || ''), facF.soportes_firmados)

        // Expediente
        out = await boton(`fac:${fac.id}`)
        check('Factura muestra soporte firmado y Expediente', /Soporte firmado/.test(textos(out)) && !!cb(out, `exp:${fac.id}`))
        out = await boton(`exp:${fac.id}`)
        check('Expediente PDF enviado', pdfs(out).length === 1 && pdfs(out)[0].tam > 5000, JSON.stringify(pdfs(out)[0] || {}))

        // Firmado sin pistas → pedir número por texto
        archivos['FIRM2'] = { path: 'documents/firmado2.pdf', buffer: await albaranFirmadoPdf('S/N', 'Cliente desconocido') }
        await texto('/firmado')
        out = await doc('FIRM2', 'application/pdf', '', 'parte.pdf')
        check('/firmado + archivo sin pie → flujo de firmado', !!cb(out, 'frm:') && /No unir ahora/.test(botones(out).map(b => b.text).join('|')), textos(out))
        out = await texto('ALB-97-2026')
        check('Escribir el número elige el destino', botones(out).some(b => /^✅ Alb\. ALB-97-2026/.test(b.text)), botones(out).map(b => b.text).join(' | '))
        out = await boton(cb(out, 'no:'))
        check('Cancelar no guarda nada', (await admin.from('albaranes_firmados').select('id').eq('albaran_id', alb.id)).data.length === 1)

        // Presupuestos: aceptar y pasar a albarán
        out = await texto('/presupuestos')
        check('Presupuestos con Aceptado y A albarán', !!cb(out, `pac:${pre.id}`) && !!cb(out, `cnv:pa:${pre.id}`))
        out = await boton(`pac:${pre.id}`); out = await boton(cb(out, 'ok:'))
        check('Presupuesto aceptado', (await admin.from('presupuestos').select('aceptado').eq('id', pre.id).single()).data.aceptado === true, textos(out))
        out = await boton(`cnv:pa:${pre.id}`); out = await boton(cb(out, 'ok:'))
        const { data: alb2 } = await admin.from('albaranes').select('id, numero, total').eq('presupuesto_id', pre.id).maybeSingle()
        if (alb2) L.albaranes.push(alb2.id)
        check('Presupuesto convertido en albarán', !!alb2 && Number(alb2.total) === 223.85, alb2?.numero)

        // Lenguaje natural
        out = await texto(`Hazle un albarán a ${cli.razon_social} de 3 casquillos de bronce a 12 euros`)
        check('IA prepara albarán nuevo con confirmación', !!cb(out, 'ok:') && /Albarán nuevo/.test(textos(out)) && /36,00/.test(textos(out)), textos(out))
        const { data: pendAntes } = await admin.from('acciones_pendientes').select('id, tipo, estado, created_at').eq('usuario_id', perfil.user_id).eq('estado', 'pendiente').order('created_at', { ascending: false })
        const { data: lk } = await admin.from('telegram_links').select('conversation, estado_conversacion').eq('chat_id', String(CHAT)).single()
        const diag = JSON.stringify({ pend: pendAntes.map(a => a.tipo + ':' + a.id.slice(0, 6)), ultimo: (lk.conversation || []).slice(-2).map(m => m.role + ':' + (m.accion_id || '').slice(0, 6)), estado: lk.estado_conversacion })
        out = await texto('sí')
        const { data: alb3 } = await admin.from('albaranes').select('id, numero, total').eq('cliente_id', cli.id).gte('created_at', inicioPrueba).neq('id', alb2?.id || '00000000-0000-0000-0000-000000000000').order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (alb3 && !L.albaranes.includes(alb3.id)) L.albaranes.push(alb3.id)
        check('«sí» crea el albarán', !!alb3 && Number(alb3.total) === 43.56, `${alb3?.numero} ${alb3?.total} · ${diag} · ${textos(out)}`)
        out = await texto('pásame el PDF de la factura ' + fac.numero)
        check('IA envía el PDF pedido', pdfs(out).length === 1, textos(out))
        out = await texto('¿cómo va este mes comparado con el anterior?')
        check('IA responde el informe con cifras', /€/.test(textos(out)), textos(out))
        out = await texto('¿qué albaranes tengo sin firmar?')
        check('IA conoce el control de firmas', /albar/i.test(textos(out)), textos(out))
        await admin.from('telegram_links').delete().eq('id', link.id)
    } catch (e) {
        console.error('ERROR EN TEST', e); fail++
    } finally {
        for (const f of L.firmados) { const m = f.archivo_url?.match(/api\/archivos\/albaranes-firmados\/(.+)$/); if (m) await admin.storage.from('albaranes-firmados').remove([decodeURIComponent(m[1])]) }
        const { data: resto } = await admin.from('albaranes_firmados').select('id, archivo_url').gte('created_at', inicioPrueba).eq('empresa_id', perfil.empresa_id)
        for (const f of resto || []) { const m = f.archivo_url?.match(/api\/archivos\/albaranes-firmados\/(.+)$/); if (m) await admin.storage.from('albaranes-firmados').remove([decodeURIComponent(m[1])]) }
        await admin.from('albaranes_firmados').delete().gte('created_at', inicioPrueba).eq('empresa_id', perfil.empresa_id)
        for (const id of L.facturas) { await admin.from('cobros').delete().eq('factura_id', id); await admin.from('albaranes').update({ factura_id: null }).eq('factura_id', id); await admin.from('facturas').delete().eq('id', id) }
        for (const id of L.albaranes) await admin.from('albaranes').delete().eq('id', id)
        for (const id of L.presupuestos) await admin.from('presupuestos').delete().eq('id', id)
        await admin.from('telegram_links').delete().eq('chat_id', String(CHAT))
        await admin.from('acciones_pendientes').delete().gte('created_at', inicioPrueba).eq('usuario_id', perfil.user_id)
        for (const c of contadoresAntes || []) await admin.from('contadores').update({ ultimo_numero: c.ultimo_numero }).eq('tipo', c.tipo).eq('anio', c.anio)
        console.log(`\n${ok} OK · ${fail} fallos`)
        mock.close()
        process.exit(fail ? 1 : 0)
    }
})()

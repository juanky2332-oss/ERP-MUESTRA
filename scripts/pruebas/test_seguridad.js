require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL (usuario propietario con el que probar) en .env.local') })()
const { createClient } = require('@supabase/supabase-js')
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let ok = 0, fail = 0
const check = (nombre, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? '✅' : '❌'} ${nombre}${extra ? ' — ' + extra : ''}`) }

async function sesion(email) {
    const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    const { data: v, error } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' })
    if (error) throw error
    return createClient(URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${v.session.access_token}` } } })
}

;(async () => {
    const creados = { users: [], empresa: null }
    try {
        // 0) Anónimo sin sesión
        const anon = createClient(URL, ANON, { auth: { persistSession: false } })
        const { data: fa } = await anon.from('facturas').select('id')
        check('Anónimo no ve facturas', (fa || []).length === 0)
        const { error: ia } = await anon.from('contactos').insert({ razon_social: 'HACK', cif: 'X1' })
        check('Anónimo no puede insertar clientes', !!ia)
        const { data: fl } = await anon.storage.from('gastos').list('')
        check('Anónimo no lista archivos', !fl || fl.length === 0)

        // 1) Empresa B con dos usuarios: comercial y finanzas
        const { data: empB } = await admin.from('empresas').insert({ nombre: 'EMPRESA B TEST' }).select().single()
        creados.empresa = empB.id
        const mk = async (email, rol) => {
            const { data: u } = await admin.auth.admin.createUser({ email, password: 'TestPass!12345', email_confirm: true })
            creados.users.push(u.user.id)
            await admin.from('perfiles').insert({ user_id: u.user.id, empresa_id: empB.id, email, nombre: rol, rol })
            return u.user.id
        }
        await mk('test-comercial-b@erp-test.local', 'comercial')
        await mk('test-finanzas-b@erp-test.local', 'finanzas')
        await mk('test-lectura-b@erp-test.local', 'lectura')

        const A = await sesion(EMAIL_PRUEBA)
        const Bcom = await sesion('test-comercial-b@erp-test.local')
        const Bfin = await sesion('test-finanzas-b@erp-test.local')
        const Blec = await sesion('test-lectura-b@erp-test.local')

        // 2) Aislamiento
        const { data: facA } = await A.from('facturas').select('id, numero')
        check('Empresa A ve sus facturas', (facA || []).length >= 1, `${(facA || []).length} factura(s)`)
        const { data: facB } = await Bcom.from('facturas').select('id')
        check('Empresa B NO ve facturas de A', (facB || []).length === 0)

        const { data: cliB, error: e1 } = await Bcom.from('contactos').insert({ razon_social: 'Cliente de B', cif: 'B-TEST-1' }).select().single()
        check('Comercial B crea cliente (empresa por defecto la suya)', !e1 && cliB?.empresa_id === empB.id, e1?.message)
        const { data: verDesdeA } = await A.from('contactos').select('id').eq('id', cliB?.id || '00000000-0000-0000-0000-000000000000')
        check('Empresa A NO ve clientes de B', (verDesdeA || []).length === 0)

        const { error: eCross } = await Bcom.from('contactos').insert({ razon_social: 'Colado', cif: 'X9', empresa_id: facA?.[0] ? (await admin.from('facturas').select('empresa_id').eq('id', facA[0].id).single()).data.empresa_id : null })
        check('B no puede insertar datos en la empresa A', !!eCross)

        const { data: upd } = await Bcom.from('facturas').update({ total: 1 }).eq('id', facA?.[0]?.id).select('id')
        check('B no puede modificar facturas de A', (upd || []).length === 0)

        // 3) Rol solo lectura
        const { error: eLec } = await Blec.from('contactos').insert({ razon_social: 'no', cif: 'NO-1' })
        check('Solo lectura no puede crear clientes', !!eLec)

        // 4) Cobros: factura en B, comercial vs finanzas
        const { data: facturaB } = await Bfin.from('facturas').insert({ numero: 'FAC-99-2026', fecha: '2026-09-01', fecha_vencimiento: '2026-09-10', cliente_id: cliB.id, cliente_razon_social: 'Cliente de B', lineas: [], subtotal: 1000, iva_importe: 210, total: 1210, statuses: ['pendiente'] }).select().single()
        check('Finanzas B crea factura de prueba', !!facturaB)
        const { error: eConf } = await Bcom.from('cobros').insert({ factura_id: facturaB.id, importe: 100, estado: 'confirmado' })
        check('Comercial NO puede confirmar cobros', !!eConf)
        const { error: eProp } = await Bcom.from('cobros').insert({ factura_id: facturaB.id, importe: 100, estado: 'propuesto' })
        check('Comercial SÍ puede proponer cobros', !eProp, eProp?.message)
        let { data: f1 } = await Bfin.from('facturas').select('importe_cobrado, estado_cobro').eq('id', facturaB.id).single()
        check('Un cobro propuesto no cambia la factura', Number(f1.importe_cobrado) === 0 && f1.estado_cobro === 'pendiente')

        await Bfin.from('cobros').insert({ factura_id: facturaB.id, importe: 300, estado: 'confirmado' })
        ;({ data: f1 } = await Bfin.from('facturas').select('importe_cobrado, estado_cobro, pagada, statuses').eq('id', facturaB.id).single())
        check('Pago parcial 300 → parcial', Number(f1.importe_cobrado) === 300 && f1.estado_cobro === 'parcial', JSON.stringify(f1))
        await Bfin.from('cobros').insert({ factura_id: facturaB.id, importe: 300, estado: 'confirmado' })
        ;({ data: f1 } = await Bfin.from('facturas').select('importe_cobrado, estado_cobro').eq('id', facturaB.id).single())
        check('Segundo parcial → cobrado 600', Number(f1.importe_cobrado) === 600 && f1.estado_cobro === 'parcial')
        await Bfin.from('cobros').insert({ factura_id: facturaB.id, importe: 610, estado: 'confirmado', idempotency_key: 'k1' })
        ;({ data: f1 } = await Bfin.from('facturas').select('importe_cobrado, estado_cobro, pagada, statuses').eq('id', facturaB.id).single())
        check('Saldo restante → PAGADA', f1.estado_cobro === 'pagada' && f1.pagada === true && f1.statuses.includes('pagada'), JSON.stringify(f1))
        const { error: eDup } = await Bfin.from('cobros').insert({ factura_id: facturaB.id, importe: 1, estado: 'confirmado', idempotency_key: 'k1' })
        check('Clave de idempotencia evita cobro duplicado', eDup?.code === '23505')
        const { data: c3 } = await Bfin.from('cobros').select('id').eq('idempotency_key', 'k1').single()
        await Bfin.from('cobros').update({ estado: 'anulado' }).eq('id', c3.id)
        ;({ data: f1 } = await Bfin.from('facturas').select('importe_cobrado, estado_cobro').eq('id', facturaB.id).single())
        check('Anular un cobro recalcula (vuelve a parcial 600)', Number(f1.importe_cobrado) === 600 && f1.estado_cobro === 'parcial')

        // 5) Auditoría inalterable
        await Bfin.from('auditoria').insert({ accion: 'test', entidad: 'x' })
        const { data: aud } = await Bfin.from('auditoria').select('id').eq('accion', 'test').single()
        const { data: audDel } = await Bfin.from('auditoria').delete().eq('id', aud.id).select('id')
        check('La auditoría no se puede borrar', (audDel || []).length === 0)

        // 6) Almacenamiento privado por empresa
        const blob = new Blob(['hola'], { type: 'text/plain' })
        const { error: eUpOtra } = await Bfin.storage.from('justificantes').upload(`otra-carpeta/x.txt`, blob)
        check('No se puede subir fuera de la carpeta de la empresa', !!eUpOtra)
        const { error: eUpPropia } = await Bfin.storage.from('justificantes').upload(`${empB.id}/test/x.pdf`, new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
        check('Sí se puede subir en la carpeta propia', !eUpPropia, eUpPropia?.message)
        const { data: pubUrl } = Bfin.storage.from('justificantes').getPublicUrl(`${empB.id}/test/x.pdf`)
        const r = await fetch(pubUrl.publicUrl)
        check('No hay acceso público al archivo', r.status >= 400, `HTTP ${r.status}`)
        const { data: dlA, error: eDlA } = await A.storage.from('justificantes').download(`${empB.id}/test/x.pdf`)
        check('Empresa A no puede descargar archivos de B', !!eDlA || !dlA)
        const { data: signed } = await Bfin.storage.from('justificantes').createSignedUrl(`${empB.id}/test/x.pdf`, 60)
        const r2 = await fetch(signed.signedUrl)
        check('URL firmada temporal funciona para su empresa', r2.status === 200)
        await admin.storage.from('justificantes').remove([`${empB.id}/test/x.pdf`])

        // 7) Tablas internas cerradas
        const { data: tl } = await A.from('telegram_links').select('id')
        check('telegram_links no es accesible ni para usuarios (solo servidor)', (tl || []).length === 0)
    } catch (e) {
        console.error('ERROR EN TEST', e)
        fail++
    } finally {
        // Limpieza
        if (creados.empresa) {
            for (const t of ['auditoria', 'cobros', 'facturas', 'contactos', 'avisos_mostrados']) await admin.from(t).delete().eq('empresa_id', creados.empresa)
        }
        for (const u of creados.users) await admin.auth.admin.deleteUser(u)
        if (creados.empresa) await admin.from('empresas').delete().eq('id', creados.empresa)
        console.log(`\n${ok} OK · ${fail} fallos`)
    }
})()

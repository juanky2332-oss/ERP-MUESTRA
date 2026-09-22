// Genera la cabecera Cookie de una sesión real de Supabase para probar la app por HTTP.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local'), quiet: true })
const EMAIL_PRUEBA = process.env.TEST_USER_EMAIL || (() => { throw new Error('Define TEST_USER_EMAIL (usuario propietario con el que probar) en .env.local') })()
const { createClient } = require('@supabase/supabase-js')
const { createServerClient } = require('@supabase/ssr')
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

module.exports = async function cookieDe(email) {
    const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    const { data: v, error } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' })
    if (error) throw error
    let jar = []
    const ssr = createServerClient(URL, ANON, { cookies: { getAll: () => jar, setAll: (c) => { jar = c.map(x => ({ name: x.name, value: x.value })) } } })
    await ssr.auth.setSession({ access_token: v.session.access_token, refresh_token: v.session.refresh_token })
    return jar.map(c => `${c.name}=${c.value}`).join('; ')
}

if (require.main === module) module.exports(process.argv[2] || EMAIL_PRUEBA).then(c => console.log(c.slice(0, 80) + '…'))

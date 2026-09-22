'use server'

import { revalidatePath } from 'next/cache'
import { randomInt } from 'crypto'
import { getContexto, requirePermiso, mensajeError } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { auditar } from '@/lib/auditoria'
import { tienePermiso, ROLES, type Rol } from '@/lib/permisos'
import { enviarCorreo, getEmpresa } from '@/lib/email/mailer'

export async function getAjustes() {
    try {
        const ctx = await getContexto()
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
        const [{ data: empresa }, { data: usuarios }, { data: uso }, { data: auditoria }] = await Promise.all([
            ctx.supabase.from('empresas').select('*').eq('id', ctx.empresaId).single(),
            ctx.supabase.from('perfiles').select('user_id, nombre, email, rol, activo, created_at').order('created_at'),
            ctx.supabase.from('ia_uso').select('accion, coste_estimado, tokens_entrada, tokens_salida').gte('created_at', inicioMes.toISOString()),
            tienePermiso(ctx.rol, 'ajustes')
                ? ctx.supabase.from('auditoria').select('id, created_at, usuario_nombre, origen, accion, entidad, entidad_ref').order('created_at', { ascending: false }).limit(40)
                : Promise.resolve({ data: [] }),
        ])
        const usoIA = {
            peticiones: (uso || []).length,
            coste: Math.round((uso || []).reduce((a: number, u: any) => a + Number(u.coste_estimado || 0), 0) * 100) / 100,
            porAccion: Object.entries((uso || []).reduce((m: Record<string, number>, u: any) => ({ ...m, [u.accion]: (m[u.accion] || 0) + 1 }), {})),
        }
        return {
            success: true as const,
            empresa, usuarios: usuarios || [], usoIA, auditoria: auditoria || [],
            yo: { userId: ctx.userId, rol: ctx.rol, nombre: ctx.nombre, email: ctx.email },
            puedeAjustes: tienePermiso(ctx.rol, 'ajustes'),
        }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

const CAMPOS_EMPRESA = ['nombre', 'nombre_comercial', 'nif', 'email', 'telefono', 'direccion', 'web', 'color_principal', 'color_documentos', 'iban', 'mostrar_iban_factura', 'pie_documentos', 'texto_factura', 'condiciones_presupuesto', 'mensaje_bienvenida', 'plantilla_reclamacion_asunto', 'plantilla_reclamacion_cuerpo', 'ia_activa', 'ia_limite_mensual'] as const

export async function guardarEmpresa(datos: any) {
    try {
        const ctx = await requirePermiso('ajustes')
        const payload: any = {}
        for (const k of CAMPOS_EMPRESA) if (k in datos) payload[k] = typeof datos[k] === 'string' ? datos[k].trim() : datos[k]
        if ('ia_limite_mensual' in payload) payload.ia_limite_mensual = Math.max(0, Number(payload.ia_limite_mensual) || 0)
        for (const c of ['color_principal', 'color_documentos']) if (payload[c] && !/^#[0-9a-f]{6}$/i.test(payload[c])) throw new Error('Color no válido (usa formato #RRGGBB).')
        const { error } = await ctx.supabase.from('empresas').update(payload).eq('id', ctx.empresaId)
        if (error) throw error
        await auditar(ctx, 'empresa_editada', { tipo: 'empresa', id: ctx.empresaId }, payload)
        revalidatePath('/', 'layout')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function guardarMiPerfil(datos: { nombre?: string; tema?: string }) {
    try {
        const ctx = await getContexto()
        const admin = createAdminClient()
        const update: any = {}
        if (datos.nombre?.trim()) update.nombre = datos.nombre.trim()
        if (datos.tema) update.tema = datos.tema
        await admin.from('perfiles').update(update).eq('user_id', ctx.userId)
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

export async function cambiarRolUsuario(userId: string, rol: Rol, activo = true) {
    try {
        const ctx = await requirePermiso('ajustes')
        if (!ROLES.some(r => r.value === rol)) throw new Error('Rol no válido')
        const admin = createAdminClient()
        const { data: objetivo } = await admin.from('perfiles').select('empresa_id, rol, email').eq('user_id', userId).maybeSingle()
        if (!objetivo || objetivo.empresa_id !== ctx.empresaId) throw new Error('Usuario no encontrado en tu empresa.')
        if (objetivo.rol === 'propietario' && ctx.rol !== 'propietario') throw new Error('Solo un propietario puede cambiar a otro propietario.')
        if (rol === 'propietario' && ctx.rol !== 'propietario') throw new Error('Solo un propietario puede nombrar propietarios.')
        if (objetivo.rol === 'propietario' && (rol !== 'propietario' || !activo)) {
            const { count } = await admin.from('perfiles').select('user_id', { count: 'exact', head: true }).eq('empresa_id', ctx.empresaId).eq('rol', 'propietario').eq('activo', true)
            if ((count || 0) <= 1) throw new Error('Debe quedar al menos un propietario activo.')
        }
        await admin.from('perfiles').update({ rol, activo }).eq('user_id', userId)
        await auditar(ctx, 'rol_cambiado', { tipo: 'usuario', id: userId, ref: objetivo.email }, { antes: objetivo.rol, despues: rol, activo })
        revalidatePath('/ajustes')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

function passwordTemporal() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let s = ''
    for (let i = 0; i < 12; i++) s += chars[randomInt(chars.length)]
    return s + '!' + randomInt(10, 99)
}

/** Da de alta a un usuario en la empresa con una contraseña temporal que se le envía por correo. */
export async function invitarUsuario(datos: { email: string; nombre: string; rol: Rol }) {
    try {
        const ctx = await requirePermiso('ajustes')
        const email = datos.email.trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email no válido.')
        if (!ROLES.some(r => r.value === datos.rol)) throw new Error('Rol no válido')
        if (datos.rol === 'propietario' && ctx.rol !== 'propietario') throw new Error('Solo un propietario puede nombrar propietarios.')
        const admin = createAdminClient()
        const pass = passwordTemporal()

        const { data: creado, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true, user_metadata: { nombre: datos.nombre } })
        if (error) throw new Error(/already/i.test(error.message) ? 'Ya existe un usuario con ese email.' : error.message)

        const { error: pErr } = await admin.from('perfiles').insert({ user_id: creado.user.id, empresa_id: ctx.empresaId, email, nombre: datos.nombre?.trim() || email.split('@')[0], rol: datos.rol })
        if (pErr) { await admin.auth.admin.deleteUser(creado.user.id); throw pErr }

        const empresa = await getEmpresa(ctx)
        const url = process.env.NEXT_PUBLIC_APP_URL || 'https://erp-muestra.vercel.app'
        let enviado = true
        try {
            await enviarCorreo({
                to: email,
                subject: `Acceso al ERP de ${empresa.nombre}`,
                cuerpo: `Hola ${datos.nombre || ''},\n\n${ctx.nombre} te ha dado acceso al ERP de ${empresa.nombre}.\n\nEntra en: ${url}/login\nUsuario: ${email}\nContraseña temporal: ${pass}\n\nTe recomendamos cambiarla desde "¿Has olvidado tu contraseña?".\n\nUn saludo.`,
            }, empresa)
        } catch { enviado = false }

        await auditar(ctx, 'usuario_invitado', { tipo: 'usuario', id: creado.user.id, ref: email }, { rol: datos.rol, correo_enviado: enviado })
        revalidatePath('/ajustes')
        return { success: true as const, passwordTemporal: pass, correoEnviado: enviado }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

const TIPOS_LOGO: Record<'app' | 'documentos', { columna: string; formatos: string[] }> = {
    app: { columna: 'logo_app_url', formatos: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] },
    // Los PDF solo admiten PNG/JPEG (el navegador convierte la imagen a PNG antes de subirla).
    documentos: { columna: 'logo_documentos_url', formatos: ['image/png', 'image/jpeg'] },
}

/**
 * Cambia el logo de la app (menú y pantalla de acceso) o el de los documentos
 * (PDF de presupuestos, albaranes y facturas). La interfaz pide confirmación
 * con vista previa antes de llamar aquí; el cambio queda auditado.
 */
export async function subirLogo(formData: FormData) {
    try {
        const ctx = await requirePermiso('ajustes')
        const tipo = formData.get('tipo') as 'app' | 'documentos'
        const file = formData.get('file') as File | null
        const cfg = TIPOS_LOGO[tipo]
        if (!cfg) throw new Error('Tipo de logo no válido')
        if (!file || file.size === 0) throw new Error('No se ha recibido la imagen.')
        if (file.size > 2 * 1024 * 1024) throw new Error('La imagen supera 2 MB.')
        if (!cfg.formatos.includes(file.type)) throw new Error(`Formato no admitido (${file.type || 'desconocido'}). Usa ${cfg.formatos.map(f => f.split('/')[1].toUpperCase()).join(', ')}.`)

        const admin = createAdminClient()
        const ext = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1].replace('jpeg', 'jpg')
        const path = `${ctx.empresaId}/${tipo}-${Date.now()}.${ext}`
        const { error: upErr } = await admin.storage.from('marca').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
        if (upErr) throw new Error('No se pudo subir la imagen: ' + upErr.message)
        const { data: pub } = admin.storage.from('marca').getPublicUrl(path)

        const { data: antes } = await ctx.supabase.from('empresas').select(cfg.columna).eq('id', ctx.empresaId).single()
        const update: any = { [cfg.columna]: pub.publicUrl }
        if (tipo === 'documentos') update.logo_documentos_actualizado_at = new Date().toISOString()
        const { error } = await ctx.supabase.from('empresas').update(update).eq('id', ctx.empresaId)
        if (error) throw error
        await auditar(ctx, tipo === 'app' ? 'logo_app_cambiado' : 'logo_documentos_cambiado', { tipo: 'empresa', id: ctx.empresaId }, { antes: (antes as any)?.[cfg.columna] || null, despues: pub.publicUrl })
        revalidatePath('/', 'layout')
        return { success: true as const, url: pub.publicUrl }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

/** Vuelve al logo por defecto. */
export async function quitarLogo(tipo: 'app' | 'documentos') {
    try {
        const ctx = await requirePermiso('ajustes')
        const cfg = TIPOS_LOGO[tipo]
        if (!cfg) throw new Error('Tipo de logo no válido')
        const update: any = { [cfg.columna]: null }
        if (tipo === 'documentos') update.logo_documentos_actualizado_at = new Date().toISOString()
        const { error } = await ctx.supabase.from('empresas').update(update).eq('id', ctx.empresaId)
        if (error) throw error
        await auditar(ctx, `logo_${tipo}_restablecido`, { tipo: 'empresa', id: ctx.empresaId })
        revalidatePath('/', 'layout')
        return { success: true as const }
    } catch (e) {
        return { success: false as const, error: mensajeError(e) }
    }
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getContextoDeUsuario } from '@/lib/supabase/user-scoped'
import { tienePermiso } from '@/lib/permisos'
import { enviar, esc } from '@/lib/telegram/api'
import { resumenDelMes } from '@/lib/telegram/bot'
import { resumenCobros } from '@/lib/cobros/servidor'
import { hoyISO, sumarDias } from '@/lib/cobros/vencimientos'
import { formatCurrency } from '@/lib/utils'
import { preferencias } from '@/lib/telegram/preferencias'
import { avisosEmpresa } from '@/lib/fiscal/servidor'
import { DIAS_RECORDATORIO_TELEGRAM, fechaES } from '@/lib/fiscal/calendario'

export const maxDuration = 300

/**
 * Tarea diaria (Vercel Cron, 06:00 UTC ≈ 8:00 en Madrid):
 * resumen diario y alertas por Telegram según las preferencias de cada usuario.
 * Nunca envía nada a clientes: solo avisos internos.
 */
export async function GET(req: NextRequest) {
    const auth = req.headers.get('authorization')
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ ok: false }, { status: 401 })
    }
    if (!process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ ok: true, enviados: 0, motivo: 'sin bot' })

    const admin = createAdminClient()
    const { data: links } = await admin.from('telegram_links').select('id, chat_id, user_id, notificaciones').eq('linked', true)
    const hoy = hoyISO()
    const ayer = sumarDias(hoy, -1)
    const en3 = sumarDias(hoy, 3)
    let enviados = 0
    const errores: string[] = []

    for (const link of links || []) {
        if (!link.user_id || !link.chat_id) continue
        const n = preferencias(link.notificaciones)
        // Los plazos de impuestos tienen su propio interruptor: llegan aunque los avisos diarios estén apagados.
        if (!n.avisos_diarios && !n.fiscal) continue
        const diarios = n.avisos_diarios
        try {
            const ctx = await getContextoDeUsuario(link.user_id, 'cron', link.id)
            const eco = tienePermiso(ctx.rol, 'economico')

            if (diarios && n.resumen_diario) {
                await enviar(link.chat_id, `☀️ Buenos días, <b>${esc(ctx.nombre.split(' ')[0])}</b>.\n\n` + await resumenDelMes(ctx),
                    [[{ text: '📅 Ver hoy', callback_data: 'm:hoy' }, ...(eco ? [{ text: '🔴 Vencidas', callback_data: 'm:vencidas' }] : [])], [{ text: '🏠 Inicio', callback_data: 'm:inicio' }]])
                enviados++
            }

            if (diarios && eco && (n.vencidas || n.vencen_pronto)) {
                const r = await resumenCobros(ctx)
                const nuevasVencidas = r.vencidas.filter(f => f.fecha_vencimiento === ayer)
                const pronto = r.pendientes.filter(f => f.fecha_vencimiento === en3)
                if (n.vencidas && nuevasVencidas.length) {
                    await enviar(link.chat_id, `🔴 <b>Han vencido ${nuevasVencidas.length} factura(s)</b>\n` + nuevasVencidas.map(f => `• ${esc(f.numero)} · ${esc(f.cliente_razon_social)} · ${formatCurrency(f.info.pendiente)}`).join('\n'),
                        nuevasVencidas.slice(0, 5).map(f => [{ text: `Ver ${f.numero}`, callback_data: `fac:${f.id}` }]))
                    enviados++
                }
                if (n.vencen_pronto && pronto.length) {
                    await enviar(link.chat_id, `🟡 <b>Vencen en 3 días</b>\n` + pronto.map(f => `• ${esc(f.numero)} · ${esc(f.cliente_razon_social)} · ${formatCurrency(f.info.pendiente)}`).join('\n'),
                        pronto.slice(0, 5).map(f => [{ text: `Ver ${f.numero}`, callback_data: `fac:${f.id}` }]))
                    enviados++
                }
            }

            if (diarios && n.gastos_revisar && tienePermiso(ctx.rol, 'gastos')) {
                const { count } = await ctx.supabase.from('gastos').select('id', { count: 'exact', head: true }).eq('revisado', false)
                if (count) { await enviar(link.chat_id, `🧾 Tienes <b>${count}</b> gasto(s) pendiente(s) de revisar en el ERP.`); enviados++ }
            }

            if (n.fiscal && tienePermiso(ctx.rol, 'fiscal')) {
                // Plazos de impuestos: el primer día del aviso y luego en días señalados (no todos los días)
                const { avisos, cfg } = await avisosEmpresa(ctx, hoy)
                for (const a of avisos.filter(x => x.diasRestantes === cfg.dias_aviso || DIAS_RECORDATORIO_TELEGRAM.includes(x.diasRestantes))) {
                    const cuando = a.diasRestantes === 0 ? 'HOY acaba el plazo' : a.diasRestantes === 1 ? 'queda 1 día' : `quedan ${a.diasRestantes} días`
                    const icono = a.nivel === 'urgente' ? '🔴' : a.nivel === 'pronto' ? '🟠' : '🧾'
                    await enviar(link.chat_id,
                        `${icono} <b>Impuestos: ${cuando}</b>\n${esc(a.etiquetaPeriodo)} · modelos ${a.modelos.join(', ')}\nFin de plazo: <b>${fechaES(a.fin)}</b> · entrega al asesor antes del ${fechaES(a.entregaAsesor)}\n\nPrepara las facturas con el botón «Descargar en mi carpeta» de la sección Fiscal.`,
                        [[{ text: '📂 Preparar facturas', url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://erp-muestra.vercel.app'}/fiscal?periodo=${encodeURIComponent(a.periodo)}` }],
                         [{ text: '✅ Ya entregado al asesor', callback_data: `fse:${a.clave.replace('|', ':')}` }]])
                    enviados++
                }
            }

            if (diarios && n.presupuestos_caducan && tienePermiso(ctx.rol, 'presupuestos')) {
                const { data: caducan } = await ctx.supabase.from('presupuestos').select('numero, cliente_razon_social, total, statuses').eq('fecha_validez', en3).eq('aceptado', false).eq('rechazado', false)
                const lista = (caducan || []).filter((p: any) => !(p.statuses || []).includes('traspasado'))
                if (lista.length) {
                    await enviar(link.chat_id, `📝 <b>Presupuestos que caducan en 3 días</b>\n` + lista.map((p: any) => `• ${esc(p.numero)} · ${esc(p.cliente_razon_social)} · ${formatCurrency(Number(p.total))}`).join('\n'))
                    enviados++
                }
            }
        } catch (e: any) {
            errores.push(`${link.id}: ${e?.message || e}`)
        }
    }

    // Limpieza: acciones pendientes caducadas.
    await admin.from('acciones_pendientes').update({ estado: 'caducada' }).eq('estado', 'pendiente').lt('expira_at', new Date().toISOString())

    return NextResponse.json({ ok: true, enviados, errores })
}

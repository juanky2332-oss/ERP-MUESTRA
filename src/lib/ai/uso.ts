import 'server-only'
import OpenAI from 'openai'
import type { Contexto } from '@/lib/auth'
import { tienePermiso } from '@/lib/permisos'

// Precio aproximado por millón de tokens (USD≈EUR a efectos de control interno).
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
    'gpt-4o': { entrada: 2.5, salida: 10 },
    'gpt-4o-mini': { entrada: 0.15, salida: 0.6 },
    'whisper-1': { entrada: 0, salida: 0 },
}

export async function registrarUsoIA(ctx: Contexto, u: { accion: string; modelo: string; tokensEntrada?: number; tokensSalida?: number; costeFijo?: number }) {
    const p = PRECIOS[u.modelo] || PRECIOS['gpt-4o']
    const coste = (u.costeFijo || 0) + ((u.tokensEntrada || 0) * p.entrada + (u.tokensSalida || 0) * p.salida) / 1_000_000
    await ctx.supabase.from('ia_uso').insert({
        empresa_id: ctx.empresaId,
        usuario_id: ctx.userId,
        origen: ctx.origen,
        accion: u.accion,
        modelo: u.modelo,
        tokens_entrada: u.tokensEntrada || 0,
        tokens_salida: u.tokensSalida || 0,
        coste_estimado: Math.round(coste * 100000) / 100000,
    })
}

/** ¿Puede esta empresa/usuario usar la IA ahora? (activada y dentro del límite mensual de peticiones). */
export async function comprobarCupoIA(ctx: Contexto): Promise<{ ok: boolean; mensaje: string }> {
    if (!tienePermiso(ctx.rol, 'ia')) return { ok: false, mensaje: 'Tu rol no tiene acceso al asistente IA.' }
    const { data: emp } = await ctx.supabase.from('empresas').select('ia_activa, ia_limite_mensual').eq('id', ctx.empresaId).maybeSingle()
    if (emp && emp.ia_activa === false) return { ok: false, mensaje: 'El asistente IA está desactivado para tu empresa (Ajustes → IA).' }
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
    const { count } = await ctx.supabase.from('ia_uso').select('id', { count: 'exact', head: true }).gte('created_at', inicioMes.toISOString())
    const limite = emp?.ia_limite_mensual ?? 1000
    if (limite > 0 && (count || 0) >= limite) return { ok: false, mensaje: `Se ha alcanzado el límite mensual de uso de IA (${limite} peticiones). Puedes ampliarlo en Ajustes → IA.` }
    return { ok: true, mensaje: '' }
}

/** Transcribe una nota de voz (Telegram/web) a texto. */
export async function transcribirAudio(ctx: Contexto, buffer: Buffer, nombre = 'audio.ogg'): Promise<string> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const file = new File([new Uint8Array(buffer)], nombre, { type: nombre.endsWith('.ogg') || nombre.endsWith('.oga') ? 'audio/ogg' : 'audio/mpeg' })
    const r = await openai.audio.transcriptions.create({ model: 'whisper-1', file, language: 'es' })
    // Whisper cobra por minuto (~0,006 $/min); se estima por tamaño de la nota de voz de Telegram (~16 kB/s).
    const minutos = Math.max(0.1, buffer.length / 16000 / 60)
    registrarUsoIA(ctx, { accion: 'transcripcion', modelo: 'whisper-1', costeFijo: minutos * 0.006 }).catch(() => { })
    return r.text || ''
}

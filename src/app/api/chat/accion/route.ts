import { NextResponse } from "next/server"
import { getContexto, mensajeError } from "@/lib/auth"
import { ejecutarAccion, cancelarAccion } from "@/lib/acciones/servidor"

export const maxDuration = 60

/** Botones Confirmar / Cancelar de las acciones que prepara el asistente. */
export async function POST(req: Request) {
    try {
        const ctx = await getContexto()
        const { id, decision } = await req.json()
        if (!id || typeof id !== 'string') return NextResponse.json({ ok: false, mensaje: 'Falta la acción' }, { status: 400 })
        if (decision === 'cancelar') {
            await cancelarAccion(ctx, id)
            return NextResponse.json({ ok: true, mensaje: 'Cancelado. No se ha hecho nada.' })
        }
        const r = await ejecutarAccion(ctx, id)
        return NextResponse.json(r)
    } catch (e) {
        return NextResponse.json({ ok: false, mensaje: '❌ ' + mensajeError(e) }, { status: 500 })
    }
}

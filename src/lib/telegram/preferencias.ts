/**
 * Preferencias de avisos por Telegram (columna jsonb `telegram_links.notificaciones`).
 * Compartido por la web (Ajustes), el bot (/notificaciones) y el cron diario.
 */

export const AVISOS = {
    resumen_diario: 'Resumen diario (8:00)',
    vencidas: 'Facturas vencidas',
    vencen_pronto: 'Vencen en 3 días',
    cobros: 'Cobros registrados',
    gastos_revisar: 'Gastos por revisar',
    presupuestos_caducan: 'Presupuestos que caducan',
} as const

export type ClaveAviso = keyof typeof AVISOS

/** `avisos_diarios` es el interruptor general: apagado, el cron de las 8:00 no manda nada. */
export type Preferencias = Record<ClaveAviso | 'avisos_diarios', boolean>

export function preferencias(guardadas?: Record<string, boolean> | null): Preferencias {
    return {
        avisos_diarios: true,
        resumen_diario: true, vencidas: true, vencen_pronto: true, cobros: true, gastos_revisar: true, presupuestos_caducan: true,
        ...(guardadas || {}),
    }
}

export function esClavePreferencia(k: string): k is keyof Preferencias {
    return k === 'avisos_diarios' || k in AVISOS
}

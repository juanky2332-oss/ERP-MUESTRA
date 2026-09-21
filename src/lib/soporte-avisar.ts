/**
 * Avisar al panel de soporte de que algo se ha roto.
 *
 * Esta es la pieza que se copia en cada app nuestra. Sirve igual en el navegador y en el
 * servidor, y su norma es que nunca estorba: si el buzón no contesta, o no hay token, o falla
 * la red, se calla y sigue. Un fallo al reportar un fallo no puede tumbar la app del cliente.
 *
 * Se configura con dos variables:
 *   NEXT_PUBLIC_SOPORTE_URL    dónde está el buzón
 *   NEXT_PUBLIC_SOPORTE_TOKEN  el token de esta app, que se saca del panel al darla de alta
 *
 * El token es público a propósito: el navegador del usuario tiene que poder usarlo. Solo sirve
 * para escribir un aviso, no da acceso a leer nada, y el buzón corta si una app se desboca.
 */

const BUZON = process.env.NEXT_PUBLIC_SOPORTE_URL
    || 'https://www.flownexion.app/api/soporte/reportar';
const TOKEN = process.env.NEXT_PUBLIC_SOPORTE_TOKEN || '';

type Aviso = {
    /** Dónde pasó: la ruta, el nombre de la pantalla o el de la función. */
    donde?: string;
    /** El proveedor al que llamábamos, si el fallo viene de fuera: openai, pdfco, holded… */
    proveedor?: string;
    /** El código que devolvió, si lo hubo. Los 4xx no se apuntan: no son fallos nuestros. */
    estado?: number;
    pila?: string;
};

export async function avisar(fallo: unknown, extra: Aviso = {}): Promise<void> {
    if (!TOKEN) return;
    try {
        const err = fallo instanceof Error ? fallo : null;
        const cuerpo = {
            tipo: 'error' as const,
            mensaje: err?.message || String(fallo || '').slice(0, 500),
            pila: extra.pila || err?.stack?.split('\n').slice(0, 6).join('\n'),
            donde: extra.donde
                || (typeof window !== 'undefined' ? window.location.pathname : undefined),
            lado: typeof window === 'undefined' ? 'servidor' : 'navegador',
            proveedor: extra.proveedor,
            estado: extra.estado,
            version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
        };
        await fetch(BUZON, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-soporte-token': TOKEN },
            body: JSON.stringify(cuerpo),
            // Para que el aviso salga aunque el usuario cierre la pestaña justo después.
            keepalive: typeof window !== 'undefined',
        });
    } catch {
        // A propósito: quien llama a esto ya está teniendo un mal día.
    }
}

/**
 * Lo mismo, pero para envolver una ruta de API entera.
 *
 * Sustituye al `try { … } catch { console.error }` de siempre, que escribe en unos logs que
 * nadie mira. Devuelve el mismo 500 de antes, pero además queda apuntado.
 */
export function conAviso<T extends (...args: never[]) => Promise<Response>>(
    donde: string, mano: T,
): T {
    return (async (...args: Parameters<T>) => {
        try {
            return await mano(...args);
        } catch (err) {
            await avisar(err, { donde, estado: 500 });
            throw err;
        }
    }) as T;
}

/** Señal de vida, para que el panel sepa que esta app tiene el aviso puesto de verdad. */
export async function saludar(): Promise<void> {
    if (!TOKEN) return;
    try {
        await fetch(BUZON, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-soporte-token': TOKEN },
            body: JSON.stringify({
                tipo: 'ping',
                version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
            }),
        });
    } catch {
        // Igual que arriba: si no llega, no pasa nada.
    }
}

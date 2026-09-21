'use client';

import { useEffect } from 'react';
import { avisar, saludar } from './soporte-avisar';

/**
 * La red de seguridad: recoge los fallos que nadie recogió.
 *
 * Las pantallas de error solo saltan cuando revienta el render. Pero la mayoría de los fallos
 * de verdad no revientan nada: el cliente sube un documento, la llamada devuelve un 500, el
 * código lo captura, enseña «no se ha podido procesar» y ahí se acaba. Para el usuario es un
 * fallo grave; para el sistema, un martes cualquiera.
 *
 * Esto se pone en medio de las llamadas de la propia app y avisa de las que vuelven rotas, sin
 * tener que tocar un solo `catch`. Y de paso recoge las promesas que nadie esperó y los errores
 * sueltos del navegador.
 *
 * Se monta una vez, dentro del layout raíz.
 */
export function AvisosGlobales() {
    useEffect(() => {
        const buzon = process.env.NEXT_PUBLIC_SOPORTE_URL || '';

        // 0. Señal de vida: que el panel sepa si alguien está usando esto de verdad.
        //
        // Sin esto, «no ha dado fallos» y «no la usa nadie» se ven exactamente igual, y una app
        // caída del todo saldría en verde. Una por navegador y hora, que es ruido de sobra.
        try {
            const ultima = Number(localStorage.getItem('soporte:saludo') || 0);
            if (Date.now() - ultima > 3600_000) {
                localStorage.setItem('soporte:saludo', String(Date.now()));
                void saludar();
            }
        } catch {
            // Navegador con el almacenamiento capado: se saluda y ya está.
            void saludar();
        }

        // 1. Las llamadas de la app que vuelven rotas.
        const original = window.fetch;
        window.fetch = async (...args: Parameters<typeof fetch>) => {
            const url = typeof args[0] === 'string' ? args[0]
                : args[0] instanceof URL ? args[0].href
                : (args[0] as Request).url;

            // Al buzón no se le avisa del buzón: sería una pescadilla.
            const nuestra = url.startsWith('/') || url.startsWith(window.location.origin);
            if (!nuestra || (buzon && url.startsWith(buzon))) return original(...args);

            const ruta = url.replace(window.location.origin, '').split('?')[0];
            try {
                const res = await original(...args);
                // Un 400 es del usuario y un 500 es nuestro: solo sube el segundo.
                if (res.status >= 500) {
                    const detalle = await res.clone().text().catch(() => '');
                    let motivo = '';
                    try {
                        const j = JSON.parse(detalle);
                        motivo = String(j.error || j.message || '').slice(0, 200);
                    } catch { motivo = detalle.slice(0, 200); }
                    void avisar(`La llamada a ${ruta} devolvió ${res.status}${motivo ? `: ${motivo}` : ''}`,
                        { donde: ruta, estado: res.status });
                }
                return res;
            } catch (err) {
                // Aquí no hay respuesta, y eso no distingue entre que se haya caído el servidor
                // y que al usuario se le haya ido el wifi en el metro. Si el navegador ya sabe
                // que está sin línea, no se molesta a nadie; si dice que hay conexión, se avisa
                // pero como aviso, no como error: uno suelto no es nada y veinte a la vez sí.
                if (typeof navigator === 'undefined' || navigator.onLine !== false) {
                    void avisar(err, { donde: ruta, estado: 0 });
                }
                throw err;
            }
        };

        // 2. Promesas que nadie esperó y errores sueltos que no llegan a romper la pantalla.
        const rechazo = (e: PromiseRejectionEvent) =>
            void avisar(e.reason, { donde: `${window.location.pathname} (promesa sin recoger)` });
        const suelto = (e: ErrorEvent) =>
            void avisar(e.error || e.message, { donde: window.location.pathname });

        window.addEventListener('unhandledrejection', rechazo);
        window.addEventListener('error', suelto);
        return () => {
            window.fetch = original;
            window.removeEventListener('unhandledrejection', rechazo);
            window.removeEventListener('error', suelto);
        };
    }, []);

    return null;
}

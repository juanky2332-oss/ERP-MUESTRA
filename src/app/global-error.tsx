'use client';

import { useEffect } from 'react';
import { avisar } from '../lib/soporte-avisar';

/**
 * El último cortafuegos: cuando revienta el propio layout no queda nada de la app en pie, ni
 * estilos ni componentes, así que esta pantalla se escribe entera a mano.
 *
 * Es el caso más grave y el más invisible: la app se queda en blanco para el usuario.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        avisar(error, { donde: 'layout raíz' });
    }, [error]);

    return (
        <html lang="es">
            <body style={{
                display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'system-ui, sans-serif', background: '#0A0D14', color: '#fff', margin: 0,
            }}>
                <div style={{ textAlign: 'center', padding: 32, maxWidth: 460 }}>
                    <h2 style={{ fontSize: 20, marginBottom: 12 }}>La aplicación no ha podido cargar</h2>
                    <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.5 }}>
                        El fallo ya está registrado y lo estamos mirando.
                    </p>
                    {error.digest && (
                        <p style={{ fontSize: 12, color: '#64748B', fontFamily: 'monospace' }}>
                            ref: {error.digest}
                        </p>
                    )}
                    <button
                        onClick={reset}
                        style={{
                            marginTop: 20, padding: '10px 20px', borderRadius: 8, border: 0,
                            background: '#38B5FF', color: '#0A0D14', fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        Reintentar
                    </button>
                </div>
            </body>
        </html>
    );
}

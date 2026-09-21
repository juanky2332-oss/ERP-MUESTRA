'use client';

import { useEffect } from 'react';
import { avisar } from '../lib/soporte-avisar';

/**
 * La pantalla que sale cuando algo revienta delante del usuario.
 *
 * Sin esto, Next enseña su pantalla de error y ahí se acaba la historia: nadie se entera salvo
 * que el usuario lo cuente. Ahora el fallo llega solo al panel de soporte de Flownexion.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        avisar(error, { donde: typeof window !== 'undefined' ? window.location.pathname : undefined });
    }, [error]);

    return (
        <div style={{
            display: 'flex', minHeight: '60vh', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center',
        }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Algo ha fallado en esta pantalla</h2>
            <p style={{ maxWidth: 420, fontSize: 14, opacity: 0.7, lineHeight: 1.5, margin: 0 }}>
                Ya lo hemos registrado y lo estamos mirando. Puedes reintentar; si vuelve a pasar, avísanos.
            </p>
            {error.digest && (
                <p style={{ fontSize: 12, opacity: 0.5, fontFamily: 'monospace', margin: 0 }}>
                    ref: {error.digest}
                </p>
            )}
            <button
                onClick={reset}
                style={{
                    marginTop: 8, padding: '10px 20px', borderRadius: 8, border: 0,
                    background: '#38B5FF', color: '#0A0D14', fontWeight: 600, cursor: 'pointer',
                }}
            >
                Reintentar
            </button>
        </div>
    );
}

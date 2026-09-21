/**
 * Ruta a la que se puede volver despues del login.
 *
 * Solo valen rutas de la propia app: tienen que empezar por una sola barra.
 * Una URL absoluta, //sitio-falso o /\sitio-falso se cambian por la portada,
 * para que un enlace preparado no pueda sacar a nadie fuera del dominio.
 */
export function safeNext(next: string | null | undefined): string {
    if (!next || !next.startsWith('/')) return '/'
    if (next.startsWith('//') || next.startsWith('/\\')) return '/'
    return next
}

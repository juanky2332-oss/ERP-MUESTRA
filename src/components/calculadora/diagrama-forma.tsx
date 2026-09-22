'use client'

import type { FormaId } from '@/lib/calculadora/calculo'

/** Esquema de la sección de la forma con sus cotas. Usa los colores del tema (claro/oscuro). */
export function DiagramaForma({ forma, dims }: { forma: FormaId; dims: Record<string, number> }) {
    const v = (k: string) => (dims[k] ? `${k} ${String(dims[k]).replace('.', ',')}` : k)
    const cuerpo = 'fill-primary/15 stroke-primary'
    const hueco = 'fill-background stroke-primary'
    const cota = 'stroke-rose-500'
    const txt = 'fill-rose-500 text-[11px] font-bold'

    let figura: React.ReactNode = null
    switch (forma) {
        case 'redonda': case 'disco': case 'esfera':
            figura = <>
                <circle cx="80" cy="80" r="52" className={cuerpo} strokeWidth="2" />
                <line x1="28" y1="148" x2="132" y2="148" className={cota} strokeWidth="1.5" /><text x="80" y="163" textAnchor="middle" className={txt}>{v('D')}</text>
            </>
            break
        case 'tubo': case 'anillo':
            figura = <>
                <circle cx="80" cy="80" r="52" className={cuerpo} strokeWidth="2" />
                <circle cx="80" cy="80" r="34" className={hueco} strokeWidth="2" />
                <line x1="28" y1="148" x2="132" y2="148" className={cota} strokeWidth="1.5" /><text x="80" y="163" textAnchor="middle" className={txt}>{v('D')}</text>
                <text x="80" y="84" textAnchor="middle" className={txt}>{forma === 'tubo' ? v('E') : v('d')}</text>
            </>
            break
        case 'cuadrada':
            figura = <>
                <rect x="30" y="30" width="100" height="100" className={cuerpo} strokeWidth="2" />
                <line x1="30" y1="148" x2="130" y2="148" className={cota} strokeWidth="1.5" /><text x="80" y="163" textAnchor="middle" className={txt}>{v('A')}</text>
            </>
            break
        case 'hexagonal':
            figura = <>
                <polygon points="80,22 130,51 130,109 80,138 30,109 30,51" className={cuerpo} strokeWidth="2" />
                <line x1="30" y1="150" x2="130" y2="150" className={cota} strokeWidth="1.5" /><text x="80" y="165" textAnchor="middle" className={txt}>{v('S')} (entre caras)</text>
            </>
            break
        case 'octogonal':
            figura = <>
                <polygon points="59,30 101,30 130,59 130,101 101,130 59,130 30,101 30,59" className={cuerpo} strokeWidth="2" />
                <line x1="30" y1="148" x2="130" y2="148" className={cota} strokeWidth="1.5" /><text x="80" y="163" textAnchor="middle" className={txt}>{v('S')}</text>
            </>
            break
        case 'pletina': case 'chapa':
            figura = <>
                <rect x="15" y="55" width="130" height="45" className={cuerpo} strokeWidth="2" />
                <line x1="15" y1="118" x2="145" y2="118" className={cota} strokeWidth="1.5" /><text x="80" y="134" textAnchor="middle" className={txt}>{forma === 'chapa' ? `${v('A')} × ${v('B')}` : v('A')}</text>
                <line x1="155" y1="55" x2="155" y2="100" className={cota} strokeWidth="1.5" /><text x="150" y="48" textAnchor="end" className={txt}>{v('E')}</text>
            </>
            break
        case 'tubo_rect':
            figura = <>
                <rect x="20" y="35" width="120" height="90" className={cuerpo} strokeWidth="2" />
                <rect x="34" y="49" width="92" height="62" className={hueco} strokeWidth="2" />
                <line x1="20" y1="143" x2="140" y2="143" className={cota} strokeWidth="1.5" /><text x="80" y="158" textAnchor="middle" className={txt}>{v('A')}</text>
                <text x="148" y="84" className={txt}>{v('B')}</text><text x="80" y="84" textAnchor="middle" className={txt}>{v('E')}</text>
            </>
            break
        case 'angular':
            figura = <>
                <polygon points="30,25 48,25 48,112 135,112 135,130 30,130" className={cuerpo} strokeWidth="2" />
                <text x="18" y="80" textAnchor="middle" className={txt} transform="rotate(-90 18 80)">{v('A')}</text>
                <text x="85" y="150" textAnchor="middle" className={txt}>{v('B')}</text><text x="90" y="105" className={txt}>{v('E')}</text>
            </>
            break
        case 'perfil_u':
            figura = <>
                <polygon points="25,30 125,30 125,48 43,48 43,112 125,112 125,130 25,130" className={cuerpo} strokeWidth="2" />
                <text x="14" y="82" textAnchor="middle" className={txt} transform="rotate(-90 14 82)">{v('A')}</text>
                <text x="85" y="150" textAnchor="middle" className={txt}>{v('B')}</text><text x="60" y="85" className={txt}>{v('E')}</text>
            </>
            break
        case 'perfil_t':
            figura = <>
                <polygon points="20,25 140,25 140,43 89,43 89,135 71,135 71,43 20,43" className={cuerpo} strokeWidth="2" />
                <text x="80" y="18" textAnchor="middle" className={txt}>{v('A')}</text>
                <text x="100" y="95" className={txt}>{v('B')}</text>
            </>
            break
        case 'perfil_std':
            figura = <>
                <polygon points="30,25 130,25 130,40 87,40 87,120 130,120 130,135 30,135 30,120 73,120 73,40 30,40" className={cuerpo} strokeWidth="2" />
                <text x="80" y="155" textAnchor="middle" className={txt}>IPE · HEB · HEA · UPN</text>
            </>
            break
        default:
            figura = <>
                <path d="M40,60 L80,35 L125,55 L125,110 L85,135 L40,112 Z" className={cuerpo} strokeWidth="2" />
                <text x="82" y="95" textAnchor="middle" className={txt}>{forma === 'peso' ? 'kg' : 'cm³'}</text>
            </>
    }

    const conLargo = ['redonda', 'cuadrada', 'hexagonal', 'octogonal', 'pletina', 'tubo', 'tubo_rect', 'angular', 'perfil_u', 'perfil_t', 'perfil_std'].includes(forma)
    return (
        <div className="rounded-2xl border bg-muted/30 p-3 flex items-center justify-center gap-4">
            <svg viewBox="0 0 170 170" className="h-40 w-40" aria-label="Esquema de la sección">{figura}</svg>
            {conLargo && (
                <div className="text-center">
                    <svg viewBox="0 0 120 40" className="w-28" aria-hidden><rect x="5" y="12" width="110" height="16" rx="3" className="fill-primary/15 stroke-primary" strokeWidth="2" /></svg>
                    <p className="text-[11px] font-bold text-rose-500">{v('L')}</p>
                </div>
            )}
        </div>
    )
}

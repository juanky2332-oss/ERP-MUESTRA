import { getContexto } from '@/lib/auth'
import { tienePermiso } from '@/lib/permisos'
import { formatCurrency } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { BarChart3 } from 'lucide-react'

export const dynamic = 'force-dynamic'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default async function InformesPage() {
    const ctx = await getContexto()
    if (!tienePermiso(ctx.rol, 'economico')) {
        return <EmptyState icon={BarChart3} title="Sin acceso" description="Tu rol no tiene acceso a los informes económicos." />
    }
    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1).toISOString().slice(0, 10)

    const [{ data: facturas }, { data: cobros }, { data: gastos }] = await Promise.all([
        ctx.supabase.from('facturas').select('fecha, total, cliente_razon_social, anulada').gte('fecha', desde),
        ctx.supabase.from('cobros').select('fecha, importe').eq('estado', 'confirmado').gte('fecha', desde),
        ctx.supabase.from('gastos').select('fecha, total, categoria, proveedor').gte('fecha', desde),
    ])

    const meses: { clave: string; etiqueta: string; facturado: number; cobrado: number; gastos: number }[] = []
    for (let i = 11; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
        meses.push({ clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, etiqueta: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, facturado: 0, cobrado: 0, gastos: 0 })
    }
    const idx = (f: string) => meses.findIndex(m => m.clave === String(f).slice(0, 7))
    for (const f of facturas || []) { if (f.anulada) continue; const i = idx(f.fecha); if (i >= 0) meses[i].facturado += Number(f.total || 0) }
    for (const c of cobros || []) { const i = idx(c.fecha); if (i >= 0) meses[i].cobrado += Number(c.importe || 0) }
    for (const g of gastos || []) { const i = idx(g.fecha); if (i >= 0) meses[i].gastos += Number(g.total || 0) }
    const max = Math.max(1, ...meses.map(m => Math.max(m.facturado, m.gastos, m.cobrado)))

    const agrupar = (lista: any[], clave: string, valor: string) => Object.entries(lista.reduce((m: Record<string, number>, x: any) => {
        const k = x[clave] || 'Sin clasificar'; m[k] = (m[k] || 0) + Number(x[valor] || 0); return m
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8)

    const topClientes = agrupar((facturas || []).filter((f: any) => !f.anulada), 'cliente_razon_social', 'total')
    const porCategoria = agrupar(gastos || [], 'categoria', 'total')
    const porProveedor = agrupar(gastos || [], 'proveedor', 'total')
    const tot = meses.reduce((a, m) => ({ f: a.f + m.facturado, c: a.c + m.cobrado, g: a.g + m.gastos }), { f: 0, c: 0, g: 0 })

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">Informes</h1>
                <p className="text-muted-foreground mt-1">Últimos 12 meses: facturación, cobros y gastos.</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[{ t: 'Facturado', v: tot.f, c: 'text-primary' }, { t: 'Cobrado', v: tot.c, c: 'text-emerald-600' }, { t: 'Gastos', v: tot.g, c: 'text-rose-600' }, { t: 'Resultado (cobrado − gastos)', v: tot.c - tot.g, c: tot.c - tot.g >= 0 ? 'text-emerald-600' : 'text-rose-600' }].map(k => (
                    <div key={k.t} className="rounded-2xl border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">{k.t}</p><p className={`text-xl md:text-2xl font-black tabular-nums mt-1 ${k.c}`}>{formatCurrency(k.v)}</p></div>
                ))}
            </div>

            <div className="rounded-2xl border bg-card p-5">
                <div className="flex gap-4 text-xs font-semibold mb-4">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Facturado</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Cobrado</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Gastos</span>
                </div>
                <div className="flex items-end gap-2 h-56 overflow-x-auto">
                    {meses.map(m => (
                        <div key={m.clave} className="flex flex-col items-center gap-1 min-w-[42px] flex-1">
                            <div className="flex items-end gap-0.5 h-48 w-full justify-center">
                                <div className="w-2.5 rounded-t bg-primary" style={{ height: `${(m.facturado / max) * 100}%` }} title={`Facturado ${formatCurrency(m.facturado)}`} />
                                <div className="w-2.5 rounded-t bg-emerald-500" style={{ height: `${(m.cobrado / max) * 100}%` }} title={`Cobrado ${formatCurrency(m.cobrado)}`} />
                                <div className="w-2.5 rounded-t bg-rose-400" style={{ height: `${(m.gastos / max) * 100}%` }} title={`Gastos ${formatCurrency(m.gastos)}`} />
                            </div>
                            <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{m.etiqueta}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
                {[{ t: 'Clientes con más facturación', d: topClientes }, { t: 'Gastos por categoría', d: porCategoria }, { t: 'Gastos por proveedor', d: porProveedor }].map(b => (
                    <div key={b.t} className="rounded-2xl border bg-card p-4">
                        <p className="text-sm font-extrabold mb-3">{b.t}</p>
                        {b.d.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos.</p> : b.d.map(([k, v]) => (
                            <div key={k} className="py-1.5">
                                <div className="flex justify-between text-sm"><span className="truncate pr-2">{k}</span><span className="font-bold tabular-nums">{formatCurrency(v)}</span></div>
                                <div className="h-1.5 bg-muted rounded-full mt-1"><div className="h-full bg-primary/70 rounded-full" style={{ width: `${(v / (b.d[0][1] || 1)) * 100}%` }} /></div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            <div className="rounded-2xl border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Mes</th><th className="text-right p-3">Facturado</th><th className="text-right p-3">Cobrado</th><th className="text-right p-3">Gastos</th><th className="text-right p-3">Resultado</th></tr></thead>
                    <tbody className="divide-y">
                        {[...meses].reverse().map(m => (
                            <tr key={m.clave}><td className="p-3 font-semibold">{m.etiqueta}</td><td className="p-3 text-right tabular-nums">{formatCurrency(m.facturado)}</td><td className="p-3 text-right tabular-nums text-emerald-600">{formatCurrency(m.cobrado)}</td><td className="p-3 text-right tabular-nums text-rose-600">{formatCurrency(m.gastos)}</td><td className="p-3 text-right tabular-nums font-bold">{formatCurrency(m.cobrado - m.gastos)}</td></tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

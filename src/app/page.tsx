import { FileText, Box, FileInput, Receipt, Activity, TrendingUp, Clock, Mail, AlertTriangle, Send, ArrowRight, Users } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { FinancialChart } from "@/components/dashboard/financial-chart"
import Link from "next/link"
import { format, startOfMonth, endOfMonth } from "date-fns"
import { es } from "date-fns/locale"
import { cn, formatCurrency } from "@/lib/utils"
import { KpiCard } from "@/components/ui/kpi-card"
import { MoneyDisplay } from "@/components/ui/money-display"
import { OWN_COMPANY } from "@/lib/company"

export const dynamic = 'force-dynamic'

async function getStats(monthFilter: string | undefined) {
  const supabase = await createClient()

  const [
    { data: presupuestos },
    { data: albaranes },
    { data: facturas },
    { data: gastos },
    { data: albaranesFirmados },
    { data: historial }
  ] = await Promise.all([
    supabase.from('presupuestos').select('total, created_at, numero, cliente_razon_social, aceptado, rechazado, statuses').order('created_at', { ascending: false }),
    supabase.from('albaranes').select('total, created_at').is('documento_firmado_url', null).order('created_at', { ascending: false }),
    supabase.from('facturas').select('total, created_at, estado, pagada, statuses, fecha_vencimiento, numero, cliente_razon_social, fecha').order('created_at', { ascending: false }),
    supabase.from('gastos').select('total, base_imponible, iva_importe, fecha, created_at').order('created_at', { ascending: false }),
    supabase.from('albaranes').select('total, created_at').not('documento_firmado_url', 'is', null).order('created_at', { ascending: false }),
    supabase.from('notificaciones_historial').select('*').order('created_at', { ascending: false }).limit(5)
  ])

  let startDate: Date | null = null
  let endDate: Date | null = null

  if (monthFilter && monthFilter !== 'all') {
    const [year, month] = monthFilter.split('-').map(Number)
    const date = new Date(year, month - 1)
    startDate = startOfMonth(date)
    endDate = endOfMonth(date)
  }

  const filterByDate = (item: any, dateField: string = 'created_at') => {
    if (!startDate || !endDate) return true
    const date = new Date(item[dateField])
    return date >= startDate && date <= endDate
  }

  const filteredPresupuestos = presupuestos?.filter(d => filterByDate(d)) || []
  const filteredAlbaranes = albaranes?.filter(d => filterByDate(d)) || []
  const filteredFacturas = facturas?.filter(d => filterByDate(d)) || []
  const filteredGastos = gastos?.filter(d => filterByDate(d, 'fecha')) || []
  const filteredAlbaranesFirmados = albaranesFirmados?.filter(d => filterByDate(d)) || []

  const totalPresupuestos = filteredPresupuestos.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0)
  const totalAlbaranes = filteredAlbaranes.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0)
  const totalFacturado = filteredFacturas.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0)
  const totalGastos = filteredGastos.reduce((acc: number, curr: any) => {
    const amount = Number(curr.total) || (Number(curr.base_imponible || 0) + Number(curr.iva_importe || 0)) || 0
    return acc + amount
  }, 0)
  const totalAlbaranesFirmados = filteredAlbaranesFirmados.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0)
  const netProfit = totalFacturado - totalGastos

  // ---- Cobros: pendiente, vencido, cobrado este mes ----
  const today = new Date()
  const allFacturas = facturas || []
  const facturasPendientes = allFacturas.filter((f: any) => !f.pagada)
  const totalPendienteCobro = facturasPendientes.reduce((acc: number, f: any) => acc + (Number(f.total) || 0), 0)

  const facturasVencidas = facturasPendientes.filter((f: any) => f.fecha_vencimiento && new Date(f.fecha_vencimiento) < today)
  const totalVencido = facturasVencidas.reduce((acc: number, f: any) => acc + (Number(f.total) || 0), 0)

  const now = new Date()
  const startThisMonth = startOfMonth(now)
  const endThisMonth = endOfMonth(now)
  const cobradoEsteMes = allFacturas
    .filter((f: any) => f.pagada && new Date(f.created_at) >= startThisMonth && new Date(f.created_at) <= endThisMonth)
    .reduce((acc: number, f: any) => acc + (Number(f.total) || 0), 0)
  const facturadoEsteMes = allFacturas
    .filter((f: any) => new Date(f.created_at) >= startThisMonth && new Date(f.created_at) <= endThisMonth)
    .reduce((acc: number, f: any) => acc + (Number(f.total) || 0), 0)

  const topPendientes = [...facturasPendientes]
    .sort((a: any, b: any) => (Number(b.total) || 0) - (Number(a.total) || 0))
    .slice(0, 5)

  // ---- Presupuestos pendientes de aceptación ----
  // Un presupuesto ya convertido en albarán ('traspasado' en su historial de
  // estados) deja de estar "pendiente de decisión" aunque nadie haya marcado
  // manualmente los booleanos aceptado/rechazado: el traspaso ES la decisión.
  const presupuestosPendientes = (presupuestos || []).filter((p: any) =>
    !p.aceptado && !p.rechazado && !(p.statuses || []).includes('traspasado')
  )
  const totalPresupuestosPendientes = presupuestosPendientes.reduce((acc: number, p: any) => acc + (Number(p.total) || 0), 0)
  const topPresupuestosPendientes = [...presupuestosPendientes]
    .sort((a: any, b: any) => (Number(b.total) || 0) - (Number(a.total) || 0))
    .slice(0, 5)

  return {
    totals: {
      presupuesto: totalPresupuestos,
      albaran: totalAlbaranes,
      factura: totalFacturado,
      gasto: totalGastos,
      albaranFirmado: totalAlbaranesFirmados
    },
    counts: {
      presupuesto: filteredPresupuestos.length,
      albaran: filteredAlbaranes.length,
      factura: filteredFacturas.length,
      gasto: filteredGastos.length,
      albaranFirmado: filteredAlbaranesFirmados.length
    },
    financials: { income: totalFacturado, expenses: totalGastos, profit: netProfit },
    chartData: { facturas: facturas || [], gastos: gastos || [] },
    historial: historial || [],
    cobros: {
      pendiente: totalPendienteCobro,
      vencido: totalVencido,
      vencidasCount: facturasVencidas.length,
      cobradoEsteMes,
      facturadoEsteMes,
      topPendientes,
    },
    presupuestosPendientes: {
      count: presupuestosPendientes.length,
      total: totalPresupuestosPendientes,
      top: topPresupuestosPendientes,
    }
  }
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 6) return "Buenas noches"
  if (hour < 13) return "Buenos días"
  if (hour < 20) return "Buenas tardes"
  return "Buenas noches"
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams
  const monthFilter = params.month
  const stats = await getStats(monthFilter)

  const hasUrgent = stats.cobros.vencidasCount > 0

  return (
    <div className="space-y-10 pb-20">
      {/* Cabecera de bienvenida dinámica */}
      <div className="flex flex-col gap-6">
        <div>
          <span className="text-[10px] font-extrabold text-primary uppercase tracking-[0.3em]">{OWN_COMPANY.nombre}</span>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-foreground mt-1">
            {greeting()}
          </h2>
          <p className="text-muted-foreground font-medium mt-1.5">
            Hoy tienes{' '}
            <span className="font-bold text-foreground">{stats.presupuestosPendientes.count} presupuesto{stats.presupuestosPendientes.count !== 1 ? 's' : ''} por cerrar</span>
            {' '}y{' '}
            <span className="font-bold text-foreground">{formatCurrency(stats.cobros.pendiente)} por cobrar</span>.
          </p>
        </div>

        {hasUrgent && (
          <div className="flex items-center gap-4 bg-rose-600 text-white px-6 py-4 rounded-2xl shadow-lg shadow-rose-600/20">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold flex-1">
              Tienes {stats.cobros.vencidasCount} factura{stats.cobros.vencidasCount !== 1 ? 's' : ''} vencida{stats.cobros.vencidasCount !== 1 ? 's' : ''} por {formatCurrency(stats.cobros.vencido)}.
            </p>
            <Link href="/facturas" className="text-xs font-bold uppercase tracking-wide bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              Ver facturas
            </Link>
          </div>
        )}
      </div>

      {/* KPIs principales */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard title="Facturado este mes" value={formatCurrency(stats.cobros.facturadoEsteMes)} icon={FileInput} href="/facturas" scheme="blue" />
        <KpiCard title="Cobrado este mes" value={formatCurrency(stats.cobros.cobradoEsteMes)} icon={TrendingUp} href="/facturas" scheme="green" />
        <KpiCard title="Pendiente de cobro" value={formatCurrency(stats.cobros.pendiente)} icon={Clock} href="/facturas" scheme="orange" />
        <KpiCard title="Vencido" value={formatCurrency(stats.cobros.vencido)} subtitle={`${stats.cobros.vencidasCount} factura(s)`} icon={AlertTriangle} href="/facturas" scheme="red" />
        <KpiCard title="Presupuestos pendientes" value={formatCurrency(stats.presupuestosPendientes.total)} subtitle={`${stats.presupuestosPendientes.count} por decidir`} icon={FileText} href="/presupuestos" scheme="purple" />
      </div>

      {/* Bloques operativos */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Presupuestos pendientes de decisión */}
        <div className="metric-card bg-card overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center">
                <FileText className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="text-base font-extrabold text-foreground">Presupuestos por cerrar</h3>
            </div>
            <Link href="/presupuestos" className="text-xs font-bold text-primary flex items-center gap-1 hover:gap-1.5 transition-all">
              Ver todo <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {stats.presupuestosPendientes.top.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No tienes presupuestos por decidir. 🎉</p>
          ) : (
            <div className="space-y-1">
              {stats.presupuestosPendientes.top.map((p: any) => (
                <div key={p.numero} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{p.cliente_razon_social}</p>
                    <p className="text-xs text-muted-foreground">{p.numero}</p>
                  </div>
                  <MoneyDisplay value={Number(p.total) || 0} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Acciones rápidas */}
        <div className="metric-card bg-card">
          <h3 className="text-base font-extrabold text-foreground mb-6">Acciones rápidas</h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction href="/presupuestos/new" icon={FileText} label="Nuevo presupuesto" scheme="text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400" />
            <QuickAction href="/albaranes/new" icon={Box} label="Nuevo albarán" scheme="text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400" />
            <QuickAction href="/facturas/new" icon={FileInput} label="Nueva factura" scheme="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400" />
            <QuickAction href="/gastos/new" icon={Receipt} label="Registrar gasto" scheme="text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400" />
            <QuickAction href="/contactos" icon={Users} label="Clientes" scheme="text-slate-600 bg-slate-50 dark:bg-slate-800/60 dark:text-slate-300" />
            <QuickAction href="https://t.me/ERP_PRUEBA_bot" icon={Send} label="Abrir Telegram" scheme="text-sky-600 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-400" external />
          </div>
        </div>
      </div>

      {/* Chart & Insights Section */}
      <div className="metric-card bg-card shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden group">
        <div className="flex flex-row justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-slate-900 dark:bg-slate-800 flex items-center justify-center text-white shadow-lg">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-extrabold text-foreground tracking-tight">Evolución de Tesorería</h3>
              <p className="text-xs md:text-sm font-medium text-muted-foreground mt-0.5">Ingresos vs Gastos acumulados</p>
            </div>
          </div>

          <div className="bg-muted px-6 py-4 rounded-2xl border border-border text-right">
            <span className="text-[10px] font-bold uppercase tracking-widest block mb-1 opacity-60">Beneficio Neto</span>
            <MoneyDisplay value={stats.financials.profit} tone="auto" size="lg" />
          </div>
        </div>
        <div className="mt-4">
          <FinancialChart invoices={stats.chartData.facturas} expenses={stats.chartData.gastos} />
        </div>
      </div>

      {/* Actividad reciente */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <h3 className="text-lg md:text-xl font-extrabold text-foreground tracking-tight">Actividad reciente</h3>
        </div>

        <div className="bg-card rounded-3xl border border-border shadow-2xl shadow-slate-200/10 dark:shadow-none overflow-hidden">
          <div className="min-w-full overflow-x-auto">
            <table className="w-full text-sm text-left align-middle">
              <thead>
                <tr className="bg-muted/50 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground border-b border-border">
                  <th className="px-8 py-5">Identificador</th>
                  <th className="px-8 py-5">Entidad / Cliente</th>
                  <th className="px-8 py-5">Documento</th>
                  <th className="px-8 py-5">Cronología</th>
                  <th className="px-8 py-5 text-right">Canal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.historial.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-2 opacity-30">
                        <Mail className="h-12 w-12" />
                        <p className="font-bold uppercase tracking-widest text-[10px]">No hay actividad reciente</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  stats.historial.map((entry: any) => {
                    const tipo = entry.tipo_documento?.toUpperCase()
                    const isFactura = tipo?.includes('FACTURA')
                    const isPresupuesto = tipo?.includes('PRESUPUESTO')

                    return (
                      <tr key={entry.id} className="hover:bg-muted/50 transition-colors group">
                        <td className="px-8 py-6">
                          <span className={cn(
                            "px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest border shadow-sm uppercase",
                            isFactura ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900" :
                              isPresupuesto ? "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900" :
                                "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
                          )}>
                            {entry.tipo_documento}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                              {entry.destinatario || entry.usuario_nombre || 'Desconocido'}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <span className="font-mono text-xs font-bold text-muted-foreground bg-muted px-2 py-1 rounded-md">
                            {entry.numero_documento || 'ID: ' + entry.id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-2 text-muted-foreground font-medium whitespace-nowrap">
                            <Clock className="h-3.5 w-3.5 opacity-50" />
                            {format(new Date(entry.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            ENVIADO
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickAction({ href, icon: Icon, label, scheme, external }: { href: string, icon: any, label: string, scheme: string, external?: boolean }) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="flex flex-col items-start gap-3 rounded-2xl border border-border p-4 hover:border-primary/40 hover:shadow-md transition-all active:scale-95"
    >
      <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", scheme)}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <span className="text-xs font-bold text-foreground leading-tight">{label}</span>
    </Link>
  )
}

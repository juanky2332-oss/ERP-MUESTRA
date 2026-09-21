'use client'

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts"
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, startOfYear, endOfYear, isSameMonth, subYears, parseISO, compareAsc } from "date-fns"
import { es } from "date-fns/locale"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { ArrowUpRight, ArrowDownRight, TrendingUp, DollarSign } from "lucide-react"
import { cn } from "@/lib/utils"

interface FinancialChartProps {
    invoices: any[]
    expenses: any[]
}

export function FinancialChart({ invoices, expenses }: FinancialChartProps) {
    const [filter, setFilter] = useState("6months")

    // Sort data first
    const sortedInvoices = useMemo(() => [...invoices].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [invoices])
    const sortedExpenses = useMemo(() => [...expenses].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [expenses])

    const data = useMemo(() => {
        const today = new Date()
        let start: Date
        let end: Date = endOfMonth(today)
        let mode: 'month' | 'year' = 'month'

        if (filter === "6months") {
            start = startOfMonth(subMonths(today, 5))
        } else if (filter === "thisYear") {
            start = startOfYear(today)
        } else if (filter === "all") {
            // Find earliest date
            const firstInvoice = sortedInvoices[0]?.created_at
            const firstExpense = sortedExpenses[0]?.created_at
            const d1 = firstInvoice ? new Date(firstInvoice) : today
            const d2 = firstExpense ? new Date(firstExpense) : today
            start = startOfMonth(d1 < d2 ? d1 : d2)
        } else {
            start = subMonths(today, 5) // Fallback
        }

        const interval = eachMonthOfInterval({ start, end })

        return interval.map(month => {
            const rangeStart = startOfMonth(month)
            const rangeEnd = endOfMonth(month)

            const monthlyInvoices = sortedInvoices.filter(i => {
                const d = new Date(i.created_at)
                return d >= rangeStart && d <= rangeEnd
            })

            const monthlyExpenses = sortedExpenses.filter(e => {
                // Check both created_at and fecha if available (OCR often extracts fecha)
                const dateStr = e.fecha || e.created_at
                const d = new Date(dateStr)
                return d >= rangeStart && d <= rangeEnd
            })

            const paidInvoices = monthlyInvoices.filter(i => i.estado === 'PAGADA' || i.pagada === true || i.statuses?.includes('pagada'))
            const pendingInvoices = monthlyInvoices.filter(i => i.estado !== 'PAGADA' && i.pagada !== true && !i.statuses?.includes('pagada'))

            const paidAmount = paidInvoices.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0)
            const pendingAmount = pendingInvoices.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0)
            const expense = monthlyExpenses.reduce((acc, curr) => {
                const amount = Number(curr.total) || (Number(curr.base_imponible || 0) + Number(curr.iva_importe || 0)) || 0
                return acc + amount
            }, 0)

            const net = (paidAmount + pendingAmount) - expense

            return {
                name: format(month, 'MMM', { locale: es }).toUpperCase(),
                fullDate: month, // Store for logic
                Cobrado: paidAmount,
                Pendiente: pendingAmount,
                Gastos: expense,
                Neto: net
            }
        })
    }, [filter, sortedInvoices, sortedExpenses])

    // Calculate Profit Metrics for the Latest Month in view
    const latestMetrics = useMemo(() => {
        if (data.length === 0) return null
        const current = data[data.length - 1]
        const previous = data.length > 1 ? data[data.length - 2] : null

        const currentProfit = current.Neto
        const previousProfit = previous ? previous.Neto : 0

        // Avoid division by zero
        let percentageChange = 0
        if (previousProfit !== 0) {
            percentageChange = ((currentProfit - previousProfit) / Math.abs(previousProfit)) * 100
        } else if (currentProfit !== 0) {
            percentageChange = 100 // 0 to something is 100% technically or undefined, let's say 100 for growth
        }

        return {
            month: current.name,
            profit: currentProfit,
            percentage: percentageChange,
            hasPrevious: !!previous
        }
    }, [data])


    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Select value={filter} onValueChange={setFilter}>
                        <SelectTrigger className="w-[180px] bg-white">
                            <SelectValue placeholder="Periodo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="6months">Últimos 6 Meses</SelectItem>
                            <SelectItem value="thisYear">Este Año</SelectItem>
                            <SelectItem value="all">Todo el Historial</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 10, right: 10, left: 40, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis
                            dataKey="name"
                            stroke="#64748B"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                        />
                        <YAxis
                            stroke="#64748B"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `${value.toLocaleString('es-ES')}€`}
                        />
                        <Tooltip
                            cursor={{ fill: '#F1F5F9' }}
                            content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="bg-white/95 backdrop-blur shadow-xl border border-slate-100 rounded-xl p-4 min-w-[180px]">
                                            <p className="text-slate-900 font-bold mb-3 border-b pb-2">{label}</p>
                                            <div className="space-y-2.5">
                                                {payload.map((entry: any, index: number) => (
                                                    <div key={index} className="flex items-center justify-between gap-4">
                                                        <div className="flex items-center gap-2">
                                                            <div
                                                                className="h-3 w-3 rounded-full"
                                                                style={{
                                                                    backgroundColor:
                                                                        entry.dataKey === 'Cobrado' ? '#22c55e' :
                                                                            entry.dataKey === 'Pendiente' ? '#f97316' :
                                                                                '#ef4444'
                                                                }}
                                                            />
                                                            <span className="text-slate-500 text-xs font-medium">{entry.name}:</span>
                                                        </div>
                                                        <span className="text-slate-900 text-xs font-mono font-bold">
                                                            {entry.value.toLocaleString('es-ES')} €
                                                        </span>
                                                    </div>
                                                ))}
                                                <div className="pt-2 mt-2 border-t border-slate-50 flex items-center justify-between">
                                                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Beneficio:</span>
                                                    <span className={cn(
                                                        "text-xs font-mono font-extrabold",
                                                        (payload[0]?.payload?.Neto || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                                                    )}>
                                                        {payload[0]?.payload?.Neto?.toLocaleString('es-ES')} €
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '30px' }} />
                        <Bar
                            dataKey="Cobrado"
                            stackId="a"
                            fill="url(#gradientIncome)"
                            radius={[0, 0, 4, 4]}
                            name="Cobrado"
                        />
                        <Bar
                            dataKey="Pendiente"
                            stackId="a"
                            fill="url(#gradientPending)"
                            radius={[4, 4, 0, 0]}
                            name="Pendiente"
                        />
                        <Bar
                            dataKey="Gastos"
                            fill="url(#gradientExpense)"
                            radius={[4, 4, 0, 0]}
                            name="Gastos"
                        />
                        <defs>
                            <linearGradient id="gradientIncome" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#22c55e" stopOpacity={1} />
                                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.8} />
                            </linearGradient>
                            <linearGradient id="gradientPending" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f97316" stopOpacity={1} />
                                <stop offset="100%" stopColor="#ea580c" stopOpacity={0.8} />
                            </linearGradient>
                            <linearGradient id="gradientExpense" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                                <stop offset="100%" stopColor="#dc2626" stopOpacity={0.8} />
                            </linearGradient>
                        </defs>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

'use client'

import * as React from "react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useGlobalFilter } from "@/components/providers/global-filter-provider"

export function GlobalDateSelector() {
    const { month, year, setMonth, setYear } = useGlobalFilter()

    // Generate years (last 5 years + next 1)
    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 6 }, (_, i) => (currentYear - 4 + i).toString()).reverse()

    const months = [
        { value: '0', label: 'Enero' },
        { value: '1', label: 'Febrero' },
        { value: '2', label: 'Marzo' },
        { value: '3', label: 'Abril' },
        { value: '4', label: 'Mayo' },
        { value: '5', label: 'Junio' },
        { value: '6', label: 'Julio' },
        { value: '7', label: 'Agosto' },
        { value: '8', label: 'Septiembre' },
        { value: '9', label: 'Octubre' },
        { value: '10', label: 'Noviembre' },
        { value: '11', label: 'Diciembre' },
    ]

    return (
        <div className="flex items-center gap-2">
            <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[140px] h-9 text-xs font-bold bg-white border-slate-200 text-slate-700 shadow-sm rounded-lg">
                    <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all" className="font-bold text-slate-500">Todo el año</SelectItem>
                    {months.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="font-medium">
                            {m.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-[100px] h-9 text-xs font-bold bg-white border-slate-200 text-slate-700 shadow-sm rounded-lg">
                    <SelectValue placeholder="Año" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all" className="font-bold text-slate-500">Histórico</SelectItem>
                    {years.map((y) => (
                        <SelectItem key={y} value={y} className="font-medium">
                            {y}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}

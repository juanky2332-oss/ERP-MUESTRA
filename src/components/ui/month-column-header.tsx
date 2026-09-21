'use client'


import { useGlobalFilter } from "@/components/providers/global-filter-provider"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronDown } from "lucide-react"
import { useAvailableMonths } from "@/hooks/use-available-months"

interface MonthColumnHeaderProps {
    table?: string // e.g. 'presupuestos'
}

export function MonthColumnHeader({ table }: MonthColumnHeaderProps) {
    const { monthYear, setMonthYear } = useGlobalFilter()

    // If table is provided, fetch distinct months.
    const { data: availableMonths } = useAvailableMonths(table || '')

    return (
        <Popover>
            <PopoverTrigger asChild>
                <div className="flex items-center gap-1 cursor-pointer group hover:bg-slate-100 px-2 py-1 rounded-md -ml-2 transition-colors">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-400 group-hover:text-slate-600">
                        {monthYear === 'all' ? 'MES (TODO)' : monthYear}
                    </span>
                    <ChevronDown className="h-3 w-3 text-slate-400 group-hover:text-slate-600" />
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">Filtrar por Mes</h4>
                    <MonthYearPicker
                        value={monthYear}
                        onChange={setMonthYear}
                        className="w-[200px]"
                        availableMonths={availableMonths}
                    />
                </div>
            </PopoverContent>
        </Popover>
    )
}


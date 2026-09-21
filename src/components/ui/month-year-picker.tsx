
import * as React from "react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { format, subMonths, addMonths, startOfMonth } from "date-fns"
import { es } from "date-fns/locale"

interface MonthYearPickerProps {
    value: string // Format: "YYYY-MM" or "all"
    onChange: (value: string) => void
    placeholder?: string
    className?: string
    availableMonths?: string[] // Optional: Only show these months
}

export function MonthYearPicker({ value, onChange, placeholder = "Filtrar por mes", className, availableMonths }: MonthYearPickerProps) {

    const options = React.useMemo(() => {
        // If availableMonths is provided, use IT.
        if (availableMonths && availableMonths.length > 0) {
            return availableMonths.map(m => {
                const [year, month] = m.split('-').map(Number)
                const date = new Date(year, month - 1)
                return {
                    value: m,
                    label: format(date, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())
                }
            })
        }

        // Fallback: Generate options: Last 24 months + Next 12 months
        const today = new Date()
        const opts = []

        const start = subMonths(today, 24)
        const end = addMonths(today, 12)

        let current = start
        while (current <= end) {
            opts.push({
                value: format(current, 'yyyy-MM'),
                label: format(current, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())
            })
            current = addMonths(current, 1)
        }

        return opts.reverse()
    }, [availableMonths])

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={className || "w-[180px] h-9 text-xs font-bold ring-offset-0 focus:ring-0 bg-slate-50 border-slate-200 text-slate-600"}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all" className="font-bold text-slate-500">Todos los meses</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="font-medium">
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

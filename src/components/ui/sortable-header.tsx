
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface SortableHeaderProps {
    label: string
    columnKey: string
    currentSort: { key: string; direction: 'asc' | 'desc' } | null
    onSort: (key: string, direction: 'asc' | 'desc') => void
    filterValue?: string
    onFilter?: (value: string) => void
    className?: string
}

export function SortableHeader({
    label,
    columnKey,
    currentSort,
    onSort,
    filterValue,
    onFilter,
    className,
}: SortableHeaderProps) {
    const isSorted = currentSort?.key === columnKey
    const isFiltered = filterValue && filterValue.length > 0

    return (
        <div className={cn("flex items-center space-x-1", className)}>
            <Button
                variant="ghost"
                size="sm"
                className="-ml-3 h-8 data-[state=open]:bg-accent hover:bg-slate-100"
                onClick={() => {
                    const nextDir = isSorted && currentSort.direction === 'asc' ? 'desc' : 'asc'
                    onSort(columnKey, nextDir)
                }}
            >
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
                {isSorted ? (
                    currentSort.direction === 'desc' ? <ArrowDown className="ml-2 h-3 w-3 text-blue-600" /> : <ArrowUp className="ml-2 h-3 w-3 text-blue-600" />
                ) : (
                    <ChevronsUpDown className="ml-2 h-3 w-3 opacity-30 group-hover:opacity-100 transition-opacity" />
                )}
            </Button>

            {onFilter && (
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className={cn("h-6 w-6 rounded-full", isFiltered ? "text-blue-600 bg-blue-50 hover:bg-blue-100" : "text-slate-300 hover:text-slate-600 hover:bg-slate-100")}>
                            <Filter className="h-3 w-3" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-3 shadow-xl border-slate-200" align="start">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-xs text-slate-700 uppercase tracking-wide">Filtro: {label}</h4>
                                {isFiltered && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                        onClick={() => onFilter("")}
                                    >
                                        Limpiar
                                    </Button>
                                )}
                            </div>
                            <Input
                                placeholder={`Buscar ${label.toLowerCase()}...`}
                                value={filterValue || ""}
                                onChange={(e) => onFilter(e.target.value)}
                                className="h-8 text-xs bg-slate-50 focus-visible:ring-blue-500"
                            />
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    )
}

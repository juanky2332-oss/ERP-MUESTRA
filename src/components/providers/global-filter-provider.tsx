'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { format } from 'date-fns'
import { useRouter, useSearchParams } from 'next/navigation'
import { es } from 'date-fns/locale'

/* New robust provider supporting separate Month and Year */
interface GlobalFilterContextType {
    month: string // '0'...'11' or 'all'
    year: string // '2024' or 'all'
    setMonth: (value: string) => void
    setYear: (value: string) => void
    label: string
}

const GlobalFilterContext = createContext<GlobalFilterContextType | undefined>(undefined)

export function GlobalFilterProvider({ children }: { children: ReactNode }) {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Initialize from URL or default
    const currentMonth = searchParams.get('month') || 'all'
    const currentYear = searchParams.get('year') || new Date().getFullYear().toString()

    const setMonth = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (value === 'all') params.delete('month')
        else params.set('month', value)
        router.push(`?${params.toString()}`, { scroll: false })
    }

    const setYear = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (value === 'all') params.delete('year')
        else params.set('year', value)
        router.push(`?${params.toString()}`, { scroll: false })
    }

    const label = currentMonth === 'all'
        ? `Todo ${currentYear === 'all' ? 'el historial' : currentYear}`
        : `${format(new Date(Number(currentYear === 'all' ? new Date().getFullYear() : currentYear), Number(currentMonth)), 'MMMM', { locale: es })} ${currentYear === 'all' ? '' : currentYear}`

    return (
        <GlobalFilterContext.Provider value={{ month: currentMonth, year: currentYear, setMonth, setYear, label }}>
            {children}
        </GlobalFilterContext.Provider>
    )
}

export function useGlobalFilter() {
    const context = useContext(GlobalFilterContext)
    if (context === undefined) {
        throw new Error('useGlobalFilter must be used within a GlobalFilterProvider')
    }
    return context
}

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, Suspense } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { GlobalFilterProvider } from '@/components/providers/global-filter-provider'
import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient())

    return (
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
            <Suspense fallback={null}>
                <GlobalFilterProvider>
                    {children}
                </GlobalFilterProvider>
            </Suspense>
            <Toaster />
        </QueryClientProvider>
        </ThemeProvider>
    )
}

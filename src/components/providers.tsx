'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, Suspense } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { GlobalFilterProvider } from '@/components/providers/global-filter-provider'

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient())

    return (
        <QueryClientProvider client={queryClient}>
            <Suspense fallback={null}>
                <GlobalFilterProvider>
                    {children}
                </GlobalFilterProvider>
            </Suspense>
            <Toaster />
        </QueryClientProvider>
    )
}

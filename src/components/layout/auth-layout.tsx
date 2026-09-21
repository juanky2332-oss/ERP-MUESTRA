'use client'

import { usePathname } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { ChatWidget } from '@/components/chat-widget'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <>
      <AppShell>{children}</AppShell>
      <ChatWidget />
    </>
  )
}

import { getTelegramStatus } from '@/actions/telegram'
import { PageHeader } from '@/components/ui/page-header'
import { TelegramConnectCard } from '@/components/settings/telegram-connect-card'

export const dynamic = 'force-dynamic'

export default async function AjustesPage() {
    const status = await getTelegramStatus()

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
            <PageHeader
                title="Ajustes"
                breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Ajustes' }]}
            />
            <TelegramConnectCard initialStatus={status} />
        </div>
    )
}

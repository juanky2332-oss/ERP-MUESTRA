import { getTelegramStatus } from '@/actions/telegram'
import { getAjustes } from '@/actions/ajustes'
import { TelegramConnectCard } from '@/components/settings/telegram-connect-card'
import { AjustesCliente } from '@/components/settings/ajustes-cliente'

export const dynamic = 'force-dynamic'

export default async function AjustesPage() {
    const [status, ajustes] = await Promise.all([getTelegramStatus(), getAjustes()])

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
            <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">Ajustes</h1>
                <p className="text-muted-foreground mt-1">Empresa, usuarios, Telegram, IA y preferencias.</p>
            </div>
            {ajustes.success ? (
                <AjustesCliente datos={ajustes} telegram={<div id="telegram"><TelegramConnectCard initialStatus={status} /></div>} />
            ) : (
                <p className="text-rose-600">{ajustes.error}</p>
            )}
        </div>
    )
}

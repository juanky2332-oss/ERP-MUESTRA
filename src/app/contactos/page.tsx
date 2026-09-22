'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useContacts } from '@/hooks/use-contacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Search, Phone, Mail, Building2, Users, Archive } from 'lucide-react'
import { ContactForm } from '@/components/contacts/contact-form'
import { FichaClienteSheet } from '@/components/contacts/ficha-cliente'
import { EmptyState } from '@/components/ui/empty-state'
import { Contacto } from '@/types'
import { cn, formatCurrency } from '@/lib/utils'

export default function ContactsPage() {
    const params = useSearchParams()
    const { contacts, isLoading } = useContacts()
    const [q, setQ] = useState('')
    const [verArchivados, setVerArchivados] = useState(false)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<Contacto | null>(null)
    const [ficha, setFicha] = useState<string | null>(null)

    useEffect(() => { if (params.get('nuevo') === '1') { setEditing(null); setFormOpen(true) } }, [params])

    const lista = useMemo(() => {
        const t = q.toLowerCase().trim()
        return (contacts || []).filter((c: any) => {
            if (!!c.archivado !== verArchivados) return false
            if (!t) return true
            return [c.razon_social, c.cif, c.email, c.email_facturacion, c.telefono, c.telefono_alternativo, c.direccion, c.ciudad, c.referencia, c.persona_contacto, ...(c.emails || [])]
                .some((v: any) => v && String(v).toLowerCase().includes(t))
        })
    }, [contacts, q, verArchivados])

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">Clientes</h1>
                    <p className="text-muted-foreground mt-1">Fichas, condiciones de pago e historial de cada cliente.</p>
                </div>
                <Button onClick={() => { setEditing(null); setFormOpen(true) }} className="font-bold"><Plus className="mr-2 h-4 w-4" /> Nuevo cliente</Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Nombre, teléfono, email, NIF, dirección o referencia…" className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
                </div>
                <Button variant={verArchivados ? 'secondary' : 'ghost'} size="sm" onClick={() => setVerArchivados(v => !v)}>
                    <Archive className="h-4 w-4 mr-1" /> {verArchivados ? 'Viendo archivados' : 'Ver archivados'}
                </Button>
            </div>

            {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
                </div>
            ) : lista.length === 0 ? (
                <EmptyState icon={Users} title={q ? 'Sin resultados' : verArchivados ? 'No hay clientes archivados' : 'Aún no hay clientes'} description={q ? 'Prueba con otro término.' : 'Da de alta tu primer cliente para empezar a presupuestar y facturar.'} actionLabel={!q && !verArchivados ? 'Nuevo cliente' : undefined} onAction={() => { setEditing(null); setFormOpen(true) }} />
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {lista.map((c: any) => (
                        <button key={c.id} onClick={() => setFicha(c.id)} className={cn('text-left rounded-2xl border bg-card p-4 hover:shadow-md hover:border-primary/30 transition-all duration-200', c.archivado && 'opacity-60')}>
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Building2 className="h-5 w-5" /></div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-extrabold text-foreground truncate">{c.razon_social}</p>
                                    <p className="text-xs text-muted-foreground font-mono">{c.cif}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Facturado</p>
                                    <p className="text-sm font-bold tabular-nums">{formatCurrency(Number(c.total_facturado) || 0)}</p>
                                </div>
                            </div>
                            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                {c.telefono && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.telefono}</p>}
                                {c.email && <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3" />{c.email}</p>}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>{editing ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle></DialogHeader>
                    <ContactForm contactToEdit={editing} onSuccess={() => setFormOpen(false)} />
                </DialogContent>
            </Dialog>

            <FichaClienteSheet clienteId={ficha} open={!!ficha} onOpenChange={v => !v && setFicha(null)} onEditar={(c) => { setFicha(null); setEditing(c); setFormOpen(true) }} />
        </div>
    )
}

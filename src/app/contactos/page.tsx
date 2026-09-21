'use client'

import { useState } from 'react'
import { useContacts } from '@/hooks/use-contacts'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Search, Pencil, Trash2, Phone, Mail, Building2 } from 'lucide-react'
import { ContactForm } from '@/components/contacts/contact-form'
import { Contacto } from '@/types'
import { toast } from 'sonner'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog" // Need to install alert-dialog? Yes, standard shadcn.

export default function ContactsPage() {
    const { contacts, isLoading, deleteContact } = useContacts()
    const [searchTerm, setSearchTerm] = useState('')
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingContact, setEditingContact] = useState<Contacto | null>(null)

    const filteredContacts = contacts?.filter(contact =>
        contact.razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.cif.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (contact.email && contact.email.toLowerCase().includes(searchTerm.toLowerCase()))
    ) || []

    const handleDelete = async (id: string) => {
        try {
            await deleteContact.mutateAsync(id)
        } catch (e) {
            console.error(e)
        }
    }

    const handleEdit = (contact: Contacto) => {
        setEditingContact(contact)
        setIsDialogOpen(true)
    }

    const handleCreate = () => {
        setEditingContact(null)
        setIsDialogOpen(true)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Contactos</h1>
                    <p className="text-gray-500">Gestiona tu base de datos de clientes y proveedores.</p>
                </div>
                <Button onClick={handleCreate} className="bg-[#1E88E5] hover:bg-[#1565C0]">
                    <Plus className="mr-2 h-4 w-4" /> Nuevo Contacto
                </Button>
            </div>

            <div className="flex items-center gap-2 max-w-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Buscar por nombre, CIF, email..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-50">
                        <TableRow>
                            <TableHead className="w-[300px]">Razón Social</TableHead>
                            <TableHead>Contacto</TableHead>
                            <TableHead>Ubicación</TableHead>
                            <TableHead>Total Facturado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                                    Cargando contactos...
                                </TableCell>
                            </TableRow>
                        ) : filteredContacts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                                    No se encontraron contactos.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredContacts.map((contact) => (
                                <TableRow key={contact.id} className="hover:bg-gray-50/50">
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-gray-900">{contact.razon_social}</span>
                                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                                <Building2 className="h-3 w-3" /> {contact.cif}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            {contact.email && (
                                                <span className="text-sm text-gray-600 flex items-center gap-1">
                                                    <Mail className="h-3 w-3" /> {contact.email}
                                                </span>
                                            )}
                                            {(contact as any).emails && (contact as any).emails.filter((e: string) => e !== contact.email).length > 0 && (
                                                <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full w-fit ml-4">
                                                    +{(contact as any).emails.filter((e: string) => e !== contact.email).length} más
                                                </span>
                                            )}
                                            {contact.telefono && (
                                                <span className="text-sm text-gray-600 flex items-center gap-1">
                                                    <Phone className="h-3 w-3" /> {contact.telefono}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-gray-600">
                                            {[contact.ciudad, contact.provincia].filter(Boolean).join(', ')}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="font-semibold text-gray-900">
                                            {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(contact.total_facturado || 0)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleEdit(contact)}>
                                                <Pencil className="h-4 w-4 text-gray-500 hover:text-blue-600" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => {
                                                if (confirm('¿Estás seguro de eliminar este contacto?')) {
                                                    handleDelete(contact.id)
                                                }
                                            }}>
                                                <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-600" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{editingContact ? 'Editar Contacto' : 'Nuevo Contacto'}</DialogTitle>
                    </DialogHeader>
                    <ContactForm
                        contactToEdit={editingContact}
                        onSuccess={() => setIsDialogOpen(false)}
                    />
                </DialogContent>
            </Dialog>

        </div>
    )
}

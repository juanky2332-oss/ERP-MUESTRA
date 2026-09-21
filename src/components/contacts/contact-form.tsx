'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useContacts } from '@/hooks/use-contacts'
import { Contacto } from '@/types'
import { useState, useEffect } from 'react'
import { MultiEmailInput } from '@/components/ui/multi-email-input'

const contactSchema = z.object({
    razon_social: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    cif: z.string().min(9, 'El CIF debe tener 9 caracteres'),
    direccion: z.string().optional(),
    codigo_postal: z.string().optional(),
    ciudad: z.string().optional(),
    provincia: z.string().optional(),
    telefono: z.string().optional(),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    persona_contacto: z.string().optional(),
    observaciones: z.string().optional(),
})

type ContactFormValues = z.infer<typeof contactSchema>

interface ContactFormProps {
    contactToEdit?: any // Using any to accommodate 'emails' property added in hook
    onSuccess: () => void
}

export function ContactForm({ contactToEdit, onSuccess }: ContactFormProps) {
    const { createContact, updateContact } = useContacts()
    const [otherEmails, setOtherEmails] = useState<string[]>([])

    const form = useForm<ContactFormValues>({
        resolver: zodResolver(contactSchema),
        defaultValues: {
            razon_social: '',
            cif: '',
            direccion: '',
            codigo_postal: '',
            ciudad: '',
            provincia: '',
            telefono: '',
            email: '',
            persona_contacto: '',
            observaciones: '',
        },
    })

    useEffect(() => {
        if (contactToEdit) {
            form.reset({
                razon_social: contactToEdit.razon_social,
                cif: contactToEdit.cif,
                direccion: contactToEdit.direccion || '',
                codigo_postal: contactToEdit.codigo_postal || '',
                ciudad: contactToEdit.ciudad || '',
                provincia: contactToEdit.provincia || '',
                telefono: contactToEdit.telefono || '',
                email: contactToEdit.email || '',
                persona_contacto: contactToEdit.persona_contacto || '',
                observaciones: contactToEdit.observaciones || '',
            })
            // Load other emails, excluding the primary one if present in the list
            if (contactToEdit.emails) {
                const others = contactToEdit.emails.filter((e: string) => e !== contactToEdit.email)
                setOtherEmails(others)
            }
        } else {
            form.reset({
                razon_social: '',
                cif: '',
                direccion: '',
                codigo_postal: '',
                ciudad: '',
                provincia: '',
                telefono: '',
                email: '',
                persona_contacto: '',
                observaciones: '',
            })
            setOtherEmails([])
        }
    }, [contactToEdit, form])

    const onSubmit = async (values: ContactFormValues) => {
        try {
            // Combine primary email with secondary emails for the backend
            // Primary email logic: User modifies 'Email' field.
            // Backend update expects: { ...values, emails: [primary, ...others] }

            const allEmails = new Set<string>()
            if (values.email) allEmails.add(values.email)
            otherEmails.forEach(e => allEmails.add(e))

            const payload = {
                ...values,
                emails: Array.from(allEmails)
            }

            if (contactToEdit) {
                await updateContact.mutateAsync({ id: contactToEdit.id, ...payload })
            } else {
                await createContact.mutateAsync(payload)
            }
            onSuccess()
        } catch (error) {
            console.error(error)
        }
    }

    const isSubmitting = createContact.isPending || updateContact.isPending

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="razon_social"
                        render={({ field }) => (
                            <FormItem className="col-span-2">
                                <FormLabel>Razón Social <span className="text-red-500">*</span></FormLabel>
                                <FormControl>
                                    <Input placeholder="Empresa S.L." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="cif"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>CIF/NIF <span className="text-red-500">*</span></FormLabel>
                                <FormControl>
                                    <Input placeholder="B12345678" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="telefono"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Teléfono</FormLabel>
                                <FormControl>
                                    <Input placeholder="600 000 000" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem className="col-span-2">
                                <FormLabel>Email Principal <span className="text-red-500">*</span></FormLabel>
                                <FormControl>
                                    <Input placeholder="contacto@empresa.com" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Secondary Emails - Integrated into the same logical section */}
                    <div className="col-span-2">
                        <FormLabel className="text-sm font-medium">Otros Emails (Separados por coma o Enter)</FormLabel>
                        <MultiEmailInput
                            emails={otherEmails}
                            onEmailsChange={setOtherEmails}
                            className="mt-2"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Estos emails también recibirán las notificaciones si se seleccionan.</p>
                    </div>
                    <FormField
                        control={form.control}
                        name="direccion"
                        render={({ field }) => (
                            <FormItem className="col-span-2">
                                <FormLabel>Dirección</FormLabel>
                                <FormControl>
                                    <Input placeholder="Calle Principal, 123" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="ciudad"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Ciudad</FormLabel>
                                <FormControl>
                                    <Input placeholder="Murcia" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="provincia"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Provincia</FormLabel>
                                <FormControl>
                                    <Input placeholder="Murcia" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={onSuccess}>Cancelar</Button>
                    <Button type="submit" disabled={isSubmitting} className="bg-[#1E88E5] hover:bg-[#1565C0]">
                        {isSubmitting ? 'Guardando...' : contactToEdit ? 'Actualizar' : 'Crear Contacto'}
                    </Button>
                </div>
            </form>
        </Form>
    )
}

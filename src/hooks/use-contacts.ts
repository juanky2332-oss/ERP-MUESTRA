'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Contacto } from '@/types'
import { toast } from 'sonner'

export function useContacts() {
    const queryClient = useQueryClient()

    const { data: contacts, isLoading, error } = useQuery({
        queryKey: ['contacts'],
        queryFn: async () => {

            // 1. Fetch contacts
            const { data: contactsData, error: contactsError } = await supabase
                .from('contactos')
                .select('*')
                .order('razon_social')

            if (contactsError) throw contactsError

            // 2. Fetch emails separately to avoid relation issues
            const { data: emailsData, error: emailsError } = await supabase
                .from('client_emails')
                .select('*')

            if (emailsError) {
                console.error('Error fetching client emails:', emailsError)
                // Continue without emails if this fails
            }

            // 3. Fetch invoices for totals
            const { data: facturasData, error: facturasError } = await supabase
                .from('facturas')
                .select('cliente_id, total')

            if (facturasError) {
                console.error('Error fetching invoices for totals:', facturasError)
            }

            const totalsByContact: Record<string, number> = {}
            facturasData?.forEach((f: any) => {
                if (f.cliente_id) {
                    totalsByContact[f.cliente_id] = (totalsByContact[f.cliente_id] || 0) + Number(f.total)
                }
            })

            // 4. Merge data
            const enrichedContacts = (contactsData || []).map(c => {
                // Find emails for this contact
                const contactEmails = emailsData
                    ? emailsData.filter((e: any) => e.client_id === c.id).map((e: any) => e.email)
                    : []

                return {
                    ...c,
                    total_facturado: totalsByContact[c.id] || 0,
                    emails: contactEmails
                }
            })

            return enrichedContacts
        }

    })

    const createContact = useMutation({
        mutationFn: async (newContact: any) => {
            const { emails, id, total_facturado, ...rest } = newContact
            const contactData = rest

            // 1. Insert Contact
            const { data: insertedContact, error } = await supabase
                .from('contactos')
                .insert(contactData)
                .select()
                .single()

            if (error) throw error

            // 2. Insert Emails if present
            if (emails && emails.length > 0) {
                const emailRows = emails.map((email: string) => ({
                    client_id: insertedContact.id,
                    email: email
                }))
                const { error: emailError } = await supabase.from('client_emails').insert(emailRows)
                if (emailError) console.error("Error inserting emails:", emailError)
            }

            return insertedContact
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
            toast.success('Contacto creado correctamente')
        },
        onError: (error: any) => {
            toast.error('Error al crear contacto: ' + error.message)
        }
    })

    const updateContact = useMutation({
        mutationFn: async ({ id, ...updates }: any) => {
            const { emails, ...contactData } = updates

            // 1. Update Contact
            const { data, error } = await supabase
                .from('contactos')
                .update(contactData)
                .eq('id', id)
                .select()
                .single()

            if (error) throw error

            // 2. Update Emails
            if (emails !== undefined) {
                // Delete existing
                const { error: deleteError } = await supabase.from('client_emails').delete().eq('client_id', id)
                if (deleteError) console.error('Error clearing old emails:', deleteError)

                // Insert new ones
                if (emails.length > 0) {
                    const emailRows = emails.map((email: string) => ({
                        client_id: id,
                        email: email
                    }))
                    const { error: insertError } = await supabase.from('client_emails').insert(emailRows)
                    if (insertError) console.error('Error inserting new emails:', insertError)
                }
            }

            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
            toast.success('Contacto actualizado correctamente')
        },
        onError: (error: any) => {
            toast.error('Error al actualizar contacto: ' + error.message)
        }
    })

    const deleteContact = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('contactos')
                .delete()
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
            toast.success('Contacto eliminado correctamente')
        },
        onError: (error: any) => {
            toast.error('Error al eliminar contacto: ' + error.message)
        }
    })

    return {
        contacts,
        isLoading,
        error,
        createContact,
        updateContact,
        deleteContact
    }
}

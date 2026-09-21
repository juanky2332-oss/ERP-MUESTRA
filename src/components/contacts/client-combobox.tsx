'use client'

import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { useContacts } from '@/hooks/use-contacts'
import { Contacto } from '@/types'

interface ClientComboboxProps {
    value?: string
    onChange: (value: string, contact?: Contacto) => void
}

export function ClientCombobox({ value, onChange }: ClientComboboxProps) {
    const [open, setOpen] = React.useState(false)
    const { contacts } = useContacts()

    const selectedContact = contacts?.find((contact) => contact.id === value)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    {value
                        ? contacts?.find((contact) => contact.id === value)?.razon_social
                        : "Seleccionar cliente..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
                <Command>
                    <CommandInput placeholder="Buscar cliente..." />
                    <CommandList>
                        <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                        <CommandGroup>
                            {contacts?.map((contact) => (
                                <CommandItem
                                    key={contact.id}
                                    value={contact.razon_social}
                                    onSelect={(currentValue) => {
                                        onChange(contact.id === value ? "" : contact.id, contact)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === contact.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {contact.razon_social}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

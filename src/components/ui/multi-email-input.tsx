"use client"

import * as React from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface MultiEmailInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    emails: string[]
    onEmailsChange: (emails: string[]) => void
}

export function MultiEmailInput({ className, emails = [], onEmailsChange, ...props }: MultiEmailInputProps) {
    const [inputValue, setInputValue] = React.useState("")
    const [error, setError] = React.useState<string | null>(null)

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === "," || e.key === " ") {
            e.preventDefault()
            addEmail()
        } else if (e.key === "Backspace" && !inputValue && emails.length > 0) {
            onEmailsChange(emails.slice(0, -1))
        }
    }

    const validateEmail = (email: string) => {
        return String(email)
            .toLowerCase()
            .match(
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            )
    }

    const addEmail = () => {
        const email = inputValue.trim()
        if (!email) return

        if (!validateEmail(email)) {
            setError("Email inválido")
            return
        }

        if (emails.includes(email)) {
            setInputValue("")
            return
        }

        onEmailsChange([...emails, email])
        setInputValue("")
        setError(null)
    }

    const removeEmail = (indexToRemove: number) => {
        onEmailsChange(emails.filter((_, index) => index !== indexToRemove))
    }

    return (
        <div className="space-y-2">
            <div className={cn(
                "flex flex-wrap gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                className
            )}>
                {emails.map((email, index) => (
                    <Badge key={index} variant="secondary" className="gap-1 pr-0.5">
                        {email}
                        <button
                            type="button"
                            onClick={() => removeEmail(index)}
                            className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                        >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Remove</span>
                        </button>
                    </Badge>
                ))}
                <input
                    {...props}
                    type="text"
                    className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-[150px]"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value)
                        setError(null)
                    }}
                    onKeyDown={handleKeyDown}
                    onBlur={() => addEmail()}
                    placeholder={emails.length === 0 ? "Añadir emails..." : ""}
                />
            </div>
            {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
        </div>
    )
}

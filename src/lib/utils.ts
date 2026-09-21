import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumberInput(value: string): string {
  // Permitir vacío
  if (value === '') return ''

  // Permitir "0." para empezar a escribir decimales
  if (value === '0.') return '0.'

  // Si empieza por 0 pero no sigue un punto (ej: "05"), quitar el 0 ("5")
  if (value.startsWith('0') && value.length > 1 && value[1] !== '.') {
    return parseFloat(value).toString()
  }

  return value
}

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

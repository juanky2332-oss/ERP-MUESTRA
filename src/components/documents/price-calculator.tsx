'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Calculator } from "lucide-react"
import { calculateInversePrice } from '@/lib/calculations'
import { formatNumberInput } from '@/lib/utils'

interface PriceCalculatorProps {
    onCalculate: (price: number) => void
    units: number
}

export function PriceCalculator({ onCalculate }: { onCalculate: (price: number) => void }) {
    const [open, setOpen] = useState(false)
    const [materialCost, setMaterialCost] = useState('')
    const [laborCost, setLaborCost] = useState('')
    const [margin, setMargin] = useState('')

    const calculatedPrice = calculateInversePrice(Number(materialCost), Number(laborCost), Number(margin), 1)

    const handleApply = () => {
        onCalculate(calculatedPrice)
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-1 text-gray-400 hover:text-[#1E88E5]">
                    <Calculator className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Cálculo Inverso</h4>
                        <p className="text-sm text-muted-foreground">
                            Calcula el precio unitario en base a costes.
                        </p>
                    </div>
                    <div className="grid gap-2">
                        <div className="grid grid-cols-3 items-center gap-4">
                            <Label htmlFor="material">Material (€)</Label>
                            <Input
                                id="material"
                                type="number"
                                step="0.01"
                                className="col-span-2 h-8"
                                value={materialCost}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaterialCost(formatNumberInput(e.target.value))}
                            />
                        </div>
                        <div className="grid grid-cols-3 items-center gap-4">
                            <Label htmlFor="labor">Mano Obra (€)</Label>
                            <Input
                                id="labor"
                                type="number"
                                step="0.01"
                                className="col-span-2 h-8"
                                value={laborCost}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLaborCost(formatNumberInput(e.target.value))}
                            />
                        </div>
                        <div className="grid grid-cols-3 items-center gap-4">
                            <Label htmlFor="margin">Margen (%)</Label>
                            <Input
                                id="margin"
                                type="number"
                                step="1"
                                className="col-span-2 h-8"
                                value={margin}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMargin(formatNumberInput(e.target.value))}
                            />
                        </div>
                        <div className="pt-2 border-t mt-2">
                            <div className="flex justify-between font-bold text-[#1E88E5] mb-4">
                                <span>Precio Calculado:</span>
                                <span>{calculatedPrice.toLocaleString('es-ES')} €</span>
                            </div>
                            <Button className="w-full bg-[#1E88E5]" onClick={handleApply}>
                                Aplicar al Documento
                            </Button>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

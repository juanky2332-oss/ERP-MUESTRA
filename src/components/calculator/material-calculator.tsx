'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMaterialPrices } from '@/hooks/use-materials'
import { Loader2, Calculator } from 'lucide-react'
import { formatNumberInput } from '@/lib/utils'

const DENSITIES: Record<string, number> = {
    'Acero inoxidable 304': 7.93,
    'Acero inoxidable 316': 7.98,
    'Acero al carbono S235': 7.85,
    'Acero F114': 7.85,
    'Acero F125': 7.85,
    'Acero ST-52': 7.85,
    'Aluminio 6082': 2.70,
    'Aluminio 7075': 2.81,
    'Aluminio 5083': 2.66,
    'Latón CuZn37': 8.50,
    'Latón CuZn39Pb3': 8.50,
    'Cobre Cu-ETP': 8.96,
    'Bronce': 8.80,
    'Bronce RG7': 8.70,
    'Bronce Aluminio': 7.60,
    'Titanio Gr2': 4.51,
    'Titanio Gr5': 4.43,
    'PVC': 1.40,
    'Metacrilato': 1.19,
    'Policarbonato': 1.20,
    'POM': 1.41,
    'Delrin (POM)': 1.41,
    'Teflón': 2.20,
    'Teflón (PTFE)': 2.20,
    'Nylon': 1.15,
    'Nylon 6': 1.13,
    'Nylon 66': 1.14,
    'Peek': 1.32
}

type Formato = 'barra_redonda' | 'barra_cuadrada' | 'barra_rectangular' | 'chapa' | 'tubo_redondo' | 'tubo_cuadrado'

export function MaterialCalculator() {
    const { data: pricesRaw, isLoading } = useMaterialPrices()
    const [selectedMaterialId, setSelectedMaterialId] = useState<string>('')
    const [formato, setFormato] = useState<Formato>('barra_redonda')

    // Dimensions (mm)
    const [d1, setD1] = useState<string>('') // Diameter / Side / Width
    const [d2, setD2] = useState<string>('') // Height / Thickness / Wall
    const [d3, setD3] = useState<string>('') // Length (or Piece Length)

    // Quantity
    const [quantity, setQuantity] = useState<string>('1')

    const [weight, setWeight] = useState<number>(0)
    const [unitCost, setUnitCost] = useState<number>(0)
    const [totalCost, setTotalCost] = useState<number>(0)

    // Merge default density list with fetched prices (some might be missing in DB, some missing in DENSITIES)
    // In a real app, density should probably be in the DB.
    // For now we map by name.

    const selectedMaterial = pricesRaw?.find(p => p.id === selectedMaterialId)

    useEffect(() => {
        if (!selectedMaterial) return

        const density = DENSITIES[selectedMaterial.material] || 7.85
        let volume = 0 // cm3

        const val1 = parseFloat(d1) || 0
        const val2 = parseFloat(d2) || 0
        const val3 = parseFloat(d3) || 0
        const qty = parseFloat(quantity) || 1

        // Dimensions are in mm, so divide by 10 to get cm
        const v1 = val1 / 10
        const v2 = val2 / 10
        const v3 = val3 / 10

        switch (formato) {
            case 'barra_redonda':
                // Pi * r^2 * h
                volume = Math.PI * Math.pow(v1 / 2, 2) * v3
                break
            case 'barra_cuadrada':
                // w * w * h
                volume = v1 * v1 * v3
                break
            case 'barra_rectangular':
            case 'chapa':
                // w * h * l
                volume = v1 * v2 * v3
                break
            case 'tubo_redondo':
                // Outer volume - Inner volume
                // d1 = OD, d2 = Thickness, d3 = Length
                const r_out = v1 / 2
                const r_in = r_out - v2
                if (r_in > 0) {
                    volume = (Math.PI * Math.pow(r_out, 2) * v3) - (Math.PI * Math.pow(r_in, 2) * v3)
                }
                break
            case 'tubo_cuadrado':
                // Outer box - inner box
                const side_out = v1
                const side_in = side_out - (2 * v2)
                if (side_in > 0) {
                    volume = (side_out * side_out * v3) - (side_in * side_in * v3)
                }
                break
        }

        const calculatedWeightInfo = volume * density / 1000 // kg (density is g/cm3)
        const uCost = calculatedWeightInfo * (selectedMaterial.precio_por_kg || 0)

        setWeight(calculatedWeightInfo)
        setUnitCost(uCost)
        setTotalCost(uCost * qty)

    }, [selectedMaterial, formato, d1, d2, d3, quantity])

    if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="animate-spin" /></div>

    return (
        <Card className="w-full max-w-4xl mx-auto shadow-lg border-2 border-blue-50">
            <CardHeader className="bg-blue-50/50">
                <div className="flex items-center gap-2">
                    <Calculator className="h-6 w-6 text-blue-600" />
                    <CardTitle className="text-blue-900">Calculadora de Costes y Materiales</CardTitle>
                </div>
                <CardDescription>Presupuesto rápido de materia prima.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label>Material</Label>
                        <Select onValueChange={setSelectedMaterialId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar material" />
                            </SelectTrigger>
                            <SelectContent>
                                {pricesRaw?.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.material} ({p.precio_por_kg} €/kg)</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Formato</Label>
                        <Select value={formato} onValueChange={(v) => setFormato(v as Formato)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="barra_redonda">Barra Redonda</SelectItem>
                                <SelectItem value="barra_cuadrada">Barra Cuadrada</SelectItem>
                                <SelectItem value="barra_rectangular">Barra Rectangular / Pletina</SelectItem>
                                <SelectItem value="chapa">Chapa / Placa</SelectItem>
                                <SelectItem value="tubo_redondo">Tubo Redondo</SelectItem>
                                <SelectItem value="tubo_cuadrado">Tubo Cuadrado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Dynamic Inputs */}
                    {formato === 'barra_redonda' && (
                        <>
                            <div className="space-y-2">
                                <Label>Diámetro (mm)</Label>
                                <Input type="number" value={d1} onChange={e => setD1(formatNumberInput(e.target.value))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Longitud (mm)</Label>
                                <Input type="number" value={d3} onChange={e => setD3(formatNumberInput(e.target.value))} />
                            </div>
                        </>
                    )}
                    {formato === 'barra_cuadrada' && (
                        <>
                            <div className="space-y-2">
                                <Label>Lado (mm)</Label>
                                <Input type="number" value={d1} onChange={e => setD1(formatNumberInput(e.target.value))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Longitud (mm)</Label>
                                <Input type="number" value={d3} onChange={e => setD3(formatNumberInput(e.target.value))} />
                            </div>
                        </>
                    )}
                    {(formato === 'barra_rectangular' || formato === 'chapa') && (
                        <>
                            <div className="space-y-2">
                                <Label>{formato === 'chapa' ? 'Largo' : 'Ancho'} (mm)</Label>
                                <Input type="number" value={d1} onChange={e => setD1(formatNumberInput(e.target.value))} />
                            </div>
                            <div className="space-y-2">
                                <Label>{formato === 'chapa' ? 'Ancho' : 'Espesor/Alto'} (mm)</Label>
                                <Input type="number" value={d2} onChange={e => setD2(formatNumberInput(e.target.value))} />
                            </div>
                            <div className="space-y-2">
                                <Label>{formato === 'chapa' ? 'Espesor' : 'Longitud'} (mm)</Label>
                                <Input type="number" value={d3} onChange={e => setD3(formatNumberInput(e.target.value))} />
                            </div>
                        </>
                    )}
                    {formato.startsWith('tubo') && (
                        <>
                            <div className="space-y-2">
                                <Label>{formato === 'tubo_redondo' ? 'Diámetro Ext.' : 'Lado'} (mm)</Label>
                                <Input type="number" value={d1} onChange={e => setD1(formatNumberInput(e.target.value))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Espesor Pared (mm)</Label>
                                <Input type="number" value={d2} onChange={e => setD2(formatNumberInput(e.target.value))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Longitud (mm)</Label>
                                <Input type="number" value={d3} onChange={e => setD3(formatNumberInput(e.target.value))} />
                            </div>
                        </>
                    )}

                    <div className="space-y-2">
                        <Label>Cantidad</Label>
                        <Input type="number" value={quantity} onChange={e => setQuantity(formatNumberInput(e.target.value))} className="bg-blue-50 font-bold" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <div className="bg-gray-50 rounded-lg p-6 flex flex-col justify-center space-y-2 border border-gray-100">
                        <span className="text-gray-500 text-sm">Resumen Unitario</span>
                        <div className="flex justify-between items-center">
                            <span>Peso U.:</span>
                            <span className="font-medium">{weight.toFixed(2)} kg</span>
                        </div>
                        <div className="flex justify-between items-center text-gray-900">
                            <span>Coste U.:</span>
                            <span className="font-bold">{unitCost.toFixed(2)} €</span>
                        </div>
                    </div>
                    <div className="bg-blue-600 rounded-lg p-6 flex flex-col items-center justify-center text-center space-y-1 text-white shadow-md">
                        <span className="text-blue-100 text-sm uppercase tracking-wider font-semibold">Coste Total ({quantity} unids)</span>
                        <span className="text-4xl font-bold">{totalCost.toFixed(2)} €</span>
                        <span className="text-blue-200 text-sm">{(weight * parseInt(quantity || '0')).toFixed(2)} kg Total</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Calculator, Info, TrendingUp, Scale, Euro } from "lucide-react"
import { formatNumberInput } from '@/lib/utils'

const MATERIALS = [
    { id: 'acero_comun', name: 'Acero F-1 [F-114]', density: 7.85, marketPrice: 1.80, category: 'Aceros' },
    { id: 'acero_bonificado', name: 'Acero F-125 / F-127', density: 7.85, marketPrice: 2.20, category: 'Aceros' },
    { id: 'inox_304', name: 'Acero Inox AISI 304', density: 7.9, marketPrice: 4.50, category: 'Inoxidables' },
    { id: 'inox_316', name: 'Acero Inox AISI 316', density: 8.0, marketPrice: 5.80, category: 'Inoxidables' },
    { id: 'aluminio_6082', name: 'Aluminio 6082', density: 2.70, marketPrice: 6.50, category: 'Aluminios' },
    { id: 'aluminio_7075', name: 'Aluminio 7075', density: 2.80, marketPrice: 8.90, category: 'Aluminios' },
    { id: 'laton', name: 'Latón', density: 8.50, marketPrice: 9.20, category: 'Metales Amarillos' },
    { id: 'bronce', name: 'Bronce', density: 8.80, marketPrice: 12.50, category: 'Metales Amarillos' },
    { id: 'nylon', name: 'Plástico Técnico (Nylon)', density: 1.15, marketPrice: 8.00, category: 'Plásticos' },
    { id: 'delrin', name: 'Plástico (Delrin/POM)', density: 1.41, marketPrice: 10.50, category: 'Plásticos' },
    { id: 'pvc', name: 'Plástico (PVC)', density: 1.40, marketPrice: 4.20, category: 'Plásticos' },
]

const SHAPES = [
    { id: 'barra', name: 'Barra Redonda / Eje' },
    { id: 'cuadrado', name: 'Barra Cuadrada' },
    { id: 'tubo', name: 'Tubo Redondo' },
    { id: 'tubo_rect', name: 'Tubo Cuadrado / Rectangular' },
    { id: 'placa', name: 'Placa / Pletina' },
    { id: 'hexagono', name: 'Barra Hexagonal' },
    { id: 'angulo', name: 'Ángulo (L)' },
    { id: 'perfil_u', name: 'Perfil U' },
    { id: 'perfil_t', name: 'Perfil T' },
]

function ShapeDiagram({ shapeId }: { shapeId: string }) {
    return (
        <div className="relative w-full h-56 flex items-center justify-center bg-white rounded-xl border border-blue-100 p-4 shadow-sm overflow-hidden">
            <svg width="300" height="160" viewBox="0 0 300 160" className="drop-shadow-md">

                {/* BARRA REDONDA */}
                {shapeId === 'barra' && (
                    <g>
                        <path d="M40,50 L220,50 L220,110 L40,110 Z" fill="#E3F2FD" stroke="#1E88E5" strokeWidth="2" />
                        <ellipse cx="40" cy="80" rx="15" ry="30" fill="#BBDEFB" stroke="#1E88E5" strokeWidth="2" />
                        <ellipse cx="220" cy="80" rx="15" ry="30" fill="#90CAF9" stroke="#1E88E5" strokeWidth="2" />
                        <line x1="40" y1="130" x2="220" y2="130" stroke="#EF4444" strokeWidth="2" markerEnd="url(#arrow)" />
                        <text x="130" y="125" textAnchor="middle" fill="#EF4444" fontWeight="bold">L</text>
                        <line x1="250" y1="50" x2="250" y2="110" stroke="#EF4444" strokeWidth="2" />
                        <text x="265" y="85" textAnchor="middle" fill="#EF4444" fontWeight="bold">D</text>
                    </g>
                )}

                {/* CUADRADO */}
                {shapeId === 'cuadrado' && (
                    <g>
                        <path d="M50,40 L200,40 L220,60 L70,60 Z" fill="#BBDEFB" stroke="#1E88E5" strokeWidth="2" />
                        <path d="M50,40 L200,40 L200,100 L50,100 Z" fill="#90CAF9" stroke="#1E88E5" strokeWidth="2" />
                        <path d="M200,40 L220,60 L220,120 L200,100 Z" fill="#64B5F6" stroke="#1E88E5" strokeWidth="2" />
                        {/* L */}
                        <line x1="50" y1="115" x2="200" y2="115" stroke="#EF4444" strokeWidth="2" />
                        <text x="125" y="130" textAnchor="middle" fill="#EF4444" fontWeight="bold">L</text>
                        {/* A (Lado) */}
                        <line x1="30" y1="40" x2="30" y2="100" stroke="#EF4444" strokeWidth="2" />
                        <text x="20" y="75" textAnchor="middle" fill="#EF4444" fontWeight="bold">A</text>
                    </g>
                )}

                {/* TUBO REDONDO */}
                {shapeId === 'tubo' && (
                    <g>
                        <path d="M40,40 L220,40 L220,120 L40,120 Z" fill="#E3F2FD" stroke="#1E88E5" strokeWidth="2" />
                        <ellipse cx="40" cy="80" rx="15" ry="40" fill="#BBDEFB" stroke="#1E88E5" strokeWidth="2" />
                        <ellipse cx="220" cy="80" rx="15" ry="40" fill="#90CAF9" stroke="#1E88E5" strokeWidth="2" />
                        <ellipse cx="220" cy="80" rx="10" ry="25" fill="#E3F2FD" stroke="#1E88E5" strokeWidth="2" strokeDasharray="4 2" />
                        <line x1="40" y1="135" x2="220" y2="135" stroke="#EF4444" strokeWidth="2" />
                        <text x="130" y="130" textAnchor="middle" fill="#EF4444" fontWeight="bold">L</text>
                        <line x1="250" y1="40" x2="250" y2="120" stroke="#EF4444" strokeWidth="2" />
                        <text x="265" y="85" textAnchor="middle" fill="#EF4444" fontWeight="bold">D</text>
                        <line x1="220" y1="55" x2="220" y2="105" stroke="#10B981" strokeWidth="2" />
                        <text x="205" y="85" textAnchor="middle" fill="#10B981" fontWeight="bold">d</text>
                    </g>
                )}

                {/* TUBO RECTANGULAR */}
                {shapeId === 'tubo_rect' && (
                    <g>
                        {/* Outer Box */}
                        <path d="M50,40 L200,40 L200,100 L50,100 Z" fill="#90CAF9" stroke="#1E88E5" strokeWidth="2" />
                        <path d="M200,40 L220,60 L220,120 L200,100 Z" fill="#64B5F6" stroke="#1E88E5" strokeWidth="2" />
                        <path d="M50,40 L200,40 L220,60 L70,60 Z" fill="#BBDEFB" stroke="#1E88E5" strokeWidth="2" />

                        {/* Inner Hole representation (Front Face) */}
                        <rect x="65" y="55" width="120" height="30" fill="#E3F2FD" stroke="#1E88E5" strokeWidth="1" strokeDasharray="3 3" />

                        <line x1="50" y1="115" x2="200" y2="115" stroke="#EF4444" strokeWidth="2" />
                        <text x="125" y="130" textAnchor="middle" fill="#EF4444" fontWeight="bold">L</text>

                        {/* A (Alto) */}
                        <line x1="35" y1="40" x2="35" y2="100" stroke="#EF4444" strokeWidth="2" />
                        <text x="25" y="75" textAnchor="middle" fill="#EF4444" fontWeight="bold">A</text>

                        {/* B (Ancho/Profundidad) */}
                        <line x1="230" y1="60" x2="230" y2="120" stroke="#EF4444" strokeWidth="2" />
                        <text x="245" y="95" textAnchor="middle" fill="#EF4444" fontWeight="bold">B</text>

                        {/* e (Espesor) */}
                        <text x="125" y="85" textAnchor="middle" fill="#10B981" fontWeight="bold" fontSize="10">e</text>
                    </g>
                )}

                {/* PLACA */}
                {shapeId === 'placa' && (
                    <g>
                        <path d="M50,50 L200,50 L220,30 L70,30 Z" fill="#BBDEFB" stroke="#1E88E5" strokeWidth="2" />
                        <path d="M50,50 L200,50 L200,90 L50,90 Z" fill="#90CAF9" stroke="#1E88E5" strokeWidth="2" />
                        <path d="M200,50 L220,30 L220,70 L200,90 Z" fill="#64B5F6" stroke="#1E88E5" strokeWidth="2" />
                        <line x1="50" y1="100" x2="200" y2="100" stroke="#EF4444" strokeWidth="2" />
                        <text x="125" y="115" textAnchor="middle" fill="#EF4444" fontWeight="bold">L</text>
                        <line x1="30" y1="50" x2="30" y2="90" stroke="#EF4444" strokeWidth="2" />
                        <text x="20" y="75" textAnchor="middle" fill="#EF4444" fontWeight="bold">A</text>
                        <line x1="230" y1="30" x2="230" y2="70" stroke="#EF4444" strokeWidth="2" />
                        <text x="240" y="55" textAnchor="middle" fill="#EF4444" fontWeight="bold">E</text>
                    </g>
                )}

                {/* HEXAGONO */}
                {shapeId === 'hexagono' && (
                    <g>
                        <path d="M180,40 L200,70 L180,100 L160,100 L140,70 L160,40 Z" fill="#90CAF9" stroke="#1E88E5" strokeWidth="2" />
                        <line x1="60" y1="40" x2="160" y2="40" stroke="#1E88E5" strokeWidth="2" />
                        <line x1="40" y1="70" x2="140" y2="70" stroke="#1E88E5" strokeWidth="2" />
                        <line x1="60" y1="100" x2="160" y2="100" stroke="#1E88E5" strokeWidth="2" />
                        <path d="M60,40 L40,70 L60,100" stroke="#1E88E5" strokeWidth="2" fill="none" strokeDasharray="3 3" />
                        <line x1="60" y1="110" x2="180" y2="110" stroke="#EF4444" strokeWidth="2" />
                        <text x="120" y="125" textAnchor="middle" fill="#EF4444" fontWeight="bold">L</text>
                        <line x1="210" y1="40" x2="210" y2="100" stroke="#EF4444" strokeWidth="2" />
                        <text x="225" y="75" textAnchor="middle" fill="#EF4444" fontWeight="bold">H</text>
                    </g>
                )}

                {/* ANGULO (L) */}
                {shapeId === 'angulo' && (
                    <g>
                        {/* L Shape Profile (Front) -> Drawn as 3D-ish */}
                        <path d="M180,40 L200,40 L200,100 L160,100 L160,80 L180,80 Z" fill="#90CAF9" stroke="#1E88E5" strokeWidth="2" />

                        {/* Length projection */}
                        <line x1="50" y1="40" x2="180" y2="40" stroke="#1E88E5" strokeWidth="2" />
                        <line x1="50" y1="100" x2="200" y2="100" stroke="#1E88E5" strokeWidth="2" />

                        {/* L */}
                        <line x1="50" y1="110" x2="200" y2="110" stroke="#EF4444" strokeWidth="2" />
                        <text x="125" y="125" textAnchor="middle" fill="#EF4444" fontWeight="bold">L</text>

                        {/* A (Height) */}
                        <line x1="210" y1="40" x2="210" y2="100" stroke="#EF4444" strokeWidth="2" />
                        <text x="225" y="75" textAnchor="middle" fill="#EF4444" fontWeight="bold">A</text>

                        {/* B (Width) */}
                        <line x1="160" y1="110" x2="200" y2="110" stroke="#EF4444" strokeWidth="2" />
                        <text x="180" y="125" textAnchor="middle" fill="#EF4444" fontWeight="bold">B</text>

                        {/* e (Thickness) */}
                        <text x="190" y="60" textAnchor="middle" fill="#10B981" fontWeight="bold" fontSize="10">e</text>
                    </g>
                )}

                {/* PERFIL U */}
                {shapeId === 'perfil_u' && (
                    <g>
                        {/* U Shape Profile */}
                        <path d="M160,40 L180,40 L180,90 L200,90 L200,40 L220,40 L220,110 L160,110 Z" fill="#90CAF9" stroke="#1E88E5" strokeWidth="2" />

                        {/* Length lines */}
                        <line x1="40" y1="40" x2="160" y2="40" stroke="#1E88E5" strokeWidth="2" />
                        <line x1="100" y1="110" x2="160" y2="110" stroke="#1E88E5" strokeWidth="2" />

                        {/* Dimensions */}
                        <line x1="40" y1="120" x2="220" y2="120" stroke="#EF4444" strokeWidth="2" />
                        <text x="130" y="135" textAnchor="middle" fill="#EF4444" fontWeight="bold">L</text>

                        {/* A (Base/Width) */}
                        <line x1="160" y1="120" x2="220" y2="120" stroke="#10B981" strokeWidth="2" />
                        <text x="190" y="135" textAnchor="middle" fill="#10B981" fontWeight="bold">A</text>

                        {/* B (Height/Flange) */}
                        <line x1="230" y1="40" x2="230" y2="110" stroke="#EF4444" strokeWidth="2" />
                        <text x="245" y="75" textAnchor="middle" fill="#EF4444" fontWeight="bold">B</text>
                    </g>
                )}

                {/* PERFIL T */}
                {shapeId === 'perfil_t' && (
                    <g>
                        {/* T Shape Profile */}
                        <path d="M160,40 L220,40 L220,60 L200,60 L200,110 L180,110 L180,60 L160,60 Z" fill="#90CAF9" stroke="#1E88E5" strokeWidth="2" />

                        {/* Length lines */}
                        <line x1="40" y1="40" x2="160" y2="40" stroke="#1E88E5" strokeWidth="2" />
                        <line x1="60" y1="110" x2="180" y2="110" stroke="#1E88E5" strokeWidth="2" />

                        {/* Dimensions */}
                        <line x1="40" y1="120" x2="180" y2="120" stroke="#EF4444" strokeWidth="2" />
                        <text x="110" y="135" textAnchor="middle" fill="#EF4444" fontWeight="bold">L</text>

                        {/* A (Width Top) */}
                        <line x1="160" y1="30" x2="220" y2="30" stroke="#EF4444" strokeWidth="2" />
                        <text x="190" y="25" textAnchor="middle" fill="#EF4444" fontWeight="bold">A</text>

                        {/* B (Height) */}
                        <line x1="230" y1="40" x2="230" y2="110" stroke="#EF4444" strokeWidth="2" />
                        <text x="245" y="75" textAnchor="middle" fill="#EF4444" fontWeight="bold">B</text>
                    </g>
                )}

            </svg>
        </div>
    )
}

export default function CalculadoraPage() {
    const [materialId, setMaterialId] = useState('')
    const [shapeId, setShapeId] = useState('barra')
    const [precioKilo, setPrecioKilo] = useState(0)

    // Dimensions (mm)
    const [L, setL] = useState('1000') // Length default 1m
    const [A, setA] = useState('0') // Width / Side / Height A
    const [B, setB] = useState('0') // Width B / Side B
    const [D, setD] = useState('0') // Diameter Outer
    const [d, setd] = useState('0') // Diameter Inner
    const [e, setE] = useState('0') // Thickness (espesor)
    const [H, setH] = useState('0') // Hexagon Height

    const [weight, setWeight] = useState(0)
    const [cost, setCost] = useState(0)

    useEffect(() => {
        const mat = MATERIALS.find(m => m.id === materialId)
        if (!mat) return

        if (mat.marketPrice) {
            setPrecioKilo(mat.marketPrice)
        }
    }, [materialId])

    useEffect(() => {
        const mat = MATERIALS.find(m => m.id === materialId)
        const density = mat ? mat.density : 0

        // Parse inputs
        const valL = Number(L) || 0
        const valA = Number(A) || 0
        const valB = Number(B) || 0
        const valD = Number(D) || 0
        const vald = Number(d) || 0
        const vale = Number(e) || 0
        const valH = Number(H) || 0

        let volMm3 = 0

        if (shapeId === 'barra') {
            // Volume = Pi * r^2 * L
            const radius = valD / 2
            volMm3 = Math.PI * Math.pow(radius, 2) * valL
        } else if (shapeId === 'cuadrado') {
            // Volume = A^2 * L
            volMm3 = Math.pow(valA, 2) * valL
        } else if (shapeId === 'tubo') {
            // Volume = Pi * (R^2 - r^2) * L
            // Using D as outer, d as inner. if d is 0, check if e is set
            let Ri = vald > 0 ? vald / 2 : (valD / 2) - vale
            if (Ri < 0) Ri = 0
            const Ro = valD / 2
            volMm3 = (Math.PI * Math.pow(Ro, 2) - Math.PI * Math.pow(Ri, 2)) * valL
        } else if (shapeId === 'tubo_rect') {
            // A = Height, B = Width
            const OuterArea = valA * valB
            const InnerArea = (valA - 2 * vale) * (valB - 2 * vale)
            volMm3 = (OuterArea - (InnerArea > 0 ? InnerArea : 0)) * valL
        } else if (shapeId === 'placa') {
            // Volume = L * A * e (using e as thickness here)
            volMm3 = valL * valA * vale
        } else if (shapeId === 'hexagono') {
            // Area = 0.866 * H^2
            volMm3 = 0.866 * Math.pow(valH, 2) * valL
        } else if (shapeId === 'angulo') {
            // L-Profile: A = Height leg, B = Width leg, e = thickness
            // Approx simple area: (A * e) + ((B - e) * e)
            const area = (valA * vale) + ((valB - vale) * vale)
            volMm3 = area * valL
        } else if (shapeId === 'perfil_u') {
            // U-Profile: A = Base Width, B = Flange Height (Alas), e = thickness
            // Area = (A * e) + 2 * ((B - e) * e)  <- Careful with overlaps
            // Let's assume A is total external base width, B is external flange height
            // Base area = A * e
            // Flanges area = 2 * (B - e) * e
            const area = (valA * vale) + (2 * (valB - vale) * vale)
            volMm3 = area * valL
        } else if (shapeId === 'perfil_t') {
            // T-Profile: A = Top Flange Width, B = Overall Height, e = thick
            // Area = (A * e) + ((B - e) * e)
            const area = (valA * vale) + ((valB - vale) * vale)
            volMm3 = area * valL
        }

        const weightG = volMm3 * (density / 1000)
        const weightKg = weightG / 1000

        setWeight(weightKg > 0 ? weightKg : 0)
        setCost((weightKg > 0 ? weightKg : 0) * precioKilo)

    }, [materialId, shapeId, L, A, B, D, d, e, H, precioKilo])

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
                        <div className="p-2 bg-blue-600 rounded-lg text-white">
                            <Calculator className="h-6 w-6" />
                        </div>
                        Calculadora de Materiales
                    </h1>
                    <p className="text-gray-500 mt-1 ml-1">Herramienta profesional multi-perfil</p>
                </div>

                {/* Live Price Ticker */}
                <div className="bg-white px-6 py-3 rounded-full border border-green-100 shadow-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="relative">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-ping absolute top-0 left-0 opacity-75"></div>
                        <div className="w-3 h-3 bg-green-500 rounded-full relative"></div>
                    </div>
                    <div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Precio Ref. / Mercado</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-gray-900">
                                {precioKilo > 0 ? `${precioKilo.toFixed(2)} €/kg` : '-- €/kg'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* LEFT COLUMN: Inputs & Configuration */}
                <div className="lg:col-span-7 space-y-6">
                    <Card className="border-0 shadow-lg ring-1 ring-gray-100 overflow-visible">
                        <CardHeader className="border-b bg-gray-50/50">
                            <CardTitle className="flex items-center gap-2">
                                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-md">1</span>
                                Configuración de Material
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <Label className="text-gray-600 font-semibold">Tipo de Material</Label>
                                    <Select onValueChange={setMaterialId}>
                                        <SelectTrigger className="h-12 border-gray-200 bg-gray-50/30 focus:ring-blue-500 text-lg">
                                            <SelectValue placeholder="Seleccionar..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <div className="p-2 text-xs font-bold text-gray-400 uppercase tracking-wide">Metales</div>
                                            {MATERIALS.filter(m => m.category !== 'Plásticos').map(m => (
                                                <SelectItem key={m.id} value={m.id} className="cursor-pointer font-medium">
                                                    {m.name} <span className="text-gray-400 ml-2 text-xs">({m.density} g/cm³)</span>
                                                </SelectItem>
                                            ))}
                                            <Separator className="my-2" />
                                            <div className="p-2 text-xs font-bold text-gray-400 uppercase tracking-wide">Plásticos Técnicos</div>
                                            {MATERIALS.filter(m => m.category === 'Plásticos').map(m => (
                                                <SelectItem key={m.id} value={m.id} className="cursor-pointer font-medium">
                                                    {m.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-3">
                                    <Label className="text-gray-600 font-semibold">Forma de la Pieza</Label>
                                    <Select value={shapeId} onValueChange={setShapeId}>
                                        <SelectTrigger className="h-12 border-gray-200 bg-gray-50/30 text-lg">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SHAPES.map(s => (
                                                <SelectItem key={s.id} value={s.id} className="font-medium">{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Shape Visualization */}
                            <div className="mt-4">
                                <ShapeDiagram shapeId={shapeId} />
                            </div>

                            {/* Dynamic Inputs based on Shape */}
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-5 pt-4">

                                {/* L - ALWAYS PRESENT */}
                                <div className="space-y-2 relative">
                                    <Label className="text-red-500 font-bold flex items-center justify-between">L - Longitud <span className="text-xs text-gray-400 font-normal">mm</span></Label>
                                    <Input type="number" value={L} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setL(formatNumberInput(e.target.value))} className="h-11 font-mono text-lg border-red-100 focus:border-red-500" />
                                </div>

                                {/* A - GENERIC WIDTH/HEIGHT */}
                                {(shapeId === 'cuadrado' || shapeId === 'tubo_rect' || shapeId === 'placa' || shapeId === 'angulo' || shapeId === 'perfil_u' || shapeId === 'perfil_t') && (
                                    <div className="space-y-2">
                                        <Label className="text-red-500 font-bold flex items-center justify-between">A - {shapeId === 'tubo_rect' ? 'Alto' : shapeId === 'perfil_u' ? 'Base (Ancho)' : 'Ancho/Lado'} <span className="text-xs text-gray-400 font-normal">mm</span></Label>
                                        <Input type="number" value={A} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setA(formatNumberInput(e.target.value))} className="h-11 font-mono text-lg border-red-100 focus:border-red-500" />
                                    </div>
                                )}

                                {/* B - SECONDARY WIDTH */}
                                {(shapeId === 'tubo_rect' || shapeId === 'angulo' || shapeId === 'perfil_u' || shapeId === 'perfil_t') && (
                                    <div className="space-y-2">
                                        <Label className="text-red-500 font-bold flex items-center justify-between">B - {shapeId === 'tubo_rect' ? 'Ancho/Fondo' : shapeId === 'perfil_u' ? 'Alto (Alas)' : shapeId === 'perfil_t' ? 'Alto (Total)' : 'Lado B'} <span className="text-xs text-gray-400 font-normal">mm</span></Label>
                                        <Input type="number" value={B} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setB(formatNumberInput(e.target.value))} className="h-11 font-mono text-lg border-red-100 focus:border-red-500" />
                                    </div>
                                )}

                                {/* D - DIAMETER */}
                                {(shapeId === 'barra' || shapeId === 'tubo') && (
                                    <div className="space-y-2">
                                        <Label className="text-red-500 font-bold flex items-center justify-between">D - Ø Exterior <span className="text-xs text-gray-400 font-normal">mm</span></Label>
                                        <Input type="number" value={D} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setD(formatNumberInput(e.target.value))} className="h-11 font-mono text-lg border-red-100 focus:border-red-500" />
                                    </div>
                                )}

                                {/* d - INNER DIAMETER */}
                                {shapeId === 'tubo' && (
                                    <div className="space-y-2">
                                        <Label className="text-green-600 font-bold flex items-center justify-between">d - Ø Interior <span className="text-xs text-gray-400 font-normal">mm</span></Label>
                                        <Input type="number" value={d} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setd(formatNumberInput(e.target.value))} className="h-11 font-mono text-lg border-green-100 focus:border-green-500" />
                                    </div>
                                )}

                                {/* e - THICKNESS (Espesor) */}
                                {(shapeId === 'tubo_rect' || shapeId === 'placa' || shapeId === 'angulo' || shapeId === 'perfil_u' || shapeId === 'perfil_t') && (
                                    <div className="space-y-2">
                                        <Label className="text-red-500 font-bold flex items-center justify-between">E/e - Espesor <span className="text-xs text-gray-400 font-normal">mm</span></Label>
                                        <Input type="number" value={e} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setE(formatNumberInput(e.target.value))} className="h-11 font-mono text-lg border-red-100 focus:border-red-500" />
                                    </div>
                                )}

                                {/* H - HEXAGON */}
                                {shapeId === 'hexagono' && (
                                    <div className="space-y-2">
                                        <Label className="text-red-500 font-bold flex items-center justify-between">H - Entre Caras <span className="text-xs text-gray-400 font-normal">mm</span></Label>
                                        <Input type="number" value={H} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setH(formatNumberInput(e.target.value))} className="h-11 font-mono text-lg border-red-100 focus:border-red-500" />
                                    </div>
                                )}

                            </div>
                        </CardContent>
                    </Card>

                    {/* Price Override */}
                    <Card className="border-0 shadow-sm ring-1 ring-gray-100">
                        <CardContent className="p-6 flex items-center justify-between bg-blue-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                                    <Euro className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-900">Ajuste de Precio Real</p>
                                    <p className="text-xs text-gray-500">Introduce el precio exacto de tu proveedor (recomendado)</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    value={precioKilo}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrecioKilo(Number(e.target.value))}
                                    className="w-32 h-10 font-bold text-right border-blue-200 focus:ring-blue-500"
                                    step="0.01"
                                />
                                <span className="text-sm font-bold text-gray-500">€/kg</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT COLUMN: Results */}
                <div className="lg:col-span-5 space-y-6">
                    <Card className="border-0 shadow-2xl bg-[#0F172A] text-white overflow-hidden relative sticky top-6">
                        {/* Background Pattern */}
                        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                            <Scale className="w-64 h-64" />
                        </div>

                        <CardHeader className="border-b border-gray-800 pb-8">
                            <CardTitle className="text-gray-100 flex items-center gap-2">
                                <span className="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-md">RESULTADOS</span>
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="p-8 space-y-10 relative z-10">

                            {/* Technical Weight */}
                            <div>
                                <div className="flex items-center gap-2 mb-2 text-blue-300 uppercase text-xs font-bold tracking-widest">
                                    <Scale className="h-4 w-4" /> Peso Teórico Calc.
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-6xl font-black tracking-tight font-mono">
                                        {weight.toFixed(3)}
                                    </span>
                                    <span className="text-2xl font-bold text-gray-500">kg</span>
                                </div>
                                <p className="text-gray-500 text-sm mt-2">
                                    Basado en densidad nominal del material.
                                </p>
                            </div>

                            <Separator className="bg-gray-800" />

                            {/* Total Cost */}
                            <div>
                                <div className="flex items-center gap-2 mb-2 text-green-400 uppercase text-xs font-bold tracking-widest">
                                    <Euro className="h-4 w-4" /> Coste Estimado Material
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-6xl font-black tracking-tight text-green-400 font-mono">
                                        {cost.toFixed(2)}
                                    </span>
                                    <span className="text-2xl font-bold text-green-700">€</span>
                                </div>
                                <p className="text-gray-500 text-sm mt-2 flex justify-between">
                                    <span>Precio aplicado:</span>
                                    <span className="text-gray-300 font-mono">{precioKilo.toFixed(2)} €/kg</span>
                                </p>
                            </div>

                        </CardContent>
                        <div className="h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
                    </Card>

                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
                        <div className="flex gap-3">
                            <Info className="h-5 w-5 flex-shrink-0 text-blue-500" />
                            <p>
                                <strong>Nota Importante:</strong> Los pesos son teóricos. Usa el campo "Precio Real" con la oferta de tu proveedor para obtener un coste exacto.
                            </p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}

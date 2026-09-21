import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Factura, Albaran, Presupuesto } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface DocumentViewerProps {
    document: any // Using any to catch Gastos logic too if needed, or specific types
    type?: string
}

export function DocumentViewer({ document: doc, type }: DocumentViewerProps) {
    if (!doc) return null

    // Helper to determine type labels
    const getLabels = () => {
        switch (type) {
            case 'factura': return { title: 'FACTURA', number: doc.numero }
            case 'albaran': return { title: 'ALBARÁN', number: doc.numero }
            case 'presupuesto': return { title: 'PRESUPUESTO', number: doc.numero }
            case 'gasto': return { title: 'GASTO / TICKET', number: doc.numero || '-' }
            default: return { title: 'DOCUMENTO', number: doc.numero || '-' }
        }
    }

    const { title, number } = getLabels()

    // Determine lines (Gastos might just have description or lines)
    // If Gasto, might allow simple description view
    const lines = doc.lineas || (doc.descripcion ? [{ descripcion: doc.descripcion, cantidad: 1, precio_unitario: doc.base_imponible || doc.total, importe: doc.base_imponible || doc.total }] : [])

    return (
        <div className="max-w-3xl mx-auto bg-white min-h-[800px] p-8 text-sm">
            {/* Header */}
            {/* Header */}
            <div className="flex justify-between items-start mb-12 border-b pb-8">
                {type === 'gasto' ? (
                    // GASTO: Issuer = Provider, Receiver = Us
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
                            <p className="text-slate-500 font-mono mt-1">#{number}</p>
                            <div className="mt-4 text-slate-600">
                                <p className="font-bold">{doc.proveedor || 'Proveedor Desconocido'}</p>
                                <p>{doc.proveedor_cif || ''}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="font-bold text-slate-700">Receptor</p>
                            <div className="mt-1 text-slate-600">
                                <p className="font-bold">Empresa X</p>
                                <p>Calle Ejemplo, 1</p>
                                <p>30000 Ciudad Ejemplo (Murcia)</p>
                            </div>
                            <div className="mt-4">
                                <p className="font-bold text-slate-700">Fecha</p>
                                <p>{doc.fecha ? format(new Date(doc.fecha), 'dd BBB yyyy', { locale: es }) : '-'}</p>
                            </div>
                        </div>
                    </>
                ) : (
                    // OUTGOING DOCS: Issuer = Us, Receiver = Client
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
                            <p className="text-slate-500 font-mono mt-1">#{number}</p>
                            <div className="mt-4 text-slate-600">
                                <p className="font-bold">Empresa X</p>
                                <p>Calle Ejemplo, 1</p>
                                <p>30000 Ciudad Ejemplo (Murcia)</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="font-bold text-slate-700">Cliente</p>
                            <p className="text-lg font-light">{doc.cliente_razon_social || doc.proveedor || 'Sin Nombre'}</p>
                            <p className="text-slate-500">{doc.cliente_cif}</p>
                            <div className="mt-4">
                                <p className="font-bold text-slate-700">Fecha</p>
                                <p>{doc.fecha ? format(new Date(doc.fecha), 'dd BBB yyyy', { locale: es }) : '-'}</p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Content */}
            <div className="mb-8">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th className="py-2 text-slate-500 font-medium w-[50%]">Descripción</th>
                            <th className="py-2 text-slate-500 font-medium text-right">Cant.</th>
                            <th className="py-2 text-slate-500 font-medium text-right">Precio</th>
                            <th className="py-2 text-slate-500 font-medium text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line: any, i: number) => (
                            <tr key={i} className="border-b border-slate-50">
                                <td className="py-3 pr-4 text-slate-700">{line.descripcion}</td>
                                <td className="py-3 text-right text-slate-600 font-mono">{line.cantidad || 1}</td>
                                <td className="py-3 text-right text-slate-600 font-mono">{formatCurrency(line.precio_unitario || 0)}</td>
                                <td className="py-3 text-right text-slate-800 font-bold font-mono">{formatCurrency(line.importe || 0)}</td>
                            </tr>
                        ))}
                        {lines.length === 0 && (
                            <tr>
                                <td colSpan={4} className="py-8 text-center text-slate-400 italic">Sin líneas de detalle</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end border-t pt-4">
                <div className="w-64 space-y-2">
                    <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span>{formatCurrency(doc.base_imponible || doc.subtotal || 0)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                        <span>IVA</span>
                        <span>{formatCurrency(doc.iva_importe || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold text-slate-900 border-t border-slate-200 pt-2 mt-2">
                        <span>Total</span>
                        <span>{formatCurrency(doc.total || 0)}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

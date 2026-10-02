'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Download, FileArchive, FileSpreadsheet, FileText, FolderOpen, FolderSync, Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { registrarExportacion } from '@/actions/fiscal'
import { carpetaGuardada, elegirCarpeta, exportarPaquete, olvidarCarpeta, soportaCarpeta, type ResultadoExportacion } from '@/lib/fiscal/exportar-cliente'

export function ExportarPaquete({ periodo, etiqueta, raiz, emitidas, recibidas, sinDocumento, anomalias }: {
    periodo: string; etiqueta: string; raiz: string; emitidas: number; recibidas: number; sinDocumento: number; anomalias: number
}) {
    const router = useRouter()
    const [soporta, setSoporta] = useState(false)
    const [carpeta, setCarpeta] = useState<any | null>(null)
    const [trabajando, setTrabajando] = useState(false)
    const [progreso, setProgreso] = useState<{ hechos: number; total: number; texto: string } | null>(null)
    const [resultado, setResultado] = useState<ResultadoExportacion | null>(null)

    useEffect(() => {
        setSoporta(soportaCarpeta())
        carpetaGuardada().then(setCarpeta)
    }, [])
    useEffect(() => { setResultado(null) }, [periodo])

    const cambiarCarpeta = async () => {
        try {
            const h = await elegirCarpeta()
            if (h) { setCarpeta(h); toast.success(`Carpeta elegida: ${h.name}`) }
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo elegir la carpeta')
        }
    }

    const exportar = async (destino: 'carpeta' | 'zip') => {
        if (trabajando) return
        let h = destino === 'carpeta' ? carpeta : null
        if (destino === 'carpeta' && !h) {
            h = await elegirCarpeta().catch(() => null)
            if (!h) return
            setCarpeta(h)
        }
        setTrabajando(true); setResultado(null)
        try {
            const r = await exportarPaquete(periodo, {
                carpeta: h,
                onProgreso: (hechos, total, texto) => setProgreso({ hechos, total, texto }),
                confirmarReemplazo: nombre => window.confirm(`Ya existe la carpeta «${nombre}» en «${h?.name}».\n\n¿Reemplazarla por la versión actual? (se borra la anterior y se vuelve a crear con los datos de hoy)`),
            })
            if (!r) { toast.info('Exportación cancelada'); return }
            setProgreso({ hechos: 1, total: 1, texto: 'Anotando en el historial…' })
            const reg = await registrarExportacion({ periodo, destino: r.destino, numArchivos: r.archivos, huella: r.huella })
            if (!reg.success) toast.error(`Paquete generado, pero no se pudo anotar en el historial: ${reg.error}`)
            setResultado(r)
            if (r.errores.length) toast.warning(`Paquete generado con ${r.errores.length} documento(s) sin descargar`)
            else toast.success(r.destino === 'carpeta' ? `Guardado en ${r.carpeta}/${r.raiz}` : 'ZIP descargado')
            router.refresh()
        } catch (e: any) {
            if (e?.name === 'NotAllowedError') {
                toast.error('El navegador no ha permitido escribir en la carpeta. Vuelve a elegirla.')
                await olvidarCarpeta(); setCarpeta(null)
            } else toast.error(e?.message || 'No se pudo generar el paquete')
        } finally {
            setTrabajando(false); setProgreso(null)
        }
    }

    const vacio = emitidas + recibidas === 0
    const q = `periodo=${encodeURIComponent(periodo)}`
    const porcentaje = progreso ? Math.round((progreso.hechos / Math.max(1, progreso.total)) * 100) : 0

    return (
        <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div>
                <h2 className="text-lg font-black tracking-tight">Paquete para el asesor</h2>
                <p className="text-sm text-muted-foreground">{etiqueta}: {emitidas} emitida{emitidas !== 1 ? 's' : ''} y {recibidas} recibida{recibidas !== 1 ? 's' : ''}{sinDocumento ? <>, <b className="text-amber-600">{sinDocumento} sin documento original</b></> : null}.</p>
            </div>

            <div className="rounded-xl bg-muted/50 p-3 text-xs font-mono leading-relaxed overflow-x-auto">
                <p className="font-bold">📁 {raiz}</p>
                <p className="pl-4">📄 00_RESUMEN_{periodo}.pdf <span className="text-muted-foreground">· resumen completo con totales</span></p>
                <p className="pl-4">📊 00_LIBROS_REGISTRO_{periodo}.xlsx</p>
                <p className="pl-4">📁 01_FACTURAS_EMITIDAS <span className="text-muted-foreground">· 001, 002… por fecha</span></p>
                <p className="pl-4">📁 02_FACTURAS_RECIBIDAS <span className="text-muted-foreground">· nº de registro por fecha</span></p>
                <p className="pl-4">📁 03_POR_CLIENTE</p>
                <p className="pl-4">📁 04_POR_PROVEEDOR</p>
                <p className="pl-4">📄 LEEME.txt</p>
            </div>

            {soporta ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    {carpeta ? <span>Carpeta en tu PC: <b>{carpeta.name}</b></span> : <span className="text-muted-foreground">Aún no has elegido carpeta en este ordenador.</span>}
                    <Button variant="outline" size="sm" onClick={cambiarCarpeta} disabled={trabajando}><FolderSync className="h-4 w-4" />{carpeta ? 'Cambiar' : 'Elegir carpeta'}</Button>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Este navegador no permite guardar directamente en una carpeta (solo Chrome o Edge de ordenador). Se descargará un ZIP con la misma estructura.</p>
            )}

            {anomalias > 0 && (
                <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"><TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />Hay {anomalias} aviso{anomalias !== 1 ? 's' : ''} que revisar (abajo). Puedes generar el paquete igualmente: van detallados en el resumen.</p>
            )}

            <div className="flex flex-wrap gap-2">
                {soporta && (
                    <Button onClick={() => exportar('carpeta')} disabled={trabajando || vacio} size="lg">
                        {trabajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Descargar en mi carpeta
                    </Button>
                )}
                <Button onClick={() => exportar('zip')} disabled={trabajando || vacio} variant={soporta ? 'outline' : 'default'} size="lg">
                    <FileArchive className="h-4 w-4" />Descargar ZIP
                </Button>
                <Button asChild variant="ghost" size="lg" disabled={vacio}><a href={`/api/fiscal/resumen?${q}`} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" />Solo resumen PDF</a></Button>
                <Button asChild variant="ghost" size="lg" disabled={vacio}><a href={`/api/fiscal/libros?${q}`}><FileSpreadsheet className="h-4 w-4" />Solo Excel</a></Button>
            </div>
            {vacio && <p className="text-sm text-muted-foreground">No hay facturas en este periodo.</p>}

            {progreso && (
                <div className="space-y-1" aria-live="polite">
                    <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${porcentaje}%` }} /></div>
                    <p className="text-xs text-muted-foreground">{progreso.texto}</p>
                </div>
            )}

            {resultado && (
                <div className={`rounded-xl border p-3 text-sm ${resultado.errores.length ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30'}`}>
                    <p className="font-bold flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{resultado.archivos} archivos {resultado.destino === 'carpeta' ? <>guardados en <span className="font-mono">{resultado.carpeta}/{resultado.raiz}</span></> : 'en el ZIP descargado'}</p>
                    {resultado.errores.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{resultado.errores.map(e => <li key={e}>{e}</li>)}</ul>}
                    <p className="text-xs text-muted-foreground mt-1 break-all">Huella de los datos: {resultado.huella}</p>
                </div>
            )}
        </div>
    )
}

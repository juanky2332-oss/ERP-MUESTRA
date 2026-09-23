'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ImageIcon, FileText, Upload, Loader2, RotateCcw, Eye, CheckCircle2, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { subirLogo, quitarLogo, guardarEmpresa } from '@/actions/ajustes'
import { marcaDesdeEmpresa } from '@/lib/documentos/marca'
import { invalidarMarcaCliente } from '@/lib/documentos/marca-cliente'
import { prepararImagen } from '@/lib/imagen-cliente'

const FACTURA_EJEMPLO = {
    numero: 'FAC-EJEMPLO', fecha: new Date().toISOString().slice(0, 10), fecha_vencimiento: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    cliente_razon_social: 'CLIENTE DE EJEMPLO, S.L.', cliente_cif: 'B12345678', cliente_direccion: 'Avenida Principal, 10', cliente_codigo_postal: '30001', cliente_ciudad: 'Murcia',
    lineas: [{ descripcion: 'Eje Ø40×120 mm · Acero C45', cantidad: 10, precio_unitario: 18.5 }, { descripcion: 'Casquillo bronce CuSn12 Ø30/Ø20×25 mm', cantidad: 20, precio_unitario: 6.9 }],
    base_imponible: 323, iva_porcentaje: 21, iva_importe: 67.83, total: 390.83, forma_pago: 'Transferencia a 30 días desde fecha de factura',
}

function LogoCard({ tipo, empresa, editable, onCambio }: { tipo: 'app' | 'documentos'; empresa: any; editable: boolean; onCambio: () => void }) {
    const input = useRef<HTMLInputElement>(null)
    const [propuesta, setPropuesta] = useState<{ file: File; dataUrl: string; blob: Blob; tipo: 'image/png' | 'image/jpeg'; pdf?: string } | null>(null)
    const [subiendo, setSubiendo] = useState(false)
    const actual = tipo === 'app' ? empresa.logo_app_url : empresa.logo_documentos_url

    const elegir = async (f?: File | null) => {
        if (!f) return
        if (input.current) input.current.value = ''
        if (!/^image\//.test(f.type)) return toast.error('Elige una imagen (PNG, JPG, WEBP o SVG).')
        // Se admiten fotos de móvil grandes: se reducen aquí antes de subir
        if (f.size > 25 * 1024 * 1024) return toast.error('La imagen es demasiado grande (máx. 25 MB).')
        const aviso = toast.loading('Preparando la imagen…')
        try {
            const png = await prepararImagen(f, tipo === 'app' ? 512 : 1000)
            let pdf: string | undefined
            if (tipo === 'documentos') {
                const { generatePDF } = await import('@/lib/pdf-generator')
                pdf = await generatePDF(FACTURA_EJEMPLO, 'factura', 'preview', { marca: marcaDesdeEmpresa(empresa, png.dataUrl) }) as string
            }
            setPropuesta({ file: f, ...png, pdf })
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo preparar la vista previa')
        } finally {
            toast.dismiss(aviso)
        }
    }

    const confirmar = async () => {
        if (!propuesta) return
        setSubiendo(true)
        const fd = new FormData()
        fd.append('tipo', tipo)
        // Documentos: PNG o JPEG (lo que admiten los PDF). App: se respeta un SVG ligero.
        if (tipo === 'app' && propuesta.file.type === 'image/svg+xml' && propuesta.file.size < 500 * 1024) fd.append('file', propuesta.file)
        else fd.append('file', new File([propuesta.blob], `logo-${tipo}.${propuesta.tipo === 'image/jpeg' ? 'jpg' : 'png'}`, { type: propuesta.tipo }))
        let r: Awaited<ReturnType<typeof subirLogo>>
        try {
            r = await subirLogo(fd)
        } catch {
            r = { success: false, error: 'No se pudo subir el logo (conexión o imagen demasiado pesada). Inténtalo de nuevo.' }
        } finally {
            setSubiendo(false)
        }
        if (!r.success) return toast.error(r.error)
        invalidarMarcaCliente()
        toast.success(tipo === 'app' ? 'Logo de la app actualizado' : 'Logo de documentos actualizado: los nuevos PDF ya salen con él')
        setPropuesta(null); onCambio()
    }

    const restablecer = async () => {
        if (!confirm(tipo === 'app' ? '¿Volver al logo por defecto en la app?' : '¿Quitar el logo de los documentos? Los nuevos PDF saldrán con el logo por defecto.')) return
        const r = await quitarLogo(tipo)
        if (!r.success) return toast.error(r.error)
        invalidarMarcaCliente(); toast.success('Logo restablecido'); onCambio()
    }

    return (
        <div className="rounded-2xl border bg-card p-5 space-y-3">
            <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">{tipo === 'app' ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div>
                <div>
                    <h3 className="font-extrabold">{tipo === 'app' ? 'Logo de la app' : 'Logo de los documentos'}</h3>
                    <p className="text-sm text-muted-foreground">{tipo === 'app' ? 'Aparece en el menú, en la cabecera del móvil y en la pantalla de inicio de sesión.' : 'Aparece en los PDF de presupuestos, albaranes y facturas (web, correo y Telegram).'}</p>
                </div>
            </div>
            <div className="h-32 rounded-xl border border-dashed bg-muted/30 flex items-center justify-center overflow-hidden">
                {actual ? <img src={actual} alt="Logo actual" className="max-h-28 max-w-[80%] object-contain" /> : <span className="text-sm text-muted-foreground">Logo por defecto</span>}
            </div>
            {editable && (
                <div className="flex gap-2 flex-wrap">
                    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => elegir(e.target.files?.[0])} />
                    <Button onClick={() => input.current?.click()}><Upload className="h-4 w-4 mr-1" /> Subir nuevo logo</Button>
                    {actual && <Button variant="ghost" onClick={restablecer}><RotateCcw className="h-4 w-4 mr-1" /> Restablecer</Button>}
                </div>
            )}

            <Dialog open={!!propuesta} onOpenChange={v => !v && setPropuesta(null)}>
                <DialogContent className={tipo === 'documentos' ? 'max-w-4xl max-h-[94vh] overflow-y-auto' : 'max-w-lg'}>
                    <DialogHeader>
                        <DialogTitle>{tipo === 'app' ? 'Confirmar nuevo logo de la app' : 'Confirmar nuevo logo de documentos'}</DialogTitle>
                        <DialogDescription>
                            {tipo === 'app'
                                ? 'Así se verá en el menú y en la pantalla de acceso.'
                                : 'Así saldrán los documentos. A partir de que confirmes, TODOS los presupuestos, albaranes y facturas que se generen llevarán este logo. Los PDF ya enviados no cambian.'}
                        </DialogDescription>
                    </DialogHeader>
                    {propuesta && (tipo === 'app' ? (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-sidebar p-4 flex items-center gap-3">
                                <img src={propuesta.dataUrl} alt="" className="h-10 w-10 rounded-xl object-contain bg-white/95 p-1" />
                                <span className="text-[13px] font-black text-white uppercase">{empresa.nombre_comercial || empresa.nombre}</span>
                            </div>
                            <div className="rounded-xl border p-4 flex flex-col items-center gap-2">
                                <img src={propuesta.dataUrl} alt="" className="h-16 max-w-full object-contain" />
                                <span className="text-xs font-bold">Pantalla de acceso</span>
                            </div>
                        </div>
                    ) : (
                        <iframe src={propuesta.pdf} className="w-full h-[60vh] rounded-xl border" title="Vista previa de factura" />
                    ))}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setPropuesta(null)} disabled={subiendo}>Cancelar</Button>
                        <Button onClick={confirmar} disabled={subiendo} className="font-bold">{subiendo ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Confirmar cambio</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export function MarcaAjustes({ empresa: inicial, editable }: { empresa: any; editable: boolean }) {
    const router = useRouter()
    const qc = useQueryClient()
    const [emp, setEmp] = useState<any>(inicial)
    const [guardando, setGuardando] = useState(false)
    const [previa, setPrevia] = useState<string | null>(null)
    const set = (k: string, v: any) => setEmp((e: any) => ({ ...e, [k]: v }))

    const refrescar = () => { qc.invalidateQueries({ queryKey: ['empresa-actual'] }); router.refresh() }

    const verPdf = async () => {
        const { cargarMarcaCliente } = await import('@/lib/documentos/marca-cliente')
        const actual = await cargarMarcaCliente()
        const { generatePDF } = await import('@/lib/pdf-generator')
        setPrevia(await generatePDF(FACTURA_EJEMPLO, 'factura', 'preview', { marca: marcaDesdeEmpresa(emp, actual.logoDataUrl) }) as string)
    }

    const guardar = async () => {
        if (!confirm('¿Guardar la personalización? Los nuevos documentos saldrán con estos datos, colores y textos.')) return
        setGuardando(true)
        const r = await guardarEmpresa({
            nombre_comercial: emp.nombre_comercial, web: emp.web, color_principal: emp.color_principal, color_documentos: emp.color_documentos,
            pie_documentos: emp.pie_documentos, texto_factura: emp.texto_factura, condiciones_presupuesto: emp.condiciones_presupuesto,
            mostrar_iban_factura: emp.mostrar_iban_factura !== false, mensaje_bienvenida: emp.mensaje_bienvenida,
        })
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        invalidarMarcaCliente(); toast.success('Personalización guardada'); refrescar()
    }

    return (
        <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
                <LogoCard tipo="app" empresa={inicial} editable={editable} onCambio={refrescar} />
                <LogoCard tipo="documentos" empresa={inicial} editable={editable} onCambio={refrescar} />
            </div>

            <div className="rounded-2xl border bg-card p-5 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Palette className="h-5 w-5" /></div>
                    <div><h3 className="font-extrabold">Personalización</h3><p className="text-sm text-muted-foreground">Colores, nombre comercial y textos que aparecen en la app y en los documentos.</p></div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                    <div><Label className="text-xs">Nombre comercial (menú y acceso)</Label><Input disabled={!editable} value={emp.nombre_comercial || ''} onChange={e => set('nombre_comercial', e.target.value)} placeholder={emp.nombre} className="mt-1" /></div>
                    <div><Label className="text-xs">Web (aparece en los documentos)</Label><Input disabled={!editable} value={emp.web || ''} onChange={e => set('web', e.target.value)} placeholder="www.miempresa.com" className="mt-1" /></div>
                    <div>
                        <Label className="text-xs">Color de la app</Label>
                        <div className="flex gap-2 mt-1"><input type="color" disabled={!editable} value={emp.color_principal || '#4338ca'} onChange={e => set('color_principal', e.target.value)} className="h-9 w-12 rounded border" /><Input disabled={!editable} value={emp.color_principal || ''} onChange={e => set('color_principal', e.target.value)} placeholder="#4338ca" /></div>
                    </div>
                    <div>
                        <Label className="text-xs">Color de los documentos (títulos, franja y cabecera de tabla)</Label>
                        <div className="flex gap-2 mt-1"><input type="color" disabled={!editable} value={emp.color_documentos || '#1f2937'} onChange={e => set('color_documentos', e.target.value)} className="h-9 w-12 rounded border" /><Input disabled={!editable} value={emp.color_documentos || ''} onChange={e => set('color_documentos', e.target.value)} placeholder="#1f2937" /></div>
                    </div>
                    <div className="sm:col-span-2"><Label className="text-xs">Mensaje de la pantalla de acceso</Label><Input disabled={!editable} value={emp.mensaje_bienvenida || ''} onChange={e => set('mensaje_bienvenida', e.target.value)} placeholder="Inicia sesión para continuar" className="mt-1" /></div>
                    <div className="sm:col-span-2"><Label className="text-xs">Pie de todos los documentos (datos registrales, protección de datos…)</Label><Textarea disabled={!editable} rows={2} value={emp.pie_documentos || ''} onChange={e => set('pie_documentos', e.target.value)} placeholder="Inscrita en el Registro Mercantil de Murcia, Tomo…, Folio…, Hoja…" className="mt-1" /></div>
                    <div className="sm:col-span-2"><Label className="text-xs">Texto adicional en facturas</Label><Textarea disabled={!editable} rows={2} value={emp.texto_factura || ''} onChange={e => set('texto_factura', e.target.value)} placeholder="Gracias por su confianza. Transcurrido el vencimiento se aplicarán los intereses de la Ley 3/2004." className="mt-1" /></div>
                    <div className="sm:col-span-2"><Label className="text-xs">Condiciones por defecto en presupuestos (observaciones)</Label><Textarea disabled={!editable} rows={3} value={emp.condiciones_presupuesto || ''} onChange={e => set('condiciones_presupuesto', e.target.value)} placeholder="Validez 30 días. Plazo de entrega a confirmar. Portes no incluidos." className="mt-1" /></div>
                    <label className="flex items-center gap-2 text-sm"><Switch disabled={!editable} checked={emp.mostrar_iban_factura !== false} onCheckedChange={v => set('mostrar_iban_factura', v)} /> Mostrar el IBAN de la empresa en las facturas</label>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={verPdf}><Eye className="h-4 w-4 mr-1" /> Vista previa de una factura</Button>
                    {editable && <Button onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Guardar personalización</Button>}
                </div>
            </div>

            <Dialog open={!!previa} onOpenChange={v => !v && setPrevia(null)}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader><DialogTitle>Vista previa de factura</DialogTitle><DialogDescription>Con los datos, colores y textos tal y como están ahora en el formulario.</DialogDescription></DialogHeader>
                    {previa && <iframe src={previa} className="w-full h-[70vh] rounded-xl border" title="Vista previa" />}
                </DialogContent>
            </Dialog>
        </div>
    )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Building2, Users, Bot, Mail, Palette, ShieldCheck, Loader2, UserPlus, Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { cn, formatCurrency } from '@/lib/utils'
import { ROLES, etiquetaRol, type Rol } from '@/lib/permisos'
import { guardarEmpresa, cambiarRolUsuario, invitarUsuario, guardarMiPerfil } from '@/actions/ajustes'
import { MarcaAjustes } from '@/components/settings/marca-ajustes'

const VARIABLES = ['{numero_factura}', '{nombre_cliente}', '{importe_pendiente}', '{importe_total}', '{fecha_vencimiento}', '{fecha_factura}', '{dias_retraso}', '{nombre_empresa}']

function Seccion({ icono: I, titulo, desc, children }: { icono: any; titulo: string; desc?: string; children: any }) {
    return (
        <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><I className="h-5 w-5" /></div>
                <div><h2 className="font-extrabold">{titulo}</h2>{desc && <p className="text-sm text-muted-foreground">{desc}</p>}</div>
            </div>
            {children}
        </div>
    )
}

export function AjustesCliente({ datos, telegram }: { datos: any; telegram: React.ReactNode }) {
    const router = useRouter()
    const { theme, setTheme } = useTheme()
    const [emp, setEmp] = useState<any>(datos.empresa)
    const [guardando, setGuardando] = useState(false)
    const [nuevo, setNuevo] = useState({ email: '', nombre: '', rol: 'administracion' as Rol })
    const [invitando, setInvitando] = useState(false)
    const [miNombre, setMiNombre] = useState(datos.yo.nombre)
    const editable = datos.puedeAjustes
    const set = (k: string, v: any) => setEmp((e: any) => ({ ...e, [k]: v }))

    const guardar = async (campos: string[]) => {
        setGuardando(true)
        const payload: any = {}
        for (const c of campos) payload[c] = emp[c]
        const r = await guardarEmpresa(payload)
        setGuardando(false)
        if (!r.success) return toast.error(r.error)
        toast.success('Guardado'); router.refresh()
    }

    const invitar = async () => {
        setInvitando(true)
        const r = await invitarUsuario(nuevo)
        setInvitando(false)
        if (!r.success) return toast.error(r.error)
        toast.success(r.correoEnviado ? 'Usuario creado. Le hemos enviado el acceso por correo.' : `Usuario creado. No se pudo enviar el correo: su contraseña temporal es ${r.passwordTemporal}`, { duration: 15000 })
        setNuevo({ email: '', nombre: '', rol: 'administracion' }); router.refresh()
    }

    const cambiarRol = async (userId: string, rol: Rol, activo = true) => {
        const r = await cambiarRolUsuario(userId, rol, activo)
        if (!r.success) return toast.error(r.error)
        toast.success('Permisos actualizados'); router.refresh()
    }

    return (
        <Tabs defaultValue="empresa">
            <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="empresa">Empresa</TabsTrigger>
                <TabsTrigger value="marca">Marca y documentos</TabsTrigger>
                <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
                <TabsTrigger value="telegram">Telegram</TabsTrigger>
                <TabsTrigger value="correo">Correo de cobro</TabsTrigger>
                <TabsTrigger value="ia">IA</TabsTrigger>
                <TabsTrigger value="preferencias">Preferencias</TabsTrigger>
                {editable && <TabsTrigger value="auditoria">Auditoría</TabsTrigger>}
            </TabsList>

            <TabsContent value="empresa" className="pt-4">
                <Seccion icono={Building2} titulo="Datos de la empresa" desc="Aparecen en la firma de los correos y en los documentos.">
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2"><Label className="text-xs">Razón social</Label><Input disabled={!editable} value={emp.nombre || ''} onChange={e => set('nombre', e.target.value)} className="mt-1" /></div>
                        <div><Label className="text-xs">NIF</Label><Input disabled={!editable} value={emp.nif || ''} onChange={e => set('nif', e.target.value)} className="mt-1" /></div>
                        <div><Label className="text-xs">Teléfono</Label><Input disabled={!editable} value={emp.telefono || ''} onChange={e => set('telefono', e.target.value)} className="mt-1" /></div>
                        <div><Label className="text-xs">Email</Label><Input disabled={!editable} value={emp.email || ''} onChange={e => set('email', e.target.value)} className="mt-1" /></div>
                        <div><Label className="text-xs">IBAN (para facturas)</Label><Input disabled={!editable} value={emp.iban || ''} onChange={e => set('iban', e.target.value)} className="mt-1" /></div>
                        <div className="sm:col-span-2"><Label className="text-xs">Dirección</Label><Input disabled={!editable} value={emp.direccion || ''} onChange={e => set('direccion', e.target.value)} className="mt-1" /></div>
                    </div>
                    {editable && <Button onClick={() => guardar(['nombre', 'nif', 'telefono', 'email', 'iban', 'direccion'])} disabled={guardando}>{guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Guardar datos</Button>}
                </Seccion>
            </TabsContent>

            <TabsContent value="marca" className="pt-4">
                <MarcaAjustes empresa={datos.empresa} editable={editable} />
            </TabsContent>

            <TabsContent value="usuarios" className="pt-4 space-y-4">
                <Seccion icono={Users} titulo="Usuarios y roles" desc="Cada usuario solo ve los datos de esta empresa, con los permisos de su rol.">
                    <div className="divide-y rounded-xl border">
                        {datos.usuarios.map((u: any) => (
                            <div key={u.user_id} className={cn('flex flex-col sm:flex-row sm:items-center gap-2 justify-between p-3', !u.activo && 'opacity-50')}>
                                <div className="min-w-0">
                                    <p className="font-bold truncate">{u.nombre || u.email} {u.user_id === datos.yo.userId && <span className="text-xs text-muted-foreground">(tú)</span>}</p>
                                    <p className="text-xs text-muted-foreground">{u.email}</p>
                                </div>
                                {editable && u.user_id !== datos.yo.userId ? (
                                    <div className="flex gap-2 items-center">
                                        <Select value={u.rol} onValueChange={v => cambiarRol(u.user_id, v as Rol, u.activo)}>
                                            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                                            <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Switch checked={u.activo} onCheckedChange={v => cambiarRol(u.user_id, u.rol, v)} aria-label="Activo" />
                                    </div>
                                ) : <span className="text-sm font-semibold">{etiquetaRol(u.rol)}</span>}
                            </div>
                        ))}
                    </div>
                    {editable && (
                        <div className="rounded-xl border p-3 space-y-2">
                            <p className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> Añadir usuario</p>
                            <div className="grid sm:grid-cols-3 gap-2">
                                <Input placeholder="Nombre" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
                                <Input placeholder="email@empresa.com" value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })} />
                                <Select value={nuevo.rol} onValueChange={v => setNuevo({ ...nuevo, rol: v as Rol })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label} — {r.descripcion}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <Button size="sm" onClick={invitar} disabled={invitando || !nuevo.email}>{invitando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Crear y enviar acceso</Button>
                        </div>
                    )}
                    <div className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                        {ROLES.map(r => <p key={r.value}><b className="text-foreground">{r.label}:</b> {r.descripcion}</p>)}
                    </div>
                </Seccion>
            </TabsContent>

            <TabsContent value="telegram" className="pt-4">{telegram}</TabsContent>

            <TabsContent value="correo" className="pt-4">
                <Seccion icono={Mail} titulo="Plantilla de reclamación de pago" desc="Se usa al pulsar «Reclamar pago» (web y Telegram). Siempre se revisa antes de enviar.">
                    <div><Label className="text-xs">Asunto</Label><Input disabled={!editable} value={emp.plantilla_reclamacion_asunto || ''} onChange={e => set('plantilla_reclamacion_asunto', e.target.value)} className="mt-1" /></div>
                    <div><Label className="text-xs">Mensaje</Label><Textarea disabled={!editable} rows={14} value={emp.plantilla_reclamacion_cuerpo || ''} onChange={e => set('plantilla_reclamacion_cuerpo', e.target.value)} className="mt-1 text-sm" /></div>
                    <p className="text-xs text-muted-foreground">Variables: {VARIABLES.join(' · ')}</p>
                    {editable && <Button onClick={() => guardar(['plantilla_reclamacion_asunto', 'plantilla_reclamacion_cuerpo'])} disabled={guardando}>Guardar plantilla</Button>}
                </Seccion>
            </TabsContent>

            <TabsContent value="ia" className="pt-4">
                <Seccion icono={Bot} titulo="Asistente IA" desc="La IA ayuda (lee tickets, transcribe audios, redacta correos, propone gastos y presupuestos), pero nunca ejecuta nada económico sin tu confirmación.">
                    <div className="flex items-center gap-2"><Switch disabled={!editable} checked={emp.ia_activa !== false} onCheckedChange={v => set('ia_activa', v)} /><span className="text-sm font-semibold">IA activada para la empresa</span></div>
                    <div className="max-w-xs"><Label className="text-xs">Límite mensual de peticiones (0 = sin límite)</Label><Input disabled={!editable} type="number" min={0} value={emp.ia_limite_mensual ?? 1000} onChange={e => set('ia_limite_mensual', e.target.value)} className="mt-1" /></div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl border bg-muted/30 p-4">
                        <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Peticiones este mes</p><p className="text-xl font-black">{datos.usoIA.peticiones}</p></div>
                        <div><p className="text-[10px] uppercase font-bold text-muted-foreground">Coste aproximado</p><p className="text-xl font-black">{formatCurrency(datos.usoIA.coste)}</p></div>
                        <div className="col-span-2 sm:col-span-1 text-xs text-muted-foreground">{datos.usoIA.porAccion.map(([k, v]: any) => <p key={k}>{k}: {v}</p>)}</div>
                    </div>
                    {editable && <Button onClick={() => guardar(['ia_activa', 'ia_limite_mensual'])} disabled={guardando}>Guardar</Button>}
                </Seccion>
            </TabsContent>

            <TabsContent value="preferencias" className="pt-4">
                <Seccion icono={Palette} titulo="Tus preferencias">
                    <div className="max-w-sm"><Label className="text-xs">Tu nombre (se ve en auditoría y correos)</Label>
                        <div className="flex gap-2 mt-1"><Input value={miNombre} onChange={e => setMiNombre(e.target.value)} /><Button variant="outline" onClick={async () => { await guardarMiPerfil({ nombre: miNombre }); toast.success('Guardado') }}>Guardar</Button></div>
                    </div>
                    <div>
                        <Label className="text-xs">Tema</Label>
                        <div className="flex gap-2 mt-1">
                            {[{ v: 'light', l: 'Claro', i: Sun }, { v: 'dark', l: 'Oscuro', i: Moon }, { v: 'system', l: 'Sistema', i: Monitor }].map(t => (
                                <button key={t.v} onClick={() => { setTheme(t.v); guardarMiPerfil({ tema: t.v }) }} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold', theme === t.v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}>
                                    <t.i className="h-4 w-4" /> {t.l}
                                </button>
                            ))}
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Tu rol: <b>{etiquetaRol(datos.yo.rol)}</b></p>
                </Seccion>
            </TabsContent>

            {editable && (
                <TabsContent value="auditoria" className="pt-4">
                    <Seccion icono={ShieldCheck} titulo="Últimas acciones registradas" desc="Registro inalterable de creación, edición, envíos, cobros y acciones desde Telegram.">
                        <div className="divide-y rounded-xl border text-sm max-h-[480px] overflow-y-auto">
                            {datos.auditoria.map((a: any) => (
                                <div key={a.id} className="p-2.5 flex justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-semibold">{a.accion.replaceAll('_', ' ')} {a.entidad_ref && <span className="text-muted-foreground font-normal">· {a.entidad_ref}</span>}</p>
                                        <p className="text-xs text-muted-foreground">{a.usuario_nombre} · {a.origen}</p>
                                    </div>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                </div>
                            ))}
                        </div>
                    </Seccion>
                </TabsContent>
            )}
        </Tabs>
    )
}

/**
 * Roles y permisos del ERP. Archivo sin dependencias de servidor para poder
 * usarlo también en componentes de cliente (ocultar botones, menús...).
 * La barrera real está en el servidor (server actions) y en RLS.
 */

export type Rol = 'propietario' | 'administrador' | 'administracion' | 'finanzas' | 'comercial' | 'lectura'

export type Permiso =
    | 'ver'            // consultar datos
    | 'documentos'     // crear/editar presupuestos, albaranes y facturas
    | 'presupuestos'   // crear/editar presupuestos
    | 'clientes'       // gestionar clientes y proveedores
    | 'catalogo'       // gestionar catálogo
    | 'gastos'         // registrar gastos
    | 'cobros'         // confirmar cobros y reclamar pagos
    | 'economico'      // ver importes pendientes, vencidos y avisos de cobro
    | 'agenda'         // gestionar agenda
    | 'enviar'         // enviar correos a clientes
    | 'ajustes'        // configurar empresa y usuarios
    | 'ia'             // usar el asistente IA

export const ROLES: { value: Rol; label: string; descripcion: string }[] = [
    { value: 'propietario', label: 'Propietario', descripcion: 'Acceso total' },
    { value: 'administrador', label: 'Administrador', descripcion: 'Gestión general' },
    { value: 'administracion', label: 'Administración', descripcion: 'Documentos y clientes' },
    { value: 'finanzas', label: 'Finanzas', descripcion: 'Cobros, vencimientos y gastos' },
    { value: 'comercial', label: 'Comercial', descripcion: 'Clientes, presupuestos y agenda' },
    { value: 'lectura', label: 'Solo lectura', descripcion: 'Consulta limitada' },
]

const TODOS: Permiso[] = ['ver', 'documentos', 'presupuestos', 'clientes', 'catalogo', 'gastos', 'cobros', 'economico', 'agenda', 'enviar', 'ajustes', 'ia']

const MATRIZ: Record<Rol, Permiso[]> = {
    propietario: TODOS,
    administrador: TODOS,
    administracion: ['ver', 'documentos', 'presupuestos', 'clientes', 'catalogo', 'gastos', 'agenda', 'enviar', 'ia'],
    finanzas: ['ver', 'cobros', 'economico', 'gastos', 'agenda', 'enviar', 'ia'],
    comercial: ['ver', 'presupuestos', 'clientes', 'agenda', 'enviar', 'ia'],
    lectura: ['ver'],
}

export function tienePermiso(rol: Rol | null | undefined, permiso: Permiso): boolean {
    if (!rol) return false
    return MATRIZ[rol]?.includes(permiso) ?? false
}

export function etiquetaRol(rol: Rol | string | null | undefined): string {
    return ROLES.find(r => r.value === rol)?.label || 'Sin rol'
}

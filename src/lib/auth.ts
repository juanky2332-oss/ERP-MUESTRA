import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso, type Permiso, type Rol } from '@/lib/permisos'

export interface Contexto {
    supabase: any
    userId: string
    email: string | null
    nombre: string
    empresaId: string
    rol: Rol
    origen: 'app' | 'telegram' | 'cron'
}

export class ErrorPermiso extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ErrorPermiso'
    }
}

/**
 * Sesión actual + perfil (empresa y rol). Lanza si no hay sesión o el usuario
 * no pertenece a ninguna empresa. Todas las server actions deben empezar aquí.
 */
export async function getContexto(): Promise<Contexto> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new ErrorPermiso('Sesión caducada. Vuelve a iniciar sesión.')

    const { data: perfil } = await supabase
        .from('perfiles')
        .select('empresa_id, rol, nombre, activo')
        .eq('user_id', user.id)
        .maybeSingle()

    if (!perfil || !perfil.activo) throw new ErrorPermiso('Tu usuario no está asignado a ninguna empresa.')

    return {
        supabase,
        userId: user.id,
        email: user.email ?? null,
        nombre: perfil.nombre || user.email?.split('@')[0] || 'Usuario',
        empresaId: perfil.empresa_id,
        rol: perfil.rol as Rol,
        origen: 'app',
    }
}

/** Igual que getContexto pero exige un permiso concreto. */
export async function requirePermiso(permiso: Permiso): Promise<Contexto> {
    const ctx = await getContexto()
    assertPermiso(ctx, permiso)
    return ctx
}

export function assertPermiso(ctx: Pick<Contexto, 'rol'>, permiso: Permiso) {
    if (!tienePermiso(ctx.rol, permiso)) {
        throw new ErrorPermiso('No tienes permiso para realizar esta acción.')
    }
}

/** Convierte cualquier error en un mensaje presentable para devolver desde una action. */
export function mensajeError(e: unknown): string {
    if (e instanceof ErrorPermiso) return e.message
    if (e && typeof e === 'object' && 'message' in e) return String((e as any).message)
    return 'Error inesperado'
}

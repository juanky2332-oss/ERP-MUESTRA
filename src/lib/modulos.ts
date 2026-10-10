/**
 * Módulos opcionales del ERP. El ERP base (clientes, presupuestos, albaranes,
 * facturas, cobros, gastos, informes...) es igual para todas las empresas;
 * encima se activan los módulos que encajan con la actividad de cada una.
 * Se guardan en empresas.modulos = { <id>: true|false }.
 */
export interface Modulo {
    id: string
    nombre: string
    menu: string
    href: string
    descripcion: string
    paraQuien: string
}

export const MODULOS: Modulo[] = [
    {
        id: 'calculadora_mecanizado',
        nombre: 'Calculadora de mecanizado',
        menu: 'Calculadora mecanizado',
        href: '/calculadora',
        descripcion: 'Peso y coste de material por forma y medidas, creces, piezas por barra, tiempos de máquina, tratamientos y margen. Crea presupuestos con la pieza calculada y ajusta precios con el mercado.',
        paraQuien: 'Talleres de mecanizado, calderería y metal',
    },
    {
        id: 'presupuesto_plano',
        nombre: 'Presupuesto desde plano',
        menu: 'Presupuesto desde plano',
        href: '/planos',
        descripcion: 'Sube el plano, una foto con medidas o un esquema: la IA lee lo dibujado y el ERP calcula con tus precios. Piezas mecanizadas (a la calculadora), calderería e inox (despiece, corte, plegado, soldadura y acabado) y esquemas eléctricos, neumáticos o hidráulicos (lista de materiales con tu catálogo).',
        paraQuien: 'Talleres de mecanizado, calderería, inoxidable y montajes eléctricos',
    },
]

export function moduloActivo(modulos: Record<string, boolean> | null | undefined, id: string): boolean {
    // Sin configurar = activo (compatibilidad con empresas creadas antes de los módulos)
    return modulos?.[id] !== false
}

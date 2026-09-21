export interface LineItem {
    descripcion: string
    cantidad: number
    precio_unitario: number
    importe: number
}

export interface Presupuesto {
    id: string
    numero: string
    fecha: string
    cliente_id?: string
    cliente_razon_social: string
    cliente_cif?: string
    cliente_direccion?: string
    cliente_telefono?: string
    cliente_email?: string
    pedido_referencia?: string
    lineas: LineItem[]
    subtotal: number
    margen_beneficio?: number
    base_imponible: number
    iva_porcentaje: number
    iva_importe: number
    total: number
    estado: 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'convertido' | 'gestionado'
    statuses: string[]
    observaciones?: string
    pdf_url?: string
    enviado: boolean
    fecha_envio?: string
    created_at: string
    updated_at: string
}

export interface Albaran {
    id: string
    numero: string
    fecha: string
    fecha_entrega?: string
    presupuesto_id?: string
    cliente_id?: string
    cliente_razon_social: string
    cliente_cif?: string
    cliente_direccion?: string
    cliente_telefono?: string
    pedido_referencia?: string
    persona_recibe?: string
    lineas: LineItem[]
    subtotal: number
    iva_importe: number
    total: number
    estado: 'pendiente' | 'enviado' | 'entregado' | 'firmado' | 'facturado' | 'pasado_a_factura' | 'gestionado'
    statuses: string[]
    documento_escaneado_url?: string
    documento_firmado_url?: string
    pdf_url?: string
    observaciones?: string
    created_at: string
    updated_at: string
}

export interface Factura {
    id: string
    numero: string
    fecha: string
    fecha_vencimiento?: string
    albaran_ids?: string[]
    presupuesto_id?: string
    cliente_id?: string
    cliente_razon_social: string
    cliente_cif?: string
    cliente_direccion?: string
    cliente_telefono?: string
    cliente_email?: string
    pedido_referencia?: string
    lineas: LineItem[]
    subtotal: number
    iva_porcentaje: number
    iva_importe: number
    total: number
    forma_pago?: 'transferencia' | 'efectivo' | '30_dias' | '60_dias' | '90_dias'
    iban?: string
    estado: 'pendiente' | 'enviada' | 'pagada' | 'vencida'
    statuses: string[]
    enviada: boolean
    fecha_envio?: string
    pagada: boolean
    fecha_pago?: string
    pdf_url?: string
    observaciones?: string
    created_at: string
    updated_at: string
}

export interface Contacto {
    id: string
    razon_social: string
    cif: string
    direccion?: string
    codigo_postal?: string
    ciudad?: string
    provincia?: string
    telefono?: string
    telefono_alternativo?: string
    email?: string
    email_facturacion?: string
    persona_contacto?: string
    observaciones?: string
    total_facturado: number
    created_at: string
    updated_at: string
}

export interface MaterialPrecio {
    id: string
    material: string
    tipo?: string
    precio_por_kg: number
    moneda: string
    fuente?: string
    fecha_actualizacion: string
}

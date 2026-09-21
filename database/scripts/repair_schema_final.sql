-- CORRECCIÓN INTEGRAL DEL ESQUEMA DE BASE DE DATOS

-- 1. Estandarizar nombre del cliente (Frontend envía 'cliente_razon_social')
ALTER TABLE public.presupuestos RENAME COLUMN cliente_nombre TO cliente_razon_social;
ALTER TABLE public.albaranes RENAME COLUMN cliente_nombre TO cliente_razon_social;
ALTER TABLE public.facturas RENAME COLUMN cliente_nombre TO cliente_razon_social;

-- 2. Corregir Referencia de Pedido (Frontend envía 'pedido_referencia')
ALTER TABLE public.presupuestos RENAME COLUMN ref_pedido TO pedido_referencia;

-- 3. Corregir Observaciones (Frontend envía 'observaciones', DB tenía 'descripcion')
-- Usamos 'descripcion' para las líneas, pero 'observaciones' para el documento global.
ALTER TABLE public.presupuestos RENAME COLUMN descripcion TO observaciones;
ALTER TABLE public.albaranes RENAME COLUMN descripcion TO observaciones;
-- Facturas no tenía descripción explícita en el create table enviado, vamos a asegurarnos de que tenga observaciones
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS observaciones text;

-- 4. AÑADIR COLUMNA PARA LAS LÍNEAS DEL DOCUMENTO (CRÍTICO)
-- Los documentos guardan las líneas (items) como un array JSON.
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS lineas jsonb;
ALTER TABLE public.albaranes ADD COLUMN IF NOT EXISTS lineas jsonb;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS lineas jsonb;

-- 5. Asegurar campos de contacto extra (por si falló el paso anterior)
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS cliente_email text;
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS cliente_telefono text;
ALTER TABLE public.albaranes ADD COLUMN IF NOT EXISTS cliente_email text;
ALTER TABLE public.albaranes ADD COLUMN IF NOT EXISTS cliente_telefono text;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS cliente_email text;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS cliente_telefono text;

-- 6. Campos de totales faltantes en Presupuestos (DB original tenía algunos, pero aseguramos todos los que usa la App)
-- App usa: subtotal, margen_beneficio, base_imponible, iva_porcentaje, iva_importe, total
-- Presupuestos tenía: coste_material, coste_mano_obra, margen_beneficio, unidades, precio_unitario, base_imponible, iva_porcentaje, total.
-- Faltan: subtotal, iva_importe.
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS subtotal numeric;
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS iva_importe numeric;

-- Limpieza (Opcional): Si 'unidades' y 'precio_unitario' globales sobran (porque están en 'lineas'), los dejamos por si acaso o los ignoramos.

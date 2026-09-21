-- ==========================================================
-- SCRIPT DE SINCRONIZACIÓN FINAL - EMPRESA X
-- ==========================================================
-- Este script unifica las columnas de Presupuestos, Albaranes y Facturas
-- para que coincidan exactamente con lo que envía la aplicación.

-- 1. ASEGURAR COLUMNAS EN PRESUPUESTOS
ALTER TABLE public.presupuestos 
ADD COLUMN IF NOT EXISTS pedido_referencia text,
ADD COLUMN IF NOT EXISTS observaciones text,
ADD COLUMN IF NOT EXISTS lineas jsonb,
ADD COLUMN IF NOT EXISTS margen_beneficio numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS iva_porcentaje numeric DEFAULT 21,
ADD COLUMN IF NOT EXISTS iva_importe numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS base_imponible numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cliente_razon_social text,
ADD COLUMN IF NOT EXISTS cliente_telefono text,
ADD COLUMN IF NOT EXISTS cliente_email text,
ADD COLUMN IF NOT EXISTS pdf_url text,
ADD COLUMN IF NOT EXISTS enviado boolean DEFAULT false;

-- 2. ASEGURAR COLUMNAS EN ALBARANES
ALTER TABLE public.albaranes 
ADD COLUMN IF NOT EXISTS pedido_referencia text,
ADD COLUMN IF NOT EXISTS observaciones text,
ADD COLUMN IF NOT EXISTS lineas jsonb,
ADD COLUMN IF NOT EXISTS margen_beneficio numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS iva_porcentaje numeric DEFAULT 21,
ADD COLUMN IF NOT EXISTS iva_importe numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS base_imponible numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cliente_razon_social text,
ADD COLUMN IF NOT EXISTS cliente_telefono text,
ADD COLUMN IF NOT EXISTS cliente_email text,
ADD COLUMN IF NOT EXISTS pdf_url text,
ADD COLUMN IF NOT EXISTS enviado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS factura_id uuid; -- Útil para trazabilidad

-- 3. ASEGURAR COLUMNAS EN FACTURAS
ALTER TABLE public.facturas 
ADD COLUMN IF NOT EXISTS pedido_referencia text,
ADD COLUMN IF NOT EXISTS observaciones text,
ADD COLUMN IF NOT EXISTS lineas jsonb,
ADD COLUMN IF NOT EXISTS margen_beneficio numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS iva_porcentaje numeric DEFAULT 21,
ADD COLUMN IF NOT EXISTS iva_importe numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS base_imponible numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cliente_razon_social text,
ADD COLUMN IF NOT EXISTS cliente_telefono text,
ADD COLUMN IF NOT EXISTS cliente_email text,
ADD COLUMN IF NOT EXISTS pdf_url text,
ADD COLUMN IF NOT EXISTS enviado boolean DEFAULT false;

-- 4. RENOMBRADOS DE SEGURIDAD (Si quedaron columnas antiguas con otros nombres)
DO $$ 
BEGIN
  -- Presupuestos
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='presupuestos' AND column_name='cliente_nombre') THEN
    ALTER TABLE public.presupuestos RENAME COLUMN cliente_nombre TO cliente_razon_social_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='presupuestos' AND column_name='ref_pedido') THEN
    ALTER TABLE public.presupuestos RENAME COLUMN ref_pedido TO pedido_referencia_old;
  END IF;

  -- Albaranes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='albaranes' AND column_name='cliente_nombre') THEN
    ALTER TABLE public.albaranes RENAME COLUMN cliente_nombre TO cliente_razon_social_old;
  END IF;

  -- Facturas
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturas' AND column_name='cliente_nombre') THEN
    ALTER TABLE public.facturas RENAME COLUMN cliente_nombre TO cliente_razon_social_old;
  END IF;
END $$;

-- 5. STORAGE BUCKETS (Asegurar que existan para PDF y OCR)
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos', 'documentos', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('firmados', 'firmados', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('gastos', 'gastos', true) ON CONFLICT DO NOTHING;

-- Mensaje: Esquema sincronizado con éxito.

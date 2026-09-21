-- ============================================================
-- ERP MUESTRA (Empresa X) — columnas y bucket que faltaban
-- Pega esto en Supabase > SQL Editor y ejecútalo. Seguro repetirlo.
-- ============================================================

-- 1) Dirección completa del cliente en los 3 documentos
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS cliente_codigo_postal TEXT;
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS cliente_ciudad TEXT;
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS cliente_provincia TEXT;

ALTER TABLE public.albaranes ADD COLUMN IF NOT EXISTS cliente_codigo_postal TEXT;
ALTER TABLE public.albaranes ADD COLUMN IF NOT EXISTS cliente_ciudad TEXT;
ALTER TABLE public.albaranes ADD COLUMN IF NOT EXISTS cliente_provincia TEXT;
ALTER TABLE public.albaranes ADD COLUMN IF NOT EXISTS descripcion TEXT;

ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS cliente_codigo_postal TEXT;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS cliente_ciudad TEXT;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS cliente_provincia TEXT;

-- 2) CIF del proveedor en gastos (para no confundirlo con la propia empresa)
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS proveedor_cif TEXT;

-- 3) Bucket para subir albaranes ya firmados por el cliente
INSERT INTO storage.buckets (id, name, public)
VALUES ('albaranes-firmados', 'albaranes-firmados', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Allow anon upload albaranes-firmados" ON storage.objects;
CREATE POLICY "Allow anon upload albaranes-firmados" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'albaranes-firmados');

DROP POLICY IF EXISTS "Allow anon select albaranes-firmados" ON storage.objects;
CREATE POLICY "Allow anon select albaranes-firmados" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'albaranes-firmados');

SELECT 'Columnas y bucket que faltaban, creados correctamente' AS status;

-- 08 — Calculadora de mecanizado (precios y tarifas propios por empresa)
--      y personalización de marca (logos de app y de documentos).

-- ---------- Calculadora ----------
CREATE TABLE IF NOT EXISTS public.calculadora_config (
  empresa_id UUID PRIMARY KEY DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- { material_id: { precioKg, indiceRef: {aluminio,cobre,acero,zinc}, fecha } }
  precios JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Materiales propios añadidos por la empresa (misma forma que los de serie)
  materiales_extra JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { maquina_id: tarifa €/h }
  tarifas JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- margen, kerf, largoBarra, sobremedidas por defecto...
  parametros JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calculos_piezas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  cliente_id UUID REFERENCES public.contactos(id) ON DELETE SET NULL,
  entrada JSONB NOT NULL,
  resultado JSONB NOT NULL,
  precio_unidad NUMERIC(12,2),
  cantidad INTEGER,
  presupuesto_id UUID REFERENCES public.presupuestos(id) ON DELETE SET NULL,
  usuario_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calculos_empresa ON public.calculos_piezas (empresa_id, created_at DESC);

DO $$
DECLARE t TEXT; p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['calculadora_config','calculos_piezas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY emp_select ON public.%I FOR SELECT TO authenticated USING (public.es_miembro(empresa_id))', t);
    EXECUTE format('CREATE POLICY emp_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.puede_escribir(empresa_id))', t);
    EXECUTE format('CREATE POLICY emp_update ON public.%I FOR UPDATE TO authenticated USING (public.puede_escribir(empresa_id)) WITH CHECK (public.puede_escribir(empresa_id))', t);
    EXECUTE format('CREATE POLICY emp_delete ON public.%I FOR DELETE TO authenticated USING (public.puede_escribir(empresa_id))', t);
  END LOOP;
END $$;

-- ---------- Marca / personalización ----------
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS nombre_comercial TEXT,
  ADD COLUMN IF NOT EXISTS logo_app_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_documentos_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_documentos_actualizado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS color_documentos TEXT DEFAULT '#1f2937',
  ADD COLUMN IF NOT EXISTS pie_documentos TEXT,
  ADD COLUMN IF NOT EXISTS condiciones_presupuesto TEXT,
  ADD COLUMN IF NOT EXISTS texto_factura TEXT,
  ADD COLUMN IF NOT EXISTS mostrar_iban_factura BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS web TEXT,
  ADD COLUMN IF NOT EXISTS mensaje_bienvenida TEXT;

-- Bucket PÚBLICO solo para logos (la pantalla de acceso los muestra sin sesión).
-- Nunca se guardan aquí documentos ni datos de clientes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('marca', 'marca', true, 2097152, ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'];

SELECT 'Migración 08 aplicada' AS status;

-- 12 — Presupuestos desde plano (motor de IndunexIA Presupuestos dentro del ERP).
-- Cada lectura de plano queda guardada con su despiece editable (líneas de coste internas),
-- y al pasarla a presupuesto se enlaza con el presupuesto normal del ERP.

CREATE TABLE IF NOT EXISTS public.planos_presupuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL DEFAULT 'Presupuesto',
  sector TEXT NOT NULL DEFAULT 'calderia',
  cliente_id UUID REFERENCES public.contactos(id) ON DELETE SET NULL,
  lectura JSONB,
  lineas JSONB NOT NULL DEFAULT '[]'::jsonb,
  cantidad INTEGER NOT NULL DEFAULT 1,
  margen NUMERIC NOT NULL DEFAULT 30,
  iva NUMERIC NOT NULL DEFAULT 21,
  dudas JSONB NOT NULL DEFAULT '[]'::jsonb,
  supuestos JSONB NOT NULL DEFAULT '[]'::jsonb,
  notas TEXT NOT NULL DEFAULT '',
  formato TEXT NOT NULL DEFAULT 'unico',
  concepto TEXT NOT NULL DEFAULT '',
  base NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  archivos JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ ruta, nombre, tipo }] en el bucket «documentos»
  presupuesto_id UUID REFERENCES public.presupuestos(id) ON DELETE SET NULL,
  modelo TEXT,
  ms INTEGER,
  creado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planos_presupuestos_empresa_idx ON public.planos_presupuestos (empresa_id, created_at DESC);

-- Precio de mercado del día por material (lo comparten todas las empresas; lo escribe solo el servidor).
CREATE TABLE IF NOT EXISTS public.plano_mercado (
  material TEXT PRIMARY KEY,
  eur_kg NUMERIC NOT NULL,
  min NUMERIC,
  max NUMERIC,
  fuente TEXT,
  url TEXT,
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.planos_presupuestos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emp_select ON public.planos_presupuestos;
DROP POLICY IF EXISTS emp_insert ON public.planos_presupuestos;
DROP POLICY IF EXISTS emp_update ON public.planos_presupuestos;
DROP POLICY IF EXISTS emp_delete ON public.planos_presupuestos;
CREATE POLICY emp_select ON public.planos_presupuestos FOR SELECT TO authenticated USING (public.es_miembro(empresa_id));
CREATE POLICY emp_insert ON public.planos_presupuestos FOR INSERT TO authenticated WITH CHECK (public.puede_escribir(empresa_id));
CREATE POLICY emp_update ON public.planos_presupuestos FOR UPDATE TO authenticated USING (public.puede_escribir(empresa_id)) WITH CHECK (public.puede_escribir(empresa_id));
CREATE POLICY emp_delete ON public.planos_presupuestos FOR DELETE TO authenticated USING (public.puede_escribir(empresa_id));

ALTER TABLE public.plano_mercado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mercado_leer ON public.plano_mercado;
CREATE POLICY mercado_leer ON public.plano_mercado FOR SELECT TO authenticated USING (true);

SELECT 'Migración 12 (presupuestos desde plano con IA) completada' AS status;

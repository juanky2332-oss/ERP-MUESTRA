-- =====================================================================
-- 10 · Fiscal: calendario de modelos, avisos y paquete de facturas para el asesor
-- =====================================================================
-- empresas.fiscal = { regimen: 'sociedad'|'autonomo', modelos: {"303":true,...},
--                     dias_aviso: 30, dias_margen_asesor: 10 }
-- La carpeta local NO se guarda aquí: la recuerda cada navegador (permiso del
-- sistema de archivos), por seguridad una web no puede conocer rutas del PC.

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS fiscal JSONB;

-- Historial de exportaciones (trazabilidad: quién, cuándo, qué periodo y con qué totales)
CREATE TABLE IF NOT EXISTS public.fiscal_exportaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL,
  destino TEXT NOT NULL DEFAULT 'zip' CHECK (destino IN ('carpeta', 'zip')),
  num_emitidas INTEGER NOT NULL DEFAULT 0,
  num_recibidas INTEGER NOT NULL DEFAULT 0,
  num_archivos INTEGER NOT NULL DEFAULT 0,
  totales JSONB,
  anomalias INTEGER NOT NULL DEFAULT 0,
  usuario_id UUID,
  usuario_nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_exportaciones_emp_periodo ON public.fiscal_exportaciones (empresa_id, periodo, created_at DESC);

-- Avisos ya atendidos: «documentación entregada al asesor» (clave = periodo|mes de presentación)
CREATE TABLE IF NOT EXISTS public.fiscal_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id) ON DELETE CASCADE,
  clave TEXT NOT NULL,
  periodo TEXT NOT NULL,
  entregado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id UUID,
  usuario_nombre TEXT,
  UNIQUE (empresa_id, clave)
);

ALTER TABLE public.fiscal_exportaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emp_select ON public.fiscal_exportaciones;
DROP POLICY IF EXISTS emp_insert ON public.fiscal_exportaciones;
CREATE POLICY emp_select ON public.fiscal_exportaciones FOR SELECT TO authenticated USING (public.es_miembro(empresa_id));
CREATE POLICY emp_insert ON public.fiscal_exportaciones FOR INSERT TO authenticated WITH CHECK (public.puede_escribir(empresa_id));
-- Sin UPDATE/DELETE: el historial no se puede retocar desde la app.

DROP POLICY IF EXISTS emp_select ON public.fiscal_entregas;
DROP POLICY IF EXISTS emp_insert ON public.fiscal_entregas;
DROP POLICY IF EXISTS emp_delete ON public.fiscal_entregas;
CREATE POLICY emp_select ON public.fiscal_entregas FOR SELECT TO authenticated USING (public.es_miembro(empresa_id));
CREATE POLICY emp_insert ON public.fiscal_entregas FOR INSERT TO authenticated WITH CHECK (public.puede_escribir(empresa_id));
CREATE POLICY emp_delete ON public.fiscal_entregas FOR DELETE TO authenticated USING (public.puede_escribir(empresa_id));

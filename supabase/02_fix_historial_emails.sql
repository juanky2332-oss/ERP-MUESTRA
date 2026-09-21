-- ============================================================
-- ERP MUESTRA (Empresa X) — tabla de historial de correos
-- Pega esto en Supabase > SQL Editor y ejecútalo. Seguro repetirlo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notificaciones_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remitente TEXT,
  destinatario TEXT,
  tipo_documento TEXT,
  numero_documento TEXT,
  pedido_referencia TEXT,
  asunto TEXT,
  mensaje TEXT,
  usuario_nombre TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.notificaciones_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso total notificaciones_historial" ON public.notificaciones_historial;
CREATE POLICY "Acceso total notificaciones_historial" ON public.notificaciones_historial
  FOR ALL USING (true) WITH CHECK (true);

SELECT 'Tabla de historial de correos creada correctamente' AS status;

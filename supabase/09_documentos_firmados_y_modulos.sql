-- 09 — Albaranes y partes firmados (trazabilidad hasta la factura) y
--      módulos opcionales por empresa (p. ej. calculadora de mecanizado).
--
-- Un "documento firmado" es cualquier papel que el cliente firma: albarán de
-- entrega, parte de trabajo/servicio, recepción de material... Se sube escaneado
-- o en foto, la IA lo lee y se UNE a su albarán y/o factura para tener el
-- expediente cuadrado (factura + albarán + firma en un solo PDF).
-- Se reutiliza la tabla albaranes_firmados (vacía hasta ahora) ampliándola.

ALTER TABLE public.albaranes_firmados
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'albaran',
  ADD COLUMN IF NOT EXISTS factura_id UUID REFERENCES public.facturas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_documento TEXT,
  ADD COLUMN IF NOT EXISTS fecha_documento DATE,
  ADD COLUMN IF NOT EXISTS firmado BOOLEAN,
  ADD COLUMN IF NOT EXISTS firmante_nombre TEXT,
  ADD COLUMN IF NOT EXISTS firmante_dni TEXT,
  ADD COLUMN IF NOT EXISTS cliente_razon_social TEXT,
  ADD COLUMN IF NOT EXISTS descripcion TEXT,
  ADD COLUMN IF NOT EXISTS horas NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS incidencias TEXT,
  ADD COLUMN IF NOT EXISTS con_incidencias BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archivo_nombre TEXT,
  ADD COLUMN IF NOT EXISTS archivo_tipo TEXT,
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS usuario_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.albaranes_firmados ADD CONSTRAINT albaranes_firmados_tipo_chk
    CHECK (tipo IN ('albaran','parte_trabajo','recepcion_material','otro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un mismo archivo solo se une una vez al mismo albarán
ALTER TABLE public.albaranes_firmados DROP CONSTRAINT IF EXISTS albaranes_firmados_albaran_id_fkey;
ALTER TABLE public.albaranes_firmados ADD CONSTRAINT albaranes_firmados_albaran_id_fkey
  FOREIGN KEY (albaran_id) REFERENCES public.albaranes(id) ON DELETE SET NULL;
ALTER TABLE public.albaranes_firmados DROP CONSTRAINT IF EXISTS albaranes_firmados_cliente_id_fkey;
DO $$ BEGIN
  ALTER TABLE public.albaranes_firmados ADD CONSTRAINT albaranes_firmados_cliente_id_fkey
    FOREIGN KEY (cliente_id) REFERENCES public.contactos(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_firmados_empresa ON public.albaranes_firmados (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_firmados_albaran ON public.albaranes_firmados (albaran_id);
CREATE INDEX IF NOT EXISTS idx_firmados_factura ON public.albaranes_firmados (factura_id);

-- Marca rápida en el albarán: cuándo y quién firmó (para listados y PDF)
ALTER TABLE public.albaranes
  ADD COLUMN IF NOT EXISTS firmado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS firmado_por TEXT;

-- Resumen en la factura de sus soportes firmados (lo imprime el PDF):
-- "ALB-03-2026 firmado 12/09/2026 · Parte 145 firmado 13/09/2026"
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS soportes_firmados TEXT;

-- Módulos opcionales que cada empresa activa según su actividad
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS modulos JSONB NOT NULL DEFAULT '{"calculadora_mecanizado": true}'::jsonb;

-- Bucket privado de firmados: admitir los mismos formatos que suben los móviles
UPDATE storage.buckets SET public = false WHERE id = 'albaranes-firmados';

SELECT 'Migración 09 (documentos firmados y módulos) completada' AS status;

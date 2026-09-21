-- Migration: Fix Document States (Separating Life Cycle from Sent Status)
-- Description: Adds 'estado_vida' and 'es_enviado' columns to presupuestos, albaranes, and facturas.
-- Migrates existing data deriving from 'estado' text column and existing boolean flags where available.

-- 1. PRESUPUESTOS
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS estado_vida TEXT DEFAULT 'Pendiente';
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS es_enviado BOOLEAN DEFAULT FALSE;

-- Migrate Presupuestos Data
-- Looks for 'aceptado' or 'traspasado' in the 'estado' text column
UPDATE presupuestos 
SET 
  estado_vida = CASE 
    WHEN estado ILIKE '%aceptado%' OR estado ILIKE '%traspasado%' THEN 'Traspasado' 
    ELSE 'Pendiente' 
  END;

-- Attempt to migrate 'es_enviado' from 'enviado' column if it exists, or from 'estado' text
DO $$
BEGIN
  -- If 'enviado' column exists (from schema.sql), use it
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='presupuestos' AND column_name='enviado') THEN
    UPDATE presupuestos SET es_enviado = enviado WHERE enviado IS NOT NULL;
  END IF;

  -- Also check if 'estado' text implies sent
  UPDATE presupuestos SET es_enviado = TRUE WHERE estado ILIKE '%enviado%';
END $$;


-- 2. ALBARANES
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS estado_vida TEXT DEFAULT 'Pendiente';
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS es_enviado BOOLEAN DEFAULT FALSE;

-- Migrate Albaranes Data
UPDATE albaranes 
SET 
  estado_vida = CASE 
    WHEN estado ILIKE '%traspasado%' OR estado ILIKE '%facturado%' THEN 'Traspasado' 
    ELSE 'Pendiente' 
  END,
  es_enviado = (estado ILIKE '%enviado%');


-- 3. FACTURAS
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS estado_vida TEXT DEFAULT 'Pendiente';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS es_enviado BOOLEAN DEFAULT FALSE;

-- Migrate Facturas Data
-- Facturas usually has 'pagada' boolean, check schema.sql. If not, use estado.
DO $$
BEGIN
  -- Default migration from state text
  UPDATE facturas 
  SET 
    estado_vida = CASE 
      WHEN estado ILIKE '%pagada%' THEN 'Pagada' 
      ELSE 'Pendiente' 
    END,
    es_enviado = (estado ILIKE '%enviada%' OR estado ILIKE '%enviado%');

  -- If 'pagada' boolean exists, overwrite
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturas' AND column_name='pagada') THEN
    UPDATE facturas SET estado_vida = 'Pagada' WHERE pagada IS TRUE;
  END IF;

  -- If 'enviada' boolean exists, overwrite
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturas' AND column_name='enviada') THEN
    UPDATE facturas SET es_enviado = TRUE WHERE enviada IS TRUE;
  END IF;
END $$;

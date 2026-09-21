-- ============================================================
-- ERP MUESTRA (Empresa X) — instalación completa en un solo paso
-- Pega este archivo entero en Supabase > SQL Editor y ejecútalo.
-- Es seguro ejecutarlo varias veces (usa IF NOT EXISTS / ON CONFLICT).
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Esquema base: contactos, presupuestos, albaranes, facturas, precios, contadores, logs
-- ORDEN CORREGIDO DE CREACIÓN DE TABLAS

-- 1. Tabla: contactos (Debe ir primero porque todos la referencian)
CREATE TABLE IF NOT EXISTS contactos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social TEXT NOT NULL,
  cif TEXT UNIQUE NOT NULL,
  direccion TEXT,
  codigo_postal TEXT,
  ciudad TEXT,
  provincia TEXT,
  telefono TEXT,
  telefono_alternativo TEXT,
  email TEXT,
  email_facturacion TEXT,
  persona_contacto TEXT,
  observaciones TEXT,
  total_facturado NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla: presupuestos (Referencia a contactos)
CREATE TABLE IF NOT EXISTS presupuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  fecha DATE NOT NULL,
  cliente_id UUID REFERENCES contactos(id),
  cliente_razon_social TEXT NOT NULL,
  cliente_cif TEXT,
  cliente_direccion TEXT,
  cliente_telefono TEXT,
  cliente_email TEXT,
  pedido_referencia TEXT,
  lineas JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  margen_beneficio NUMERIC(5,2),
  base_imponible NUMERIC(10,2) NOT NULL,
  iva_porcentaje NUMERIC(5,2) DEFAULT 21,
  iva_importe NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  estado TEXT DEFAULT 'borrador',
  observaciones TEXT,
  pdf_url TEXT,
  enviado BOOLEAN DEFAULT FALSE,
  fecha_envio TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla: albaranes (Referencia a presupuestos y contactos)
CREATE TABLE IF NOT EXISTS albaranes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  fecha DATE NOT NULL,
  fecha_entrega DATE,
  presupuesto_id UUID REFERENCES presupuestos(id),
  cliente_id UUID REFERENCES contactos(id),
  cliente_razon_social TEXT NOT NULL,
  cliente_cif TEXT,
  cliente_direccion TEXT,
  cliente_telefono TEXT,
  pedido_referencia TEXT,
  persona_recibe TEXT,
  lineas JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  iva_importe NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  documento_escaneado_url TEXT,
  documento_firmado_url TEXT,
  pdf_url TEXT,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Tabla: facturas (Referencia a presupuestos y contactos)
CREATE TABLE IF NOT EXISTS facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  fecha DATE NOT NULL,
  fecha_vencimiento DATE,
  albaran_ids JSONB,
  presupuesto_id UUID REFERENCES presupuestos(id),
  cliente_id UUID REFERENCES contactos(id),
  cliente_razon_social TEXT NOT NULL,
  cliente_cif TEXT,
  cliente_direccion TEXT,
  cliente_telefono TEXT,
  cliente_email TEXT,
  pedido_referencia TEXT,
  lineas JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  iva_porcentaje NUMERIC(5,2) DEFAULT 21,
  iva_importe NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  forma_pago TEXT,
  iban TEXT,
  estado TEXT DEFAULT 'emitida',
  enviada BOOLEAN DEFAULT FALSE,
  fecha_envio TIMESTAMP,
  pagada BOOLEAN DEFAULT FALSE,
  fecha_pago DATE,
  pdf_url TEXT,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Tablas independientes
CREATE TABLE IF NOT EXISTS precios_materiales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material TEXT NOT NULL,
  tipo TEXT,
  precio_por_kg NUMERIC(10,4) NOT NULL,
  moneda TEXT DEFAULT 'EUR',
  fuente TEXT,
  fecha_actualizacion TIMESTAMP DEFAULT NOW(),
  UNIQUE(material, tipo)
);

CREATE TABLE IF NOT EXISTS contadores (
  tipo TEXT PRIMARY KEY,
  anio INTEGER NOT NULL,
  ultimo_numero INTEGER NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario TEXT,
  accion TEXT,
  documento_tipo TEXT,
  documento_numero TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Datos iniciales: Precios
INSERT INTO precios_materiales (material, precio_por_kg) VALUES
('Acero inoxidable 304', 2.20),
('Acero al carbono S235', 0.80),
('Aluminio 6082', 3.10),
('Latón CuZn37', 6.50),
('Cobre Cu-ETP', 9.00)
ON CONFLICT (material, tipo) DO NOTHING;

-- Datos iniciales: Contadores
INSERT INTO contadores (tipo, anio, ultimo_numero) VALUES
('presupuesto', 2026, 0),
('albaran', 2026, 0),
('factura', 2026, 0)
ON CONFLICT (tipo) DO NOTHING;

-- 2) Gastos (con OCR) y albaranes firmados
-- TABLA DE GASTOS
CREATE TABLE IF NOT EXISTS gastos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    fecha DATE DEFAULT CURRENT_DATE,
    proveedor TEXT DEFAULT 'Varios',
    concepto TEXT,
    base_imponible NUMERIC(10,2) DEFAULT 0,
    iva_porcentaje NUMERIC(5,2) DEFAULT 21,
    iva_importe NUMERIC(10,2) DEFAULT 0,
    retencion_porcentaje NUMERIC(5,2) DEFAULT 0,
    retencion_importe NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2) DEFAULT 0,
    categoria TEXT, -- Para agrupar gastos
    archivo_url TEXT, -- URL en Storage
    ocr_data JSONB, -- Datos crudos del OCR si se requiere
    estado TEXT DEFAULT 'pendiente' -- pagado, pendiente
);

-- TABLA DE ALBARANES FIRMADOS
CREATE TABLE IF NOT EXISTS albaranes_firmados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    albaran_id UUID REFERENCES albaranes(id),
    cliente_id UUID REFERENCES contactos(id),
    archivo_url TEXT NOT NULL,
    fecha_subida TIMESTAMP WITH TIME ZONE DEFAULT now(),
    comentarios TEXT,
    ocr_data JSONB, -- Texto completo o campos detectados
    validado BOOLEAN DEFAULT FALSE -- Si el sistema/humano ha confirmado que es correcto
);

-- BUCKETS DE STORAGE (Se deben crear desde la UI de Supabase o API, pero el SQL no crea buckets directamente en todas las versiones)
-- Nota: Asegurarse de tener buckets 'gastos' y 'albaranes-firmados' públicos o autenticados.

-- Políticas de Seguridad (Ruls simplificadas para desarrollo, ajustar para prod)
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a gastos" ON gastos FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE albaranes_firmados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a albaranes firmados" ON albaranes_firmados FOR ALL USING (true) WITH CHECK (true);

-- 3) Embeddings/RAG y emails de contacto múltiples
-- Enable pgvector extension for RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Document Embeddings Table
-- Stores embeddings for all RAG documents
CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT, -- Text content extracted via OCR/Parser
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  metadata JSONB, -- { "filename": "...", "type": "invoice|contract", "related_id": "..." }
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster similarity search
CREATE INDEX IF NOT EXISTS document_embeddings_embedding_idx ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 2. Client Emails Table
-- For "Smart Email Input" (Multi-contact management)
CREATE TABLE IF NOT EXISTS client_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES contactos(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  tag TEXT, -- 'Administración', 'Taller', 'Gerencia', etc.
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. RAG/Similarity Search Function
-- Function to be called from Supabase Client to find context
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_embeddings.id,
    document_embeddings.content,
    document_embeddings.metadata,
    1 - (document_embeddings.embedding <=> query_embedding) AS similarity
  FROM document_embeddings
  WHERE 1 - (document_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY document_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 4. Status updates (Comments/Docs only, as columns are TEXT)
-- Presupuestos: 'borrador', 'enviado', 'aceptado', 'rechazado', 'traspasado'
-- Albaranes: 'pendiente', 'firmado', 'facturado'
-- Facturas: 'borrador', 'emitida', 'pagada', 'vencida'

-- Make sure existing tables allow these states (they are TEXT, so yes).

-- 4) Migraciones incrementales
-- migrations/20260204_add_factura_url_to_gastos.sql

-- Add factura_url column to gastos table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gastos' AND column_name = 'factura_url') THEN
        ALTER TABLE gastos ADD COLUMN factura_url TEXT;
    END IF;
END $$;

-- migrations/20260204_fix_client_emails_and_policies.sql

-- Ensure client_emails table exists and has RLS policies
CREATE TABLE IF NOT EXISTS client_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES contactos(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE client_emails ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_emails' AND policyname = 'Enable read access for all users') THEN
        CREATE POLICY "Enable read access for all users" ON client_emails FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_emails' AND policyname = 'Enable insert for all users') THEN
        CREATE POLICY "Enable insert for all users" ON client_emails FOR INSERT WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_emails' AND policyname = 'Enable update for all users') THEN
        CREATE POLICY "Enable update for all users" ON client_emails FOR UPDATE USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_emails' AND policyname = 'Enable delete for all users') THEN
        CREATE POLICY "Enable delete for all users" ON client_emails FOR DELETE USING (true);
    END IF;
END $$;

-- migrations/20260204_fix_document_states.sql
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

-- migrations/schema_v6.sql (movido antes: las migraciones siguientes leen
-- las columnas enviado_email/traspasado/pagada que crea este bloque)
-- Migration v6: Boolean Status Flags

-- 1. Presupuestos
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS enviado_email BOOLEAN DEFAULT FALSE;
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS aceptado BOOLEAN DEFAULT FALSE;
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS rechazado BOOLEAN DEFAULT FALSE;

-- 2. Albaranes
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS enviado_email BOOLEAN DEFAULT FALSE;
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS traspasado BOOLEAN DEFAULT FALSE;

-- 3. Facturas
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS enviado_email BOOLEAN DEFAULT FALSE;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS pagada BOOLEAN DEFAULT FALSE;

-- 4. Update existing records based on text status (Best Effort Migration)
UPDATE presupuestos SET enviado_email = TRUE WHERE estado ILIKE '%ENVIADO%';
UPDATE presupuestos SET aceptado = TRUE WHERE estado ILIKE '%ACEPTADO%';
UPDATE presupuestos SET rechazado = TRUE WHERE estado ILIKE '%RECHAZADO%';

UPDATE albaranes SET enviado_email = TRUE WHERE estado ILIKE '%ENVIADO%';
UPDATE albaranes SET traspasado = TRUE WHERE estado ILIKE '%TRASPASADO%';

UPDATE facturas SET enviado_email = TRUE WHERE estado ILIKE '%ENVIADO%';
UPDATE facturas SET pagada = TRUE WHERE estado ILIKE '%PAGADA%';

-- migrations/20260205_fix_statuses_v2.sql
-- 1. Add statuses column if not exists
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS statuses text[] DEFAULT ARRAY['pendiente'];
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS statuses text[] DEFAULT ARRAY['pendiente'];
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS statuses text[] DEFAULT ARRAY['pendiente'];

-- 2. Create document_status table if not exists
CREATE TABLE IF NOT EXISTS document_status (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    document_type text NOT NULL, -- 'presupuesto', 'albaran', 'factura'
    document_id uuid NOT NULL,
    status text NOT NULL,
    created_at timestamptz DEFAULT now(),
    created_by text
);

-- 3. Migrate Data (Presupuestos)
-- Presupuestos uses 'estado' column.
UPDATE presupuestos
SET statuses = 
    CASE 
        WHEN lower(estado) = 'traspasado' THEN ARRAY['statuses', 'traspasado'] -- Keep logic simple, if traspasado implies pending was done
        ELSE ARRAY[lower(estado)]
    END
WHERE estado IS NOT NULL;
-- Fix array format clean up
UPDATE presupuestos SET statuses = ARRAY['pendiente'] WHERE statuses IS NULL OR array_length(statuses, 1) IS NULL;
UPDATE presupuestos SET statuses = ARRAY['traspasado'] WHERE lower(estado) = 'traspasado';
UPDATE presupuestos SET statuses = ARRAY['pendiente'] WHERE lower(estado) = 'pendiente';


-- 4. Migrate Data (Albaranes)
-- Albaranes uses 'estado_vida' and 'es_enviado'.
UPDATE albaranes
SET statuses = ARRAY['pendiente']; -- Reset

UPDATE albaranes
SET statuses = array_append(statuses, lower(estado_vida))
WHERE estado_vida IS NOT NULL AND lower(estado_vida) != 'pendiente';

UPDATE albaranes
SET statuses = array_append(statuses, 'enviado')
WHERE es_enviado = true;

-- Remove duplicates
UPDATE albaranes
SET statuses = ARRAY(SELECT DISTINCT unnest(statuses));


-- 5. Migrate Data (Facturas)
-- Facturas uses 'estado_vida' and 'es_enviado'.
UPDATE facturas
SET statuses = ARRAY['pendiente']; -- Reset

UPDATE facturas
SET statuses = array_append(statuses, lower(estado_vida))
WHERE estado_vida IS NOT NULL AND lower(estado_vida) != 'pendiente';

UPDATE facturas
SET statuses = array_remove(statuses, 'pendiente') 
WHERE lower(estado_vida) = 'pagada'; -- If paid, not pending

UPDATE facturas
SET statuses = array_append(statuses, 'enviado')
WHERE es_enviado = true;

-- Remove duplicates
UPDATE facturas
SET statuses = ARRAY(SELECT DISTINCT unnest(statuses));

-- migrations/20260205_multi_status_tables.sql
-- Migration: Multi-Status System
-- Description: Adds 'document_status' history table and 'statuses' array column to documents.

-- 1. Create document_status table for history tracking
CREATE TABLE IF NOT EXISTS document_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_type TEXT NOT NULL CHECK (document_type IN ('presupuesto', 'albaran', 'factura')),
    document_id UUID NOT NULL, 
    status TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_status_document_id ON document_status(document_id);
CREATE INDEX IF NOT EXISTS idx_document_status_type_id ON document_status(document_type, document_id);

-- 2. Add 'statuses' array column to main tables
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS statuses TEXT[] DEFAULT '{pendiente}';
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS statuses TEXT[] DEFAULT '{pendiente}';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS statuses TEXT[] DEFAULT '{pendiente}';

-- 3. Data Migration (Best Effort)

-- PRESUPUESTOS
UPDATE presupuestos 
SET statuses = ARRAY(SELECT DISTINCT unnest(
    CASE 
        WHEN estado ILIKE '%aceptado%' THEN ARRAY['pendiente', 'aceptado']::text[]
        WHEN estado ILIKE '%rechazado%' THEN ARRAY['rechazado']::text[] 
        WHEN estado ILIKE '%traspasado%' THEN ARRAY['pendiente', 'traspasado']::text[]
        -- If sent (enviado column or text)
        WHEN (COALESCE(enviado, false) OR estado ILIKE '%enviado%') THEN 
             CASE 
                WHEN estado ILIKE '%traspasado%' THEN ARRAY['pendiente', 'enviado', 'traspasado']::text[]
                ELSE ARRAY['pendiente', 'enviado']::text[]
             END
        ELSE ARRAY['pendiente']::text[]
    END
));

-- ALBARANES
UPDATE albaranes
SET statuses = ARRAY(SELECT DISTINCT unnest(
    CASE
        WHEN estado ILIKE '%traspasado%' OR estado ILIKE '%facturado%' OR traspasado IS TRUE THEN 
            CASE
                WHEN (COALESCE(enviado_email, false) OR estado ILIKE '%enviado%') THEN ARRAY['pendiente', 'enviado', 'traspasado']::text[]
                ELSE ARRAY['pendiente', 'traspasado']::text[]
            END
        WHEN (COALESCE(enviado_email, false) OR estado ILIKE '%enviado%') THEN ARRAY['pendiente', 'enviado']::text[]
        ELSE ARRAY['pendiente']::text[]
    END
));

-- FACTURAS
UPDATE facturas
SET statuses = ARRAY(SELECT DISTINCT unnest(
    CASE
        WHEN estado ILIKE '%pagad%' OR pagada IS TRUE THEN 
            CASE
                WHEN (COALESCE(enviado_email, false) OR estado ILIKE '%enviad%') THEN ARRAY['pagada', 'enviado']::text[]
                ELSE ARRAY['pagada']::text[]
            END
        WHEN (COALESCE(enviado_email, false) OR estado ILIKE '%enviad%') THEN ARRAY['pendiente', 'enviado']::text[]
        ELSE ARRAY['pendiente']::text[]
    END
));

-- migrations/20260205_cleanup_statuses.sql
-- Clean up overlapping statuses
-- Rule: If 'traspasado', remove 'pendiente'
-- Rule: If 'pagada', remove 'pendiente'

-- 1. PRESUPUESTOS
UPDATE presupuestos
SET statuses = array_remove(statuses, 'pendiente')
WHERE 'traspasado' = ANY(statuses) AND 'pendiente' = ANY(statuses);

-- 2. ALBARANES
UPDATE albaranes
SET statuses = array_remove(statuses, 'pendiente')
WHERE 'traspasado' = ANY(statuses) AND 'pendiente' = ANY(statuses);

-- 3. FACTURAS
UPDATE facturas
SET statuses = array_remove(statuses, 'pendiente')
WHERE 'pagada' = ANY(statuses) AND 'pendiente' = ANY(statuses);

-- migrations/20260305_add_referencia_pedido_to_gastos.sql
-- Migration: Add referencia_pedido column to gastos table
-- Run this in Supabase SQL editor

DO $$
BEGIN
    -- Add referencia_pedido column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'referencia_pedido'
    ) THEN
        ALTER TABLE gastos ADD COLUMN referencia_pedido TEXT;
        RAISE NOTICE 'Column referencia_pedido added to gastos table.';
    ELSE
        RAISE NOTICE 'Column referencia_pedido already exists in gastos table.';
    END IF;

    -- Also ensure numero and descripcion exist (they may have been added manually before)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'numero'
    ) THEN
        ALTER TABLE gastos ADD COLUMN numero TEXT;
        RAISE NOTICE 'Column numero added to gastos table.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'descripcion'
    ) THEN
        ALTER TABLE gastos ADD COLUMN descripcion TEXT;
        RAISE NOTICE 'Column descripcion added to gastos table.';
    END IF;
END $$;

-- migrations/fix_conflicting_statuses.sql
-- Script para limpiar estados conflictivos en documentos existentes
-- Este script asegura que los documentos solo tengan UN estado principal

-- 1. PRESUPUESTOS: Si tiene 'traspasado', eliminar 'pendiente'
UPDATE presupuestos
SET statuses = ARRAY_REMOVE(statuses, 'pendiente')
WHERE 'traspasado' = ANY(statuses) AND 'pendiente' = ANY(statuses);

-- 2. PRESUPUESTOS: Si no tiene ningún estado principal, poner 'pendiente'
UPDATE presupuestos
SET statuses = CASE
    WHEN 'enviado' = ANY(statuses) THEN ARRAY['pendiente', 'enviado']
    ELSE ARRAY['pendiente']
END
WHERE NOT ('traspasado' = ANY(statuses) OR 'pendiente' = ANY(statuses));

-- 3. ALBARANES: Si tiene 'traspasado', eliminar 'pendiente'
UPDATE albaranes
SET statuses = ARRAY_REMOVE(statuses, 'pendiente')
WHERE 'traspasado' = ANY(statuses) AND 'pendiente' = ANY(statuses);

-- 4. ALBARANES: Si no tiene ningún estado principal, poner 'pendiente'
UPDATE albaranes
SET statuses = CASE
    WHEN 'enviado' = ANY(statuses) THEN ARRAY['pendiente', 'enviado']
    ELSE ARRAY['pendiente']
END
WHERE NOT ('traspasado' = ANY(statuses) OR 'pendiente' = ANY(statuses));

-- 5. FACTURAS: Si tiene 'pagada', eliminar 'pendiente'
UPDATE facturas
SET statuses = ARRAY_REMOVE(statuses, 'pendiente')
WHERE 'pagada' = ANY(statuses) AND 'pendiente' = ANY(statuses);

-- 6. FACTURAS: Si no tiene ningún estado principal, poner 'pendiente'
UPDATE facturas
SET statuses = CASE
    WHEN 'enviado' = ANY(statuses) THEN ARRAY['pendiente', 'enviado']
    ELSE ARRAY['pendiente']
END
WHERE NOT ('pagada' = ANY(statuses) OR 'pendiente' = ANY(statuses));

-- Verificar resultados
SELECT 'Presupuestos con estados conflictivos' as tabla, COUNT(*) as count
FROM presupuestos
WHERE 'traspasado' = ANY(statuses) AND 'pendiente' = ANY(statuses)
UNION ALL
SELECT 'Albaranes con estados conflictivos', COUNT(*)
FROM albaranes
WHERE 'traspasado' = ANY(statuses) AND 'pendiente' = ANY(statuses)
UNION ALL
SELECT 'Facturas con estados conflictivos', COUNT(*)
FROM facturas
WHERE 'pagada' = ANY(statuses) AND 'pendiente' = ANY(statuses);

-- 5) Sincronización final de columnas (Empresa X) y contadores
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

-- ARREGLO PARA FACTURAS Y CONTADORES

-- 1. Añadir columna 'pagada' y 'metodo_pago' a facturas
ALTER TABLE public.facturas 
ADD COLUMN IF NOT EXISTS pagada boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS metodo_pago text;

-- 2. Crear tabla de contadores para el control de numeración (si no existe)
CREATE TABLE IF NOT EXISTS public.contadores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL, -- 'presupuesto', 'albaran', 'factura'
  anio integer NOT NULL,
  ultimo_numero integer DEFAULT 0,
  UNIQUE(tipo, anio)
);

-- Asegurar permisos para la tabla contadores
ALTER TABLE public.contadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total contadores" ON public.contadores FOR ALL USING (true);

-- 6) Buckets de Storage + políticas RLS de acceso
-- 1. Create Storage Buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('firmados', 'firmados', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('gastos', 'gastos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Storage Policies (Allow anyone to upload/read for development)
-- Gastos Bucket
DROP POLICY IF EXISTS "Allow anon upload gastos" ON storage.objects;
CREATE POLICY "Allow anon upload gastos" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'gastos');

DROP POLICY IF EXISTS "Allow anon select gastos" ON storage.objects;
CREATE POLICY "Allow anon select gastos" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'gastos');

-- Firmados Bucket
DROP POLICY IF EXISTS "Allow anon upload firmados" ON storage.objects;
CREATE POLICY "Allow anon upload firmados" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'firmados');

DROP POLICY IF EXISTS "Allow anon select firmados" ON storage.objects;
CREATE POLICY "Allow anon select firmados" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'firmados');

-- Documentos Bucket
DROP POLICY IF EXISTS "Allow anon upload documentos" ON storage.objects;
CREATE POLICY "Allow anon upload documentos" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'documentos');

DROP POLICY IF EXISTS "Allow anon select documentos" ON storage.objects;
CREATE POLICY "Allow anon select documentos" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'documentos');

-- 3. Table Policies (RLS)
-- GASTOS TABLE
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all gastos" ON gastos;
CREATE POLICY "Allow all gastos" ON gastos FOR ALL TO anon USING (true) WITH CHECK (true);

-- CONTACTOS TABLE
ALTER TABLE contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all contactos" ON contactos;
CREATE POLICY "Allow all contactos" ON contactos FOR ALL TO anon USING (true) WITH CHECK (true);

-- PRESUPUESTOS TABLE
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all presupuestos" ON presupuestos;
CREATE POLICY "Allow all presupuestos" ON presupuestos FOR ALL TO anon USING (true) WITH CHECK (true);

-- ALBARANES TABLE
ALTER TABLE albaranes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all albaranes" ON albaranes;
CREATE POLICY "Allow all albaranes" ON albaranes FOR ALL TO anon USING (true) WITH CHECK (true);

-- FACTURAS TABLE
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all facturas" ON facturas;
CREATE POLICY "Allow all facturas" ON facturas FOR ALL TO anon USING (true) WITH CHECK (true);

-- CONTADORES TABLE
ALTER TABLE contadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all contadores" ON contadores;
CREATE POLICY "Allow all contadores" ON contadores FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Fix missing columns in Gastos
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gastos' AND column_name='descripcion') THEN
        ALTER TABLE gastos ADD COLUMN descripcion text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gastos' AND column_name='importe') THEN
        ALTER TABLE gastos ADD COLUMN importe numeric DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gastos' AND column_name='proveedor') THEN
        ALTER TABLE gastos ADD COLUMN proveedor text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gastos' AND column_name='fecha') THEN
        ALTER TABLE gastos ADD COLUMN fecha timestamp with time zone DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gastos' AND column_name='numero') THEN
        ALTER TABLE gastos ADD COLUMN numero text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gastos' AND column_name='url_archivo') THEN
        ALTER TABLE gastos ADD COLUMN url_archivo text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gastos' AND column_name='referencia') THEN
        ALTER TABLE gastos ADD COLUMN referencia text;
    END IF;
END $$;

-- 7) Últimos ajustes sueltos (equivalente a fix_rls.sql del proyecto original)
ALTER TABLE public.gastos ALTER COLUMN numero DROP NOT NULL;

-- 8) Columnas y bucket descubiertos al usar la app en real (no estaban en
-- ningún script del proyecto original: se habían añadido a mano en su Supabase)
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

ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS proveedor_cif TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('albaranes-firmados', 'albaranes-firmados', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Allow anon upload albaranes-firmados" ON storage.objects;
CREATE POLICY "Allow anon upload albaranes-firmados" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'albaranes-firmados');

DROP POLICY IF EXISTS "Allow anon select albaranes-firmados" ON storage.objects;
CREATE POLICY "Allow anon select albaranes-firmados" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'albaranes-firmados');

-- 9) Historial de correos enviados (lo usa la sección "Emails")
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

-- 10) Políticas RLS que faltaban del todo (tablas con RLS activado y CERO
-- políticas, lo que bloquea cualquier acceso). precios_materiales lo lee la
-- Calculadora directamente desde el navegador con la anon key.
DROP POLICY IF EXISTS "Allow read precios_materiales" ON public.precios_materiales;
CREATE POLICY "Allow read precios_materiales" ON public.precios_materiales FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all document_status" ON public.document_status;
CREATE POLICY "Allow all document_status" ON public.document_status FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all document_embeddings" ON public.document_embeddings;
CREATE POLICY "Allow all document_embeddings" ON public.document_embeddings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all logs" ON public.logs;
CREATE POLICY "Allow all logs" ON public.logs FOR ALL USING (true) WITH CHECK (true);

SELECT 'Instalación de Empresa X completada correctamente' AS status;

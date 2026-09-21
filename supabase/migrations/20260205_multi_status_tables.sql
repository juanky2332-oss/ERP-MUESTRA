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

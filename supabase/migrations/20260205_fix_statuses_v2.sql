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

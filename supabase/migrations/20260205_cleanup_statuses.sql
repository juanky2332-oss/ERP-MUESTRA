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

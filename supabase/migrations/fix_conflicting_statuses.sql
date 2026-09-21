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

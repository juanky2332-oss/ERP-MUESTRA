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

-- SCRIPT DE EMERGENCIA: EJECUTAR EN SUPABASE SQL EDITOR
-- Este script fuerza la creación de las columnas que faltan.

-- Para Albaranes
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS base_imponible NUMERIC(10,2);
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS margen_beneficio NUMERIC(5,2);
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS iva_porcentaje NUMERIC(5,2) DEFAULT 21;

-- Para Facturas
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS base_imponible NUMERIC(10,2);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS margen_beneficio NUMERIC(5,2);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS forma_pago TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iban TEXT;

-- Verificar si se crearon (esto no devuelve nada visible pero asegura ejecución)
SELECT 'Columnas creadas correctamente' as status;

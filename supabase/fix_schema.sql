-- CORRECCIÓN DE ESQUEMA Y AMPLIACIÓN DE DATOS

-- 1. Añadir columnas faltantes a ALBARANES
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS base_imponible NUMERIC(10,2);
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS margen_beneficio NUMERIC(5,2);
ALTER TABLE albaranes ADD COLUMN IF NOT EXISTS iva_porcentaje NUMERIC(5,2) DEFAULT 21;

-- 2. Añadir columnas faltantes a FACTURAS
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS base_imponible NUMERIC(10,2);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS margen_beneficio NUMERIC(5,2); -- Aunque sea interno, se guarda por consistencia

-- 3. Ampliar lista de materiales (Insertar si no existen)
INSERT INTO precios_materiales (material, precio_por_kg) VALUES
('Acero inoxidable 316', 3.50),
('Acero F114', 1.10),
('Acero F125', 1.30),
('Acero ST-52', 0.95),
('Aluminio 7075', 4.20),
('Aluminio 5083', 3.80),
('Latón CuZn39Pb3', 6.80),
('Bronce RG7', 12.50),
('Bronce Aluminio', 14.00),
('Titanio Gr2', 35.00),
('Titanio Gr5', 45.00),
('Nylon 6', 8.50),
('Nylon 66', 9.20),
('Delrin (POM)', 8.80),
('Teflón (PTFE)', 18.00),
('PVC', 4.50),
('Metacrilato', 15.00),
('Policarbonato', 12.00),
('Peek', 120.00)
ON CONFLICT (material, tipo) DO NOTHING;

-- 4. Asegurar contadores existentes
INSERT INTO contadores (tipo, anio, ultimo_numero) VALUES
('presupuesto', 2026, 0),
('albaran', 2026, 0),
('factura', 2026, 0)
ON CONFLICT (tipo) DO NOTHING;

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

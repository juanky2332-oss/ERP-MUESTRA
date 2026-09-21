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

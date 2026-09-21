
-- Add factura_url column to gastos table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gastos' AND column_name = 'factura_url') THEN
        ALTER TABLE gastos ADD COLUMN factura_url TEXT;
    END IF;
END $$;

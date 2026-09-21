-- Migration: Add referencia_pedido column to gastos table
-- Run this in Supabase SQL editor

DO $$
BEGIN
    -- Add referencia_pedido column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'referencia_pedido'
    ) THEN
        ALTER TABLE gastos ADD COLUMN referencia_pedido TEXT;
        RAISE NOTICE 'Column referencia_pedido added to gastos table.';
    ELSE
        RAISE NOTICE 'Column referencia_pedido already exists in gastos table.';
    END IF;

    -- Also ensure numero and descripcion exist (they may have been added manually before)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'numero'
    ) THEN
        ALTER TABLE gastos ADD COLUMN numero TEXT;
        RAISE NOTICE 'Column numero added to gastos table.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'descripcion'
    ) THEN
        ALTER TABLE gastos ADD COLUMN descripcion TEXT;
        RAISE NOTICE 'Column descripcion added to gastos table.';
    END IF;
END $$;

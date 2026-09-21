-- ARREGLO PARA FACTURAS Y CONTADORES

-- 1. Añadir columna 'pagada' y 'metodo_pago' a facturas
ALTER TABLE public.facturas 
ADD COLUMN IF NOT EXISTS pagada boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS metodo_pago text;

-- 2. Crear tabla de contadores para el control de numeración (si no existe)
CREATE TABLE IF NOT EXISTS public.contadores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL, -- 'presupuesto', 'albaran', 'factura'
  anio integer NOT NULL,
  ultimo_numero integer DEFAULT 0,
  UNIQUE(tipo, anio)
);

-- Asegurar permisos para la tabla contadores
ALTER TABLE public.contadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total contadores" ON public.contadores FOR ALL USING (true);

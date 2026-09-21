-- ARREGLO DE ÚLTIMA HORA - CAMPOS DE ESTADO Y PDF

ALTER TABLE public.presupuestos 
ADD COLUMN IF NOT EXISTS enviado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pdf_url text;

ALTER TABLE public.albaranes 
ADD COLUMN IF NOT EXISTS enviado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pdf_url text;

ALTER TABLE public.facturas 
ADD COLUMN IF NOT EXISTS enviado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pdf_url text;

-- Si por alguna razón no funcionó el anterior, asegúrate de refrescar el esquema en Supabase
-- o ejecutar los comandos de renombrado anteriores si el error persiste.

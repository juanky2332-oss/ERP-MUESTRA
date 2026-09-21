-- ALINEACIÓN DE ESQUEMA EMPRESA X - DOCUMENTOS

-- 1. Añadir campos faltantes a PRESUPUESTOS
ALTER TABLE public.presupuestos 
ADD COLUMN IF NOT EXISTS cliente_telefono text,
ADD COLUMN IF NOT EXISTS cliente_email text;

-- 2. Añadir campos faltantes a ALBARANES (para consistencia futura)
ALTER TABLE public.albaranes 
ADD COLUMN IF NOT EXISTS cliente_telefono text,
ADD COLUMN IF NOT EXISTS cliente_email text;

-- 3. Añadir campos faltantes a FACTURAS (para consistencia futura)
ALTER TABLE public.facturas 
ADD COLUMN IF NOT EXISTS cliente_telefono text,
ADD COLUMN IF NOT EXISTS cliente_email text;

-- NOTA: Si ya ejecutaste el arreglo de 'contactos', no necesitas volver a hacerlo.
-- Pero si falló o no se hizo, aquí está de nuevo (es seguro ejecutarlo varias veces gracias a IF NOT EXISTS):

ALTER TABLE public.contactos 
ADD COLUMN IF NOT EXISTS codigo_postal text,
ADD COLUMN IF NOT EXISTS ciudad text,
ADD COLUMN IF NOT EXISTS provincia text,
ADD COLUMN IF NOT EXISTS persona_contacto text,
ADD COLUMN IF NOT EXISTS observaciones text;

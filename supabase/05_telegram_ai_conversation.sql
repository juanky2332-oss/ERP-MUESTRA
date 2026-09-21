-- Memoria corta de conversación por chat de Telegram, para que el asistente
-- IA pueda mantener contexto (p.ej. pedir datos que faltan antes de crear
-- un presupuesto y reconocer la confirmación del usuario en el siguiente
-- mensaje). Se guarda solo un puñado de mensajes recientes (ver route.ts).
ALTER TABLE public.telegram_links ADD COLUMN IF NOT EXISTS conversation JSONB DEFAULT '[]'::jsonb;

SELECT 'Columna conversation añadida a telegram_links' AS status;

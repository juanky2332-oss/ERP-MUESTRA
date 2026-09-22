-- Las fechas de caducidad/vinculación de Telegram eran "timestamp sin zona".
-- Al leerlas desde JavaScript en un servidor que no está en UTC se
-- interpretaban como hora local y el código de vinculación parecía caducado.
-- Se pasan a timestamptz (los valores guardados estaban en UTC).
ALTER TABLE public.telegram_links
  ALTER COLUMN code_expires_at TYPE timestamptz USING code_expires_at AT TIME ZONE 'UTC',
  ALTER COLUMN linked_at TYPE timestamptz USING linked_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

ALTER TABLE public.facturas
  ALTER COLUMN last_reminder_at TYPE timestamptz USING last_reminder_at AT TIME ZONE 'UTC';

ALTER TABLE public.notificaciones_historial
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

SELECT 'Migración 07 aplicada' AS status;

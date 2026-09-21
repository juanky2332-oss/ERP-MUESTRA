-- ============================================================
-- ERP MUESTRA — Partes de trabajo, tarifas, cobros y Telegram
-- Seguro de ejecutar varias veces (IF NOT EXISTS / ON CONFLICT).
-- ============================================================

-- 1) Técnicos (tabla de referencia simple; no requiere login propio)
CREATE TABLE IF NOT EXISTS tecnicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  telefono TEXT,
  email TEXT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2) Tarifas por cliente y tarifa por defecto de empresa
CREATE TABLE IF NOT EXISTS client_rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES contactos(id) ON DELETE CASCADE UNIQUE,
  hourly_rate NUMERIC(10,2) NOT NULL,
  travel_rate_type TEXT DEFAULT 'fixed', -- fixed | per_km | none
  travel_fixed_amount NUMERIC(10,2) DEFAULT 0,
  travel_rate_per_km NUMERIC(10,2) DEFAULT 0,
  minimum_billable_minutes INTEGER DEFAULT 60,
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_default_rates (
  id INTEGER PRIMARY KEY DEFAULT 1,
  default_hourly_rate NUMERIC(10,2) DEFAULT 35,
  default_travel_rate_type TEXT DEFAULT 'fixed',
  default_travel_fixed_amount NUMERIC(10,2) DEFAULT 15,
  default_travel_rate_per_km NUMERIC(10,2) DEFAULT 0.30,
  default_minimum_billable_minutes INTEGER DEFAULT 60,
  updated_at TIMESTAMP DEFAULT NOW(),
  CHECK (id = 1)
);
INSERT INTO company_default_rates (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 3) Partes de trabajo
CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  cliente_id UUID REFERENCES contactos(id),
  cliente_razon_social TEXT NOT NULL,
  cliente_direccion TEXT,
  cliente_telefono TEXT,
  cliente_email TEXT,
  related_quote_id UUID REFERENCES presupuestos(id),
  related_delivery_note_id UUID REFERENCES albaranes(id),
  tecnico_id UUID REFERENCES tecnicos(id),
  tecnico_nombre TEXT,
  status TEXT DEFAULT 'borrador',
  service_date DATE DEFAULT CURRENT_DATE,
  descripcion TEXT,
  diagnostico TEXT,
  resolucion TEXT,
  hours_worked_minutes INTEGER DEFAULT 0,
  hourly_rate_snapshot NUMERIC(10,2) DEFAULT 0,
  labor_amount NUMERIC(10,2) DEFAULT 0,
  travel_rate_type_snapshot TEXT,
  travel_fixed_amount_snapshot NUMERIC(10,2) DEFAULT 0,
  travel_rate_per_km_snapshot NUMERIC(10,2) DEFAULT 0,
  travel_km NUMERIC(10,2) DEFAULT 0,
  travel_amount NUMERIC(10,2) DEFAULT 0,
  materials_amount NUMERIC(10,2) DEFAULT 0,
  subtotal NUMERIC(10,2) DEFAULT 0,
  iva_porcentaje NUMERIC(5,2) DEFAULT 21,
  iva_importe NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  missing_information TEXT,
  source TEXT DEFAULT 'web',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL, -- labor | travel | material | service | adjustment
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(10,2) DEFAULT 1,
  precio_unitario NUMERIC(10,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_path TEXT,
  file_type TEXT DEFAULT 'image',
  caption TEXT,
  telegram_file_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4) Telegram (vinculación y auditoría)
CREATE TABLE IF NOT EXISTS telegram_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT UNIQUE,
  telegram_username TEXT,
  linked BOOLEAN DEFAULT FALSE,
  link_code TEXT,
  code_expires_at TIMESTAMP,
  linked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT,
  update_id BIGINT,
  direction TEXT, -- in | out
  event_type TEXT,
  payload_summary TEXT,
  status TEXT DEFAULT 'ok',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_events_update_id ON telegram_events(update_id) WHERE update_id IS NOT NULL;

-- 5) Cobros: seguimiento de recordatorios directamente sobre facturas
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

-- 6) Storage bucket para fotos/documentos de partes de trabajo
INSERT INTO storage.buckets (id, name, public) VALUES ('partes-trabajo', 'partes-trabajo', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Allow anon upload partes-trabajo" ON storage.objects;
CREATE POLICY "Allow anon upload partes-trabajo" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'partes-trabajo');
DROP POLICY IF EXISTS "Allow anon select partes-trabajo" ON storage.objects;
CREATE POLICY "Allow anon select partes-trabajo" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'partes-trabajo');

-- 7) RLS: mismo patrón que el resto del proyecto (RLS activado + política
-- abierta; la seguridad real la da el login de Supabase Auth delante de la app).
ALTER TABLE tecnicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all tecnicos" ON tecnicos;
CREATE POLICY "Allow all tecnicos" ON tecnicos FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE client_rate_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all client_rate_cards" ON client_rate_cards;
CREATE POLICY "Allow all client_rate_cards" ON client_rate_cards FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE company_default_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all company_default_rates" ON company_default_rates;
CREATE POLICY "Allow all company_default_rates" ON company_default_rates FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all work_orders" ON work_orders;
CREATE POLICY "Allow all work_orders" ON work_orders FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE work_order_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all work_order_lines" ON work_order_lines;
CREATE POLICY "Allow all work_order_lines" ON work_order_lines FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE work_order_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all work_order_attachments" ON work_order_attachments;
CREATE POLICY "Allow all work_order_attachments" ON work_order_attachments FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all telegram_links" ON telegram_links;
CREATE POLICY "Allow all telegram_links" ON telegram_links FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE telegram_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all telegram_events" ON telegram_events;
CREATE POLICY "Allow all telegram_events" ON telegram_events FOR ALL TO anon USING (true) WITH CHECK (true);

-- 8) Datos de prueba: técnicos y tarifas ficticias para poder probar el flujo
INSERT INTO tecnicos (nombre, telefono, email) VALUES
  ('Antonio Ruiz', '600 111 222', 'antonio.ruiz@empresax-demo.com'),
  ('Marta Gómez', '600 333 444', 'marta.gomez@empresax-demo.com'),
  ('Luis Fernández', '600 555 666', 'luis.fernandez@empresax-demo.com')
ON CONFLICT (nombre) DO NOTHING;

SELECT 'Migración de partes de trabajo, cobros y Telegram completada' AS status;

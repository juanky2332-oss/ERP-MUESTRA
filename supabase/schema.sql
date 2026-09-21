-- ORDEN CORREGIDO DE CREACIÓN DE TABLAS

-- 1. Tabla: contactos (Debe ir primero porque todos la referencian)
CREATE TABLE IF NOT EXISTS contactos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social TEXT NOT NULL,
  cif TEXT UNIQUE NOT NULL,
  direccion TEXT,
  codigo_postal TEXT,
  ciudad TEXT,
  provincia TEXT,
  telefono TEXT,
  telefono_alternativo TEXT,
  email TEXT,
  email_facturacion TEXT,
  persona_contacto TEXT,
  observaciones TEXT,
  total_facturado NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla: presupuestos (Referencia a contactos)
CREATE TABLE IF NOT EXISTS presupuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  fecha DATE NOT NULL,
  cliente_id UUID REFERENCES contactos(id),
  cliente_razon_social TEXT NOT NULL,
  cliente_cif TEXT,
  cliente_direccion TEXT,
  cliente_telefono TEXT,
  cliente_email TEXT,
  pedido_referencia TEXT,
  lineas JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  margen_beneficio NUMERIC(5,2),
  base_imponible NUMERIC(10,2) NOT NULL,
  iva_porcentaje NUMERIC(5,2) DEFAULT 21,
  iva_importe NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  estado TEXT DEFAULT 'borrador',
  observaciones TEXT,
  pdf_url TEXT,
  enviado BOOLEAN DEFAULT FALSE,
  fecha_envio TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla: albaranes (Referencia a presupuestos y contactos)
CREATE TABLE IF NOT EXISTS albaranes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  fecha DATE NOT NULL,
  fecha_entrega DATE,
  presupuesto_id UUID REFERENCES presupuestos(id),
  cliente_id UUID REFERENCES contactos(id),
  cliente_razon_social TEXT NOT NULL,
  cliente_cif TEXT,
  cliente_direccion TEXT,
  cliente_telefono TEXT,
  pedido_referencia TEXT,
  persona_recibe TEXT,
  lineas JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  iva_importe NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  documento_escaneado_url TEXT,
  documento_firmado_url TEXT,
  pdf_url TEXT,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Tabla: facturas (Referencia a presupuestos y contactos)
CREATE TABLE IF NOT EXISTS facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  fecha DATE NOT NULL,
  fecha_vencimiento DATE,
  albaran_ids JSONB,
  presupuesto_id UUID REFERENCES presupuestos(id),
  cliente_id UUID REFERENCES contactos(id),
  cliente_razon_social TEXT NOT NULL,
  cliente_cif TEXT,
  cliente_direccion TEXT,
  cliente_telefono TEXT,
  cliente_email TEXT,
  pedido_referencia TEXT,
  lineas JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  iva_porcentaje NUMERIC(5,2) DEFAULT 21,
  iva_importe NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  forma_pago TEXT,
  iban TEXT,
  estado TEXT DEFAULT 'emitida',
  enviada BOOLEAN DEFAULT FALSE,
  fecha_envio TIMESTAMP,
  pagada BOOLEAN DEFAULT FALSE,
  fecha_pago DATE,
  pdf_url TEXT,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Tablas independientes
CREATE TABLE IF NOT EXISTS precios_materiales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material TEXT NOT NULL,
  tipo TEXT,
  precio_por_kg NUMERIC(10,4) NOT NULL,
  moneda TEXT DEFAULT 'EUR',
  fuente TEXT,
  fecha_actualizacion TIMESTAMP DEFAULT NOW(),
  UNIQUE(material, tipo)
);

CREATE TABLE IF NOT EXISTS contadores (
  tipo TEXT PRIMARY KEY,
  anio INTEGER NOT NULL,
  ultimo_numero INTEGER NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario TEXT,
  accion TEXT,
  documento_tipo TEXT,
  documento_numero TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Datos iniciales: Precios
INSERT INTO precios_materiales (material, precio_por_kg) VALUES
('Acero inoxidable 304', 2.20),
('Acero al carbono S235', 0.80),
('Aluminio 6082', 3.10),
('Latón CuZn37', 6.50),
('Cobre Cu-ETP', 9.00)
ON CONFLICT (material, tipo) DO NOTHING;

-- Datos iniciales: Contadores
INSERT INTO contadores (tipo, anio, ultimo_numero) VALUES
('presupuesto', 2026, 0),
('albaran', 2026, 0),
('factura', 2026, 0)
ON CONFLICT (tipo) DO NOTHING;

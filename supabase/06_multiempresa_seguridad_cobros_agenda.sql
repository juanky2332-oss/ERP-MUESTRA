-- ============================================================
-- 06 — Multiempresa, roles, RLS real, cobros, agenda, proveedores,
--      catálogo, auditoría, acciones confirmables e IA.
--
-- Migración segura e idempotente: no borra tablas ni datos. Todas las
-- filas existentes se asignan a la empresa inicial.
-- ============================================================

-- ---------- 1. Empresas y perfiles ----------
CREATE TABLE IF NOT EXISTS public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  nif TEXT,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  logo_url TEXT,
  color_principal TEXT DEFAULT '#4f46e5',
  iban TEXT,
  plantilla_reclamacion_asunto TEXT DEFAULT 'Recordatorio de pago – Factura {numero_factura}',
  plantilla_reclamacion_cuerpo TEXT DEFAULT 'Hola {nombre_cliente},

Te recordamos que la factura {numero_factura}, por importe de {importe_pendiente}, tenía fecha de vencimiento el {fecha_vencimiento}.

Actualmente figura como pendiente de pago.

Te agradeceríamos que revisaras el pago a la mayor brevedad posible.

Si ya has realizado el pago, puedes ignorar este mensaje o responder con el justificante correspondiente.

Gracias,

{nombre_empresa}',
  ia_activa BOOLEAN DEFAULT TRUE,
  ia_limite_mensual INTEGER DEFAULT 1000,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.empresas (nombre, nif, email, telefono, direccion)
SELECT 'EMPRESA X, S.L.', 'B00000000', 'administracion@empresax-demo.com', '600 000 000', 'Calle Ejemplo, 1 · 30000 Ciudad Ejemplo (Murcia)'
WHERE NOT EXISTS (SELECT 1 FROM public.empresas);

CREATE TABLE IF NOT EXISTS public.perfiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT,
  email TEXT,
  rol TEXT NOT NULL DEFAULT 'propietario'
    CHECK (rol IN ('propietario','administrador','administracion','finanzas','comercial','lectura')),
  tema TEXT DEFAULT 'system',
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Todos los usuarios que ya existían pasan a ser propietarios de la empresa inicial.
INSERT INTO public.perfiles (user_id, empresa_id, email, nombre, rol)
SELECT u.id, (SELECT id FROM public.empresas ORDER BY created_at LIMIT 1), u.email, split_part(u.email, '@', 1), 'propietario'
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- ---------- 2. Funciones de seguridad ----------
-- SECURITY DEFINER para poder leer perfiles sin recursión de RLS.
CREATE OR REPLACE FUNCTION public.mi_empresa_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT empresa_id FROM public.perfiles WHERE user_id = auth.uid() AND activo
$$;

CREATE OR REPLACE FUNCTION public.mi_rol() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rol FROM public.perfiles WHERE user_id = auth.uid() AND activo
$$;

CREATE OR REPLACE FUNCTION public.es_miembro(e UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles WHERE user_id = auth.uid() AND empresa_id = e AND activo)
$$;

CREATE OR REPLACE FUNCTION public.puede_escribir(e UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles WHERE user_id = auth.uid() AND empresa_id = e AND activo AND rol <> 'lectura')
$$;

CREATE OR REPLACE FUNCTION public.puede_cobrar(e UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles WHERE user_id = auth.uid() AND empresa_id = e AND activo
                 AND rol IN ('propietario','administrador','finanzas'))
$$;

-- Empresa por defecto de una fila nueva: la del usuario que la crea. Para
-- procesos internos con service_role (sin usuario) cae en la empresa inicial.
CREATE OR REPLACE FUNCTION public.empresa_por_defecto() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT empresa_id FROM public.perfiles WHERE user_id = auth.uid() AND activo),
    (SELECT id FROM public.empresas ORDER BY created_at LIMIT 1)
  )
$$;

-- ---------- 3. empresa_id en todas las tablas de negocio + RLS ----------
DO $$
DECLARE
  t TEXT;
  p RECORD;
  tablas TEXT[] := ARRAY[
    'contactos','presupuestos','albaranes','facturas','gastos','albaranes_firmados',
    'client_emails','notificaciones_historial','document_status','document_embeddings',
    'logs','work_orders','work_order_lines','work_order_attachments','tecnicos',
    'client_rate_cards'
  ];
  primera UUID := (SELECT id FROM public.empresas ORDER BY created_at LIMIT 1);
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id)', t);
    EXECUTE format('UPDATE public.%I SET empresa_id = %L WHERE empresa_id IS NULL', t, primera);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN empresa_id SET DEFAULT public.empresa_por_defecto()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN empresa_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (empresa_id)', 'idx_' || t || '_empresa', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Fuera todas las políticas antiguas "acceso total" (anon incluido).
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('CREATE POLICY emp_select ON public.%I FOR SELECT TO authenticated USING (public.es_miembro(empresa_id))', t);
    EXECUTE format('CREATE POLICY emp_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.puede_escribir(empresa_id))', t);
    EXECUTE format('CREATE POLICY emp_update ON public.%I FOR UPDATE TO authenticated USING (public.puede_escribir(empresa_id)) WITH CHECK (public.puede_escribir(empresa_id))', t);
    EXECUTE format('CREATE POLICY emp_delete ON public.%I FOR DELETE TO authenticated USING (public.puede_escribir(empresa_id))', t);
  END LOOP;
END $$;

-- Numeración única por empresa (no global) y CIF único por empresa.
ALTER TABLE public.presupuestos DROP CONSTRAINT IF EXISTS presupuestos_numero_key;
ALTER TABLE public.albaranes DROP CONSTRAINT IF EXISTS albaranes_numero_key;
ALTER TABLE public.facturas DROP CONSTRAINT IF EXISTS facturas_numero_key;
ALTER TABLE public.contactos DROP CONSTRAINT IF EXISTS contactos_cif_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_presupuestos_empresa_numero ON public.presupuestos (empresa_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS ux_albaranes_empresa_numero ON public.albaranes (empresa_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_empresa_numero ON public.facturas (empresa_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS ux_contactos_empresa_cif ON public.contactos (empresa_id, cif);

-- Tablas globales / internas.
DO $$
DECLARE p RECORD; t TEXT;
BEGIN
  -- Solo service_role: sin políticas = nadie más entra.
  FOREACH t IN ARRAY ARRAY['telegram_links','telegram_events','contadores','company_default_rates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;

  -- Precios de materiales: tabla de referencia, solo lectura para usuarios con sesión.
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'precios_materiales' LOOP
    EXECUTE format('DROP POLICY %I ON public.precios_materiales', p.policyname);
  END LOOP;
END $$;
CREATE POLICY precios_lectura ON public.precios_materiales FOR SELECT TO authenticated USING (true);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empresas_select ON public.empresas;
DROP POLICY IF EXISTS empresas_update ON public.empresas;
CREATE POLICY empresas_select ON public.empresas FOR SELECT TO authenticated USING (public.es_miembro(id));
CREATE POLICY empresas_update ON public.empresas FOR UPDATE TO authenticated
  USING (public.es_miembro(id) AND public.mi_rol() IN ('propietario','administrador'))
  WITH CHECK (public.es_miembro(id) AND public.mi_rol() IN ('propietario','administrador'));

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perfiles_select ON public.perfiles;
DROP POLICY IF EXISTS perfiles_update_propio ON public.perfiles;
CREATE POLICY perfiles_select ON public.perfiles FOR SELECT TO authenticated USING (public.es_miembro(empresa_id));
-- Cambiar roles se hace desde el servidor (service_role) con comprobación de permisos.

-- ---------- 4. Clientes: condiciones de pago, personas y direcciones ----------
ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT,
  ADD COLUMN IF NOT EXISTS metodo_pago_alternativo TEXT,
  ADD COLUMN IF NOT EXISTS condicion_pago_tipo TEXT DEFAULT 'dias',
  ADD COLUMN IF NOT EXISTS condicion_pago_dias INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS condicion_pago_dia_mes INTEGER,
  ADD COLUMN IF NOT EXISTS condicion_pago_meses INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS condicion_pago_texto TEXT,
  ADD COLUMN IF NOT EXISTS condicion_pago_activa BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notas_internas TEXT,
  ADD COLUMN IF NOT EXISTS referencia TEXT,
  ADD COLUMN IF NOT EXISTS archivado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ultimo_contacto TIMESTAMPTZ;

ALTER TABLE public.contactos DROP CONSTRAINT IF EXISTS contactos_condicion_pago_tipo_check;
ALTER TABLE public.contactos ADD CONSTRAINT contactos_condicion_pago_tipo_check
  CHECK (condicion_pago_tipo IS NULL OR condicion_pago_tipo IN ('dias','fin_mes','dia_fijo','inmediato','manual','sin_vencimiento'));

CREATE TABLE IF NOT EXISTS public.contacto_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id),
  cliente_id UUID NOT NULL REFERENCES public.contactos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  cargo TEXT,
  email TEXT,
  telefono TEXT,
  principal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contacto_direcciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id),
  cliente_id UUID NOT NULL REFERENCES public.contactos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'envio' CHECK (tipo IN ('facturacion','envio','servicio','otra')),
  direccion TEXT NOT NULL,
  codigo_postal TEXT,
  ciudad TEXT,
  provincia TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- 5. Proveedores ----------
CREATE TABLE IF NOT EXISTS public.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id),
  razon_social TEXT NOT NULL,
  cif TEXT,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  codigo_postal TEXT,
  ciudad TEXT,
  provincia TEXT,
  persona_contacto TEXT,
  metodo_pago TEXT,
  dias_pago INTEGER,
  condiciones_pago TEXT,
  categoria_habitual TEXT,
  notas TEXT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_empresa_cif ON public.proveedores (empresa_id, cif) WHERE cif IS NOT NULL AND cif <> '';

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id),
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.contactos(id),
  ADD COLUMN IF NOT EXISTS catalogo_id UUID,
  ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS revisado BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archivo_path TEXT;

-- Proveedores a partir de los gastos que ya existían (texto libre -> ficha).
INSERT INTO public.proveedores (empresa_id, razon_social, cif)
SELECT DISTINCT ON (g.empresa_id, upper(trim(g.proveedor))) g.empresa_id, trim(g.proveedor), NULLIF(trim(g.proveedor_cif), '')
FROM public.gastos g
WHERE g.proveedor IS NOT NULL AND trim(g.proveedor) <> '' AND upper(trim(g.proveedor)) <> 'VARIOS'
  AND NOT EXISTS (SELECT 1 FROM public.proveedores p WHERE p.empresa_id = g.empresa_id AND upper(p.razon_social) = upper(trim(g.proveedor)));
UPDATE public.gastos g SET proveedor_id = p.id
FROM public.proveedores p
WHERE g.proveedor_id IS NULL AND p.empresa_id = g.empresa_id AND upper(p.razon_social) = upper(trim(g.proveedor));

-- ---------- 6. Catálogo ----------
CREATE TABLE IF NOT EXISTS public.catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id),
  tipo TEXT NOT NULL DEFAULT 'producto' CHECK (tipo IN ('producto','material','servicio','concepto')),
  nombre TEXT NOT NULL,
  referencia TEXT,
  descripcion TEXT,
  categoria TEXT,
  unidad TEXT DEFAULT 'ud',
  precio_coste NUMERIC(12,4) DEFAULT 0,
  precio_venta NUMERIC(12,4) DEFAULT 0,
  iva_porcentaje NUMERIC(5,2) DEFAULT 21,
  proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
  imagen_url TEXT,
  activo BOOLEAN DEFAULT TRUE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalogo_busqueda ON public.catalogo USING gin (to_tsvector('spanish', coalesce(nombre,'') || ' ' || coalesce(referencia,'') || ' ' || coalesce(descripcion,'')));

-- ---------- 7. Presupuestos y facturas: vencimientos, cobro y preparación fiscal ----------
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS fecha_validez DATE,
  ADD COLUMN IF NOT EXISTS condiciones TEXT;

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS serie TEXT DEFAULT 'FAC',
  ADD COLUMN IF NOT EXISTS importe_cobrado NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado_cobro TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS vencimiento_manual BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rectifica_factura_id UUID REFERENCES public.facturas(id),
  ADD COLUMN IF NOT EXISTS anulada BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT,
  -- Preparado para VeriFactu (NO se usa todavía, no se muestra).
  ADD COLUMN IF NOT EXISTS fiscal_qr TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_hash TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_estado_remision TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_id_externo TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_errores JSONB;

ALTER TABLE public.facturas DROP CONSTRAINT IF EXISTS facturas_estado_cobro_check;
ALTER TABLE public.facturas ADD CONSTRAINT facturas_estado_cobro_check CHECK (estado_cobro IN ('pendiente','parcial','pagada'));

-- Coherencia inicial con los datos existentes.
UPDATE public.facturas SET
  estado_cobro = CASE WHEN pagada OR 'pagada' = ANY(coalesce(statuses, '{}')) THEN 'pagada' ELSE 'pendiente' END,
  importe_cobrado = CASE WHEN pagada OR 'pagada' = ANY(coalesce(statuses, '{}')) THEN total ELSE 0 END
WHERE importe_cobrado IS NULL OR importe_cobrado = 0;

-- ---------- 8. Cobros (pagos de facturas) ----------
CREATE TABLE IF NOT EXISTS public.cobros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id),
  factura_id UUID NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.contactos(id),
  importe NUMERIC(12,2) NOT NULL CHECK (importe > 0),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo TEXT,
  referencia TEXT,
  nota TEXT,
  justificante_path TEXT,
  origen TEXT NOT NULL DEFAULT 'app' CHECK (origen IN ('app','telegram','ia','importacion')),
  estado TEXT NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('confirmado','propuesto','anulado')),
  usuario_id UUID,
  usuario_nombre TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobros_idempotencia ON public.cobros (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cobros_factura ON public.cobros (factura_id);

-- Los cobros ya marcados como pagados antes de esta migración quedan registrados.
INSERT INTO public.cobros (empresa_id, factura_id, cliente_id, importe, fecha, origen, nota, idempotency_key)
SELECT f.empresa_id, f.id, f.cliente_id, f.total, coalesce(f.fecha_pago, f.fecha), 'importacion', 'Marcada como pagada antes de activar el módulo de cobros', 'migracion-' || f.id
FROM public.facturas f
WHERE f.estado_cobro = 'pagada' AND f.total > 0
  AND NOT EXISTS (SELECT 1 FROM public.cobros c WHERE c.factura_id = f.id)
ON CONFLICT DO NOTHING;

-- Recalcula importe_cobrado/estado_cobro/pagada de una factura a partir de sus cobros confirmados.
CREATE OR REPLACE FUNCTION public.recalcular_cobro_factura(p_factura UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total NUMERIC; v_cobrado NUMERIC; v_estado TEXT; v_statuses TEXT[]; v_ultima DATE;
BEGIN
  SELECT total, coalesce(statuses, '{}') INTO v_total, v_statuses FROM facturas WHERE id = p_factura;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT coalesce(sum(importe), 0), max(fecha) INTO v_cobrado, v_ultima FROM cobros WHERE factura_id = p_factura AND estado = 'confirmado';
  v_estado := CASE WHEN v_cobrado >= v_total - 0.005 AND v_total > 0 THEN 'pagada'
                   WHEN v_cobrado > 0 THEN 'parcial' ELSE 'pendiente' END;
  v_statuses := array_remove(array_remove(v_statuses, 'pagada'), 'pendiente');
  v_statuses := v_statuses || (CASE WHEN v_estado = 'pagada' THEN 'pagada' ELSE 'pendiente' END);
  UPDATE facturas SET
    importe_cobrado = v_cobrado,
    estado_cobro = v_estado,
    pagada = (v_estado = 'pagada'),
    fecha_pago = CASE WHEN v_estado = 'pagada' THEN v_ultima ELSE NULL END,
    estado_vida = CASE WHEN v_estado = 'pagada' THEN 'Pagada' ELSE 'Pendiente' END,
    statuses = v_statuses,
    updated_at = now()
  WHERE id = p_factura;
END $$;

CREATE OR REPLACE FUNCTION public.trg_cobros_recalcular() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recalcular_cobro_factura(coalesce(NEW.factura_id, OLD.factura_id));
  IF TG_OP = 'UPDATE' AND NEW.factura_id IS DISTINCT FROM OLD.factura_id THEN
    PERFORM public.recalcular_cobro_factura(OLD.factura_id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS cobros_recalcular ON public.cobros;
CREATE TRIGGER cobros_recalcular AFTER INSERT OR UPDATE OR DELETE ON public.cobros
FOR EACH ROW EXECUTE FUNCTION public.trg_cobros_recalcular();

-- Si cambia el total de la factura, el estado de cobro se recalcula.
CREATE OR REPLACE FUNCTION public.trg_factura_total_cambia() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.total IS DISTINCT FROM OLD.total THEN
    PERFORM public.recalcular_cobro_factura(NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS factura_total_cambia ON public.facturas;
CREATE TRIGGER factura_total_cambia AFTER UPDATE OF total ON public.facturas
FOR EACH ROW EXECUTE FUNCTION public.trg_factura_total_cambia();

ALTER TABLE public.cobros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobros_select ON public.cobros;
DROP POLICY IF EXISTS cobros_insert ON public.cobros;
DROP POLICY IF EXISTS cobros_update ON public.cobros;
DROP POLICY IF EXISTS cobros_delete ON public.cobros;
CREATE POLICY cobros_select ON public.cobros FOR SELECT TO authenticated USING (public.es_miembro(empresa_id));
-- Confirmar cobros: solo propietario/administrador/finanzas. Otros roles solo pueden PROPONER.
CREATE POLICY cobros_insert ON public.cobros FOR INSERT TO authenticated WITH CHECK (
  public.puede_cobrar(empresa_id) OR (public.puede_escribir(empresa_id) AND estado = 'propuesto')
);
CREATE POLICY cobros_update ON public.cobros FOR UPDATE TO authenticated USING (public.puede_cobrar(empresa_id)) WITH CHECK (public.puede_cobrar(empresa_id));
CREATE POLICY cobros_delete ON public.cobros FOR DELETE TO authenticated USING (public.puede_cobrar(empresa_id));

-- ---------- 9. Auditoría ----------
CREATE TABLE IF NOT EXISTS public.auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id),
  usuario_id UUID,
  usuario_nombre TEXT,
  origen TEXT DEFAULT 'app',
  accion TEXT NOT NULL,
  entidad TEXT,
  entidad_id UUID,
  entidad_ref TEXT,
  detalle JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON public.auditoria (entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON public.auditoria (empresa_id, created_at DESC);
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auditoria_select ON public.auditoria;
DROP POLICY IF EXISTS auditoria_insert ON public.auditoria;
CREATE POLICY auditoria_select ON public.auditoria FOR SELECT TO authenticated USING (public.es_miembro(empresa_id));
CREATE POLICY auditoria_insert ON public.auditoria FOR INSERT TO authenticated WITH CHECK (public.es_miembro(empresa_id));
-- Sin UPDATE/DELETE: la auditoría no se puede reescribir.

-- ---------- 10. Historial de correos: más contexto ----------
ALTER TABLE public.notificaciones_historial
  ADD COLUMN IF NOT EXISTS canal TEXT DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS resultado TEXT DEFAULT 'enviado',
  ADD COLUMN IF NOT EXISTS usuario_id UUID,
  ADD COLUMN IF NOT EXISTS documento_id UUID,
  ADD COLUMN IF NOT EXISTS motivo TEXT;

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

-- ---------- 11. Agenda ----------
CREATE TABLE IF NOT EXISTS public.eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id),
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'cita' CHECK (tipo IN ('cita','reunion','llamada','visita','entrega','recordatorio','cobro_previsto','pago_previsto','seguimiento_presupuesto','otro')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmado','completado','cancelado','reprogramado')),
  inicio TIMESTAMPTZ NOT NULL,
  fin TIMESTAMPTZ,
  todo_el_dia BOOLEAN DEFAULT FALSE,
  cliente_id UUID REFERENCES public.contactos(id) ON DELETE SET NULL,
  proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
  factura_id UUID REFERENCES public.facturas(id) ON DELETE SET NULL,
  presupuesto_id UUID REFERENCES public.presupuestos(id) ON DELETE SET NULL,
  direccion TEXT,
  notas TEXT,
  importe NUMERIC(12,2),
  usuario_id UUID,
  creado_por UUID,
  origen TEXT DEFAULT 'app',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_inicio ON public.eventos (empresa_id, inicio);

-- ---------- 12. Acciones pendientes de confirmación (IA / Telegram) ----------
CREATE TABLE IF NOT EXISTS public.acciones_pendientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id),
  usuario_id UUID,
  tipo TEXT NOT NULL,
  resumen TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','ejecutando','confirmada','cancelada','caducada','error')),
  origen TEXT DEFAULT 'app',
  resultado JSONB,
  expira_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 minutes',
  created_at TIMESTAMPTZ DEFAULT now(),
  resuelta_at TIMESTAMPTZ
);

-- ---------- 13. Uso de IA ----------
CREATE TABLE IF NOT EXISTS public.ia_uso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id),
  usuario_id UUID,
  origen TEXT,
  accion TEXT,
  modelo TEXT,
  tokens_entrada INTEGER DEFAULT 0,
  tokens_salida INTEGER DEFAULT 0,
  coste_estimado NUMERIC(10,5) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_uso_mes ON public.ia_uso (empresa_id, created_at);

-- Aviso de cobros: se guarda qué se ha mostrado para no repetirlo en cada navegación.
CREATE TABLE IF NOT EXISTS public.avisos_mostrados (
  usuario_id UUID NOT NULL,
  empresa_id UUID NOT NULL DEFAULT public.empresa_por_defecto() REFERENCES public.empresas(id),
  clave TEXT NOT NULL,
  firma TEXT,
  mostrado_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (usuario_id, clave)
);

DO $$
DECLARE t TEXT; p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['contacto_personas','contacto_direcciones','proveedores','catalogo','eventos','acciones_pendientes','ia_uso','avisos_mostrados'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY emp_select ON public.%I FOR SELECT TO authenticated USING (public.es_miembro(empresa_id))', t);
    EXECUTE format('CREATE POLICY emp_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.es_miembro(empresa_id))', t);
    EXECUTE format('CREATE POLICY emp_update ON public.%I FOR UPDATE TO authenticated USING (public.es_miembro(empresa_id)) WITH CHECK (public.es_miembro(empresa_id))', t);
    EXECUTE format('CREATE POLICY emp_delete ON public.%I FOR DELETE TO authenticated USING (public.es_miembro(empresa_id))', t);
  END LOOP;
END $$;
-- Proveedores y catálogo: el rol de solo lectura no escribe.
DROP POLICY emp_insert ON public.proveedores; DROP POLICY emp_update ON public.proveedores; DROP POLICY emp_delete ON public.proveedores;
CREATE POLICY emp_insert ON public.proveedores FOR INSERT TO authenticated WITH CHECK (public.puede_escribir(empresa_id));
CREATE POLICY emp_update ON public.proveedores FOR UPDATE TO authenticated USING (public.puede_escribir(empresa_id)) WITH CHECK (public.puede_escribir(empresa_id));
CREATE POLICY emp_delete ON public.proveedores FOR DELETE TO authenticated USING (public.puede_escribir(empresa_id));
DROP POLICY emp_insert ON public.catalogo; DROP POLICY emp_update ON public.catalogo; DROP POLICY emp_delete ON public.catalogo;
CREATE POLICY emp_insert ON public.catalogo FOR INSERT TO authenticated WITH CHECK (public.puede_escribir(empresa_id));
CREATE POLICY emp_update ON public.catalogo FOR UPDATE TO authenticated USING (public.puede_escribir(empresa_id)) WITH CHECK (public.puede_escribir(empresa_id));
CREATE POLICY emp_delete ON public.catalogo FOR DELETE TO authenticated USING (public.puede_escribir(empresa_id));
-- Uso de IA y acciones: cada usuario solo ve/gestiona lo suyo dentro de su empresa.
DROP POLICY emp_select ON public.acciones_pendientes; DROP POLICY emp_update ON public.acciones_pendientes;
CREATE POLICY emp_select ON public.acciones_pendientes FOR SELECT TO authenticated USING (public.es_miembro(empresa_id) AND usuario_id = auth.uid());
CREATE POLICY emp_update ON public.acciones_pendientes FOR UPDATE TO authenticated USING (public.es_miembro(empresa_id) AND usuario_id = auth.uid()) WITH CHECK (public.es_miembro(empresa_id) AND usuario_id = auth.uid());
DROP POLICY emp_select ON public.avisos_mostrados; DROP POLICY emp_update ON public.avisos_mostrados; DROP POLICY emp_insert ON public.avisos_mostrados; DROP POLICY emp_delete ON public.avisos_mostrados;
CREATE POLICY propio ON public.avisos_mostrados FOR ALL TO authenticated USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid() AND public.es_miembro(empresa_id));

-- ---------- 14. Telegram multiusuario ----------
ALTER TABLE public.telegram_links
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS estado_conversacion JSONB,
  ADD COLUMN IF NOT EXISTS notificaciones JSONB DEFAULT '{"resumen_diario": true, "vencidas": true, "vencen_pronto": true, "cobros": true, "gastos_revisar": true, "presupuestos_caducan": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS sesion_access_token TEXT,
  ADD COLUMN IF NOT EXISTS sesion_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS sesion_expira_at TIMESTAMPTZ;

-- El enlace existente (una sola cuenta) pasa a pertenecer al propietario.
UPDATE public.telegram_links SET
  user_id = coalesce(user_id, (SELECT user_id FROM public.perfiles WHERE rol = 'propietario' ORDER BY created_at LIMIT 1)),
  empresa_id = coalesce(empresa_id, (SELECT id FROM public.empresas ORDER BY created_at LIMIT 1));
CREATE UNIQUE INDEX IF NOT EXISTS ux_telegram_links_chat ON public.telegram_links (chat_id) WHERE linked AND chat_id IS NOT NULL;

-- ---------- 15. Almacenamiento privado ----------
UPDATE storage.buckets SET public = false WHERE id IN ('documentos','firmados','gastos','albaranes-firmados','partes-trabajo');
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('justificantes', 'justificantes', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;
-- Cada empresa solo puede subir/leer dentro de su carpeta <empresa_id>/...
CREATE POLICY erp_archivos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('documentos','firmados','gastos','albaranes-firmados','justificantes')
         AND (storage.foldername(name))[1] = public.mi_empresa_id()::text);
CREATE POLICY erp_archivos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('documentos','firmados','gastos','albaranes-firmados','justificantes')
              AND (storage.foldername(name))[1] = public.mi_empresa_id()::text);

-- Las URLs públicas guardadas antes pasan a la ruta protegida /api/archivos/<bucket>/<ruta>.
DO $$
DECLARE pref TEXT := '%/storage/v1/object/public/%';
BEGIN
  UPDATE public.gastos SET factura_url = regexp_replace(factura_url, '^https?://[^/]+/storage/v1/object/public/', '/api/archivos/') WHERE factura_url LIKE pref;
  UPDATE public.gastos SET archivo_url = regexp_replace(archivo_url, '^https?://[^/]+/storage/v1/object/public/', '/api/archivos/') WHERE archivo_url LIKE pref;
  UPDATE public.gastos SET url_archivo = regexp_replace(url_archivo, '^https?://[^/]+/storage/v1/object/public/', '/api/archivos/') WHERE url_archivo LIKE pref;
  UPDATE public.albaranes SET documento_firmado_url = regexp_replace(documento_firmado_url, '^https?://[^/]+/storage/v1/object/public/', '/api/archivos/') WHERE documento_firmado_url LIKE pref;
  UPDATE public.albaranes SET documento_escaneado_url = regexp_replace(documento_escaneado_url, '^https?://[^/]+/storage/v1/object/public/', '/api/archivos/') WHERE documento_escaneado_url LIKE pref;
  UPDATE public.albaranes_firmados SET archivo_url = regexp_replace(archivo_url, '^https?://[^/]+/storage/v1/object/public/', '/api/archivos/') WHERE archivo_url LIKE pref;
END $$;

SELECT 'Migración 06 aplicada' AS status;

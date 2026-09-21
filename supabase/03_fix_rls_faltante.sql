-- ============================================================
-- ERP MUESTRA (Empresa X) — políticas RLS que faltaban
-- Estas 4 tablas tenían la seguridad a nivel de fila (RLS) activada
-- pero SIN ninguna política, así que bloqueaban cualquier acceso.
-- Detectado probando con la clave "anon" real (la que usa el navegador),
-- no con la clave de administrador. Pega esto en el SQL Editor y ejecútalo.
-- ============================================================

-- precios_materiales: lo lee la Calculadora directamente desde el navegador
DROP POLICY IF EXISTS "Allow read precios_materiales" ON public.precios_materiales;
CREATE POLICY "Allow read precios_materiales" ON public.precios_materiales FOR SELECT USING (true);

-- Estas tres hoy solo se usan desde el servidor (que no depende de RLS),
-- pero se dejan con la misma política abierta que el resto del esquema
-- por si en el futuro se llaman desde el navegador.
DROP POLICY IF EXISTS "Allow all document_status" ON public.document_status;
CREATE POLICY "Allow all document_status" ON public.document_status FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all document_embeddings" ON public.document_embeddings;
CREATE POLICY "Allow all document_embeddings" ON public.document_embeddings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all logs" ON public.logs;
CREATE POLICY "Allow all logs" ON public.logs FOR ALL USING (true) WITH CHECK (true);

SELECT 'Políticas RLS que faltaban, creadas correctamente' AS status;

# Pruebas del ERP

Todas las pruebas se ejecutan contra el proyecto Supabase real, crean sus propios
datos de prueba (empresa B, usuarios `*@erp-test.local`, facturas `FAC-9x-2026`)
y los borran al terminar.

Requisitos en `.env.local`: las claves de Supabase y OpenAI, más
`TEST_USER_EMAIL` (un usuario **propietario** de la empresa con el que probar).

| Comando | Qué prueba | Necesita |
|---|---|---|
| `npm test` | Calendario fiscal (plazos AEAT, inhábiles, avisos) y libros registro (orden, huecos de numeración, IVA por tipo, 303/111/115/130/347); vencimientos (30/60/90 días, día fijo, fin de mes, bisiestos, estados de cobro) y calculadora de mecanizado (pesos contra tablas de barras, tubos, pletinas, perfiles IPE; creces, medida comercial, piezas por barra, tiempos, tratamientos, ajuste de precio con el mercado) | nada |
| `npm run test:seguridad` | RLS y roles directamente contra la base de datos | nada |
| `npm run test:app` | Páginas, protección de rutas y asistente IA (envío de factura por correo con confirmación) | app arrancada en `BASE` (por defecto `http://localhost:3100`) |
| `npm run test:telegram` | Bot completo contra un Telegram simulado | app arrancada con las variables de abajo |
| `node scripts/pruebas/test_calculadora_marca.js` | Calculadora en navegador (peso, mercado, crear presupuesto) y cambio de logos con confirmación | app arrancada + Chrome |
| `npm run test:correo` | Correo libre a proveedor sin adjuntos salvo petición expresa; cálculo de peso desde el asistente | app arrancada |
| `npm run test:telegram-total` | Trabajar todo desde Telegram: informes por periodo, albaranes (facturar, PDF), presupuestos (aceptar, pasar a albarán), albarán/parte firmado por foto o PDF unido a su albarán y factura, expediente PDF, crear albarán en lenguaje natural y confirmar con «sí» | app arrancada como en `test:telegram` |
| `npm run test:firmados` | En Chrome: subir un parte firmado (la IA lo lee y propone a qué unirlo), cambiar la unión, sello FIRMADO en albaranes, expediente PDF, informes (todos los periodos, pestañas, cliente, mes concreto) y módulos opcionales | app arrancada + Chrome |
| `npm run test:logo` | Subir como logo una foto de móvil de 8 MB (antes se quedaba cargando) | app arrancada + Chrome |
| `npm run test:fiscal` | Sección Fiscal: calendario AEAT y aviso a menos de un mes (Inicio, Fiscal y Telegram, también con los avisos diarios apagados), paquete para el asesor en carpeta local (simulada con el almacenamiento privado de Chrome) y en ZIP, PDF resumen, Excel de libros registro cuadrado con la BD, foto de gasto convertida a PDF, «ya entregado» (web y Telegram), régimen autónomo/S.L. y móvil. Crea y borra sus propios datos | app arrancada como en `test:telegram` + Chrome |
| `npm run test:ui` | Interfaz en Chrome real: cobros, pagos parciales, agenda, catálogo, ficha de cliente, móvil y tema oscuro | app arrancada + Chrome (`CHROME_PATH`) |

`test:app --enviar` además confirma el envío y manda de verdad el correo al cliente de prueba.

Para `test:telegram`, arrancar la app así (el bot habla con un Telegram simulado en el puerto 3200):

```bash
npm run build
TELEGRAM_API_BASE=http://localhost:3200 TELEGRAM_BOT_TOKEN=TEST TELEGRAM_WEBHOOK_SECRET=secret-test CRON_SECRET=cron-test npx next start -p 3100
```

## Resultado de la última ejecución (22/09/2026)

- **Vencimientos:** 14/14
- **Seguridad:** 26/26 — anónimo sin acceso; empresa A y B aisladas (lectura, escritura y archivos); solo lectura no escribe; comercial solo *propone* cobros; finanzas confirma; pagos parciales y saldo; idempotencia; anular cobro recalcula; auditoría no borrable; archivos privados con URL firmada temporal.
- **App + IA (producción):** 20/20 — el caso "Mándale un correo a la empresa A adjuntando la factura fac 01" prepara el envío, muestra destinatario/asunto/texto/PDF, y con "Ok, envíalo" **se envía de verdad**; repetir la confirmación no reenvía.
- **Telegram:** 38/38 — chat no vinculado; código temporal de un solo uso; panel y botones según rol; /vencidas, /hoy, /resumen, /cliente; /pagada con método y confirmación; botón pulsado dos veces no duplica; update_id duplicado ignorado; webhook sin secreto rechazado; pago parcial; comercial → propuesta → aviso a administración → confirmación; ticket PDF → gasto con proveedor y documento privado; justificante con «pagada»; nota de voz; lenguaje natural; cron diario; desvincular.
- **Interfaz:** dashboard "Control de hoy", aviso de vencidas (una vez al día), pago parcial y "Marcar como pagada" desde la web, agenda, catálogo, vencimiento automático a 60 días en factura nueva, ficha de cliente, móvil sin scroll horizontal, tema oscuro.

## Resultados 23/09/2026 (calculadora, marca, correo libre)

- **Unitarias:** 31/31 (14 vencimientos + 17 calculadora).
- **Calculadora + marca (navegador):** peso Ø40×120 C45 = 1,184 kg; bruto con creces y medida comercial Ø45×125; cotizaciones en €/kg; estimación de ciclo; precios al mercado guardados por empresa; presupuesto borrador creado con la línea de la pieza; logos de app y documentos solo tras confirmar, auditados, visibles en menú y acceso.
- **PDF con marca:** logo proporcionado, datos, color, IBAN, texto de factura y pie legal (46 KB).
- **Correo libre:** 4/4 — sin adjuntos por defecto; con adjunto solo si se pide; peso de barra Ø50×6000 C45 = 92,48 kg.

## Resultados 23/09/2026 (firmados, informes, módulos, Telegram total)

- **Unitarias:** 35/35 (14 vencimientos + 17 calculadora + 4 informes: periodos, periodo anterior, KPI, antigüedad de deuda, IVA, conversión).
- **Telegram total:** 31/31 · **Telegram:** 38/38 · **Seguridad:** 26/26 · **App + IA:** 19/19 (4 ejecuciones seguidas) · **Interfaz:** 21/21 · **Calculadora + marca:** 18/18 · **Correo libre:** 4/4.
- **Firmados + informes + módulos (Chrome):** 33/33. Expediente de 4 páginas (índice, factura, albarán, parte firmado).
- **Logo desde foto de 8,7 MB:** 6/6 (se guarda en ~1 s como JPEG de ~90 KB / ~380 KB).
- Bugs encontrados y corregidos: «sí» con tilde no confirmaba acciones; el listado de albaranes ocultaba los albaranes firmados; búsquedas por `albaran_ids` (jsonb) no funcionaban; el buscador global enlazaba a `?search=` que ninguna pantalla leía; subir una foto como logo superaba el límite de 1 MB de las server actions y se quedaba cargando.

## Pruebas manuales recomendadas tras cada despliegue

1. Entrar, ver el aviso de vencidas y cerrarlo (no debe volver a salir hasta mañana o hasta que venza otra factura).
2. Cobros → "Marcar pagada" en una factura → comprobar historial (lápiz → "Cobros y vencimiento").
3. Cliente → pestaña Pago → poner "60 días" → crear factura → el vencimiento debe salir solo.
4. Chat de El Maikel: "Mándale a <cliente> la factura <n> por correo" → revisar → Confirmar.
5. Telegram: `/inicio`, `/vencidas`, `/pagada <n>` → Marcar pagada.
6. Calculadora: elegir material y forma, poner medidas → comprobar peso y precio; «Crear presupuesto».
7. Ajustes → Marca y documentos: subir logo (vale una foto del móvil) → revisar la vista previa → Confirmar.
9. Albaranes y partes firmados: subir la foto de un albarán firmado → comprobar que propone su albarán → Guardar y unir → en Facturas, botón «Expediente».
10. Telegram: foto de un albarán con «firmado» en el pie → elegir destino → Guardar; `/informe marzo`; «factura el albarán X» → sí.
8. Ajustes → Usuarios: crear un usuario Comercial y comprobar que no ve importes ni puede confirmar cobros.

## Resultados 30/09/2026 (proyecto Supabase nuevo, prueba completa en producción)

Base recreada desde `supabase/00…09` en el proyecto `frwzmvzuphwbuhkaofio` (organización Free). Además de las baterías,
se probó a mano por la interfaz (Chrome) creando datos de demo que se quedan: 3 clientes, 2 proveedores, 4 artículos de
catálogo, 3 presupuestos (2 aceptados → albarán → factura), 1 factura directa vencida, cobro parcial y total, 1 gasto,
1 evento, PDFs de los 8 documentos, expediente y envío real de FAC-01-2026 por correo con El Maikel.

- **Unitarias:** 35/35 · **Seguridad:** 26/26 · **App + IA:** 19/19 · **Correo libre:** 4/4 · **Interfaz:** 21/21
- **Calculadora + marca:** 18/18 · **Firmados + informes:** 33/33 · **Logo:** 6/6 · **Telegram:** 38/38 · **Telegram total:** 31/31
- Bugs encontrados y corregidos: crear una factura desde la web fallaba siempre («Fecha no válida: Tue Sep 29», la web manda
  un `Date` y se cortaba como texto); las fechas se guardaban en UTC (entre las 00:00 y las 02:00 los documentos quedaban
  con el día anterior); guardar un documento sin cliente o con una línea vacía no hacía nada y no avisaba.
- `test_firmados_informes_ui` esperaba 2,5 s fijos tras «Unir»; contra producción no daba tiempo. Ahora espera a que termine.

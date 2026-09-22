# Pruebas del ERP

Todas las pruebas se ejecutan contra el proyecto Supabase real, crean sus propios
datos de prueba (empresa B, usuarios `*@erp-test.local`, facturas `FAC-9x-2026`)
y los borran al terminar.

Requisitos en `.env.local`: las claves de Supabase y OpenAI, más
`TEST_USER_EMAIL` (un usuario **propietario** de la empresa con el que probar).

| Comando | Qué prueba | Necesita |
|---|---|---|
| `npm test` | Cálculo de vencimientos (30/60/90 días, día fijo, fin de mes, meses cortos, bisiestos, estados de cobro) | nada |
| `npm run test:seguridad` | RLS y roles directamente contra la base de datos | nada |
| `npm run test:app` | Páginas, protección de rutas y asistente IA (envío de factura por correo con confirmación) | app arrancada en `BASE` (por defecto `http://localhost:3100`) |
| `npm run test:telegram` | Bot completo contra un Telegram simulado | app arrancada con las variables de abajo |
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

## Pruebas manuales recomendadas tras cada despliegue

1. Entrar, ver el aviso de vencidas y cerrarlo (no debe volver a salir hasta mañana o hasta que venza otra factura).
2. Cobros → "Marcar pagada" en una factura → comprobar historial (lápiz → "Cobros y vencimiento").
3. Cliente → pestaña Pago → poner "60 días" → crear factura → el vencimiento debe salir solo.
4. Chat ARIA: "Mándale a <cliente> la factura <n> por correo" → revisar → Confirmar.
5. Telegram: `/inicio`, `/vencidas`, `/pagada <n>` → Marcar pagada.
6. Ajustes → Usuarios: crear un usuario Comercial y comprobar que no ve importes ni puede confirmar cobros.

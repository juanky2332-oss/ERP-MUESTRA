# Configuración del Servicio de Correo (Gmail)

Para que el envío de correos funcione (especialmente con Gmail), no puedes usar tu contraseña normal debido a las medidas de seguridad de Google. Debes seguir estos pasos para obtener una **Contraseña de Aplicación**:

## 1. Requisitos Previos en tu cuenta de Google
*   Debes tener activada la **Verificación en dos pasos** en tu cuenta de Google.
*   Si no la tienes, actívala en [Google Account Security](https://myaccount.google.com/security).

## 2. Generar Contraseña de Aplicación
1.  Ve a la sección de [Contraseñas de Aplicaciones](https://myaccount.google.com/apppasswords).
2.  Ponle un nombre a la aplicación (ej: `ERP Empresa X`).
3.  Copia el código de **16 caracteres** que te dará Google (es un código único).

## 3. Configurar las Variables de Entorno
Debes añadir (o actualizar) estas dos líneas en tu archivo `.env.local` en la raíz del proyecto:

```bash
GMAIL_USER="juanky2332@gmail.com"
GMAIL_PASS="xxxx xxxx xxxx xxxx"  # Los 16 caracteres sin espacios, generados en el paso 2
```

> [!IMPORTANT]
> **No compartas este código con nadie**. Es una llave maestra que permite a la aplicación enviar correos en tu nombre.

## 4. Probar el Envío
Una vez configurado, no necesitas reiniciar el servidor (si estás en desarrollo con `npm run dev`). Ya puedes ir a la sección de "Envío de Documentos" y probar a enviar una factura.

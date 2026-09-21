# ERP Muestra — Empresa X

![Status](https://img.shields.io/badge/Status-Demo-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Supabase](https://img.shields.io/badge/Supabase-Database-green)

Sistema de Gestión Integral (ERP) de muestra, configurado con los datos ficticios de
**Empresa X, S.L.** Es la versión de demostración de un ERP a medida, pensada para
enseñarse a clientes potenciales (vídeos, capturas, pruebas guiadas) sin exponer
ningún dato real de negocio.

> Todos los datos de empresa (razón social, NIF, dirección, email, teléfono, logo)
> son de muestra. Antes de entregarlo a un cliente real, sustitúyelos por los suyos
> en las variables de entorno (ver más abajo) — no hace falta tocar código.

## 🚀 Características Principales

### 📑 Gestión Documental
- **Presupuestos**: Creación, seguimiento y conversión automática a albaranes.
- **Albaranes**: Control de entregas, firma digital y trazabilidad.
- **Facturas**: Generación automatizada, control de vencimientos e impuestos.
- **Gastos**: Registro y categorización de gastos operativos, con OCR de facturas en PDF.

### 📊 Dashboard Financiero
- Visión global de la salud financiera en tiempo real.
- Gráficos de evolución de ingresos vs gastos.
- Indicadores clave de rendimiento (KPIs) mensuales.

### 🤖 Asistente IA (ARIA)
- Chatbot integrado para consultas rápidas sobre el estado del negocio.
- Capacidad de transcripción de voz a texto para notas rápidas.

### 📨 Comunicaciones
- Sistema de envío de correos electrónicos integrado.
- Trazabilidad de envíos y estados (Enviado, Leído, etc.).

## 🛠️ Stack Tecnológico

- **Frontend**: [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/).
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/), [Lucide React](https://lucide.dev/).
- **Backend / Database**: [Supabase](https://supabase.com/) (PostgreSQL + Auth + Storage).
- **IA**: OpenAI (asistente ARIA, OCR de gastos, transcripción de voz).

## 📦 Instalación y Despliegue

### Requisitos previos
- Node.js 18+
- Un proyecto de Supabase (gratuito) — [supabase.com](https://supabase.com)
- Una API key de OpenAI

### Configuración local

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/juanky2332-oss/ERP-MUESTRA.git
    cd ERP-MUESTRA
    ```

2.  **Instalar dependencias**:
    ```bash
    npm install
    ```

3.  **Crear el esquema en Supabase**: ejecuta `supabase/schema.sql` en el SQL Editor
    del proyecto de Supabase (crea todas las tablas: presupuestos, albaranes,
    facturas, gastos, contactos, etc., con datos de muestra de precios de material).

4.  **Configurar variables de entorno**: copia `.env.example` a `.env.local` y
    rellena las claves (ver detalle de cada una en ese mismo archivo):
    ```bash
    cp .env.example .env.local
    ```

5.  **Ejecutar servidor de desarrollo**:
    ```bash
    npm run dev
    ```

## ✉️ Envío de correos

Ver [INSTRUCCIONES_EMAIL.md](./INSTRUCCIONES_EMAIL.md) para configurar `GMAIL_USER`
y `GMAIL_PASS` (contraseña de aplicación de Google).

## 🎨 Identidad de marca

El logo, el nombre "Empresa X" y el asistente "ARIA" son un placeholder de muestra
generado para este ERP. `src/lib/company.ts` centraliza el nombre, NIF y email de
la empresa propietaria — todo lo demás (facturas, PDFs, firma de correo,
prompts de la IA) lee de ahí, así que un cliente real solo requiere cambiar esas
variables de entorno para tener el ERP con su propia identidad.

---
Demo de ERP construida por [Flownexion](https://www.flownexion.com).

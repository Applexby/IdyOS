# 🎬 IDEALO FILMS OS — Guía de Instalación y Despliegue

## ¿Qué necesitas antes de empezar?

| Cuenta | Para qué | Precio |
|--------|----------|--------|
| [GitHub](https://github.com) | Subir el código | Gratis |
| [Supabase](https://supabase.com) | Base de datos PostgreSQL | Gratis |
| [Cloudinary](https://cloudinary.com) | Almacenar PDFs | Gratis |
| [Vercel](https://vercel.com) | Publicar la app en internet | Gratis |
| [Node.js](https://nodejs.org) v18+ | Correrlo en tu PC | Gratis |

---

## PASO 1 — Configurar Supabase (Base de datos)

### 1.1 Crear proyecto
1. Entra a [supabase.com](https://supabase.com) → **New Project**
2. Ponle nombre: `idealo-films-os`
3. Elige una contraseña segura para la BD (guárdala)
4. Región: **South America (São Paulo)** — la más cercana a Perú
5. Espera ~2 minutos a que cree el proyecto

### 1.2 Crear las tablas
1. En el panel de Supabase, ve a **SQL Editor** (ícono de base de datos en el menú izquierdo)
2. Clic en **New Query**
3. Copia y pega TODO el contenido del archivo `supabase-setup.sql`
4. Clic en **Run** (botón verde)
5. Verás: `Success. No rows returned` → ¡listo!

### 1.3 Verificar datos
- Ve a **Table Editor** → deberías ver las tablas: `bancos`, `equipos`, `servicios`, `cotizaciones`
- Abre `servicios` → deberías ver los 8 servicios cargados

### 1.4 Obtener las credenciales
1. Ve a **Settings** (ícono de engranaje) → **API**
2. Copia estos dos valores:
   - **Project URL** → será tu `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → será tu `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## PASO 2 — Configurar Cloudinary (Almacenamiento de PDFs)

### 2.1 Crear cuenta
1. Entra a [cloudinary.com](https://cloudinary.com) → **Sign Up Free**
2. En el **Dashboard**, copia:
   - **Cloud Name** → `CLOUDINARY_CLOUD_NAME`
   - **API Key** → `CLOUDINARY_API_KEY`
   - **API Secret** → `CLOUDINARY_API_SECRET` (clic en el ojito para verlo)

### 2.2 Crear carpeta (opcional pero recomendado)
1. Ve a **Media Library** → **New Folder** → llámala `cotizaciones`

> ✅ No necesitas configurar nada más en Cloudinary. El código sube los PDFs automáticamente.

---

## PASO 3 — Instalar y correr en tu computadora

### 3.1 Requisitos previos
Asegúrate de tener Node.js instalado:
```bash
node --version  # Debe mostrar v18.x.x o superior
```
Si no lo tienes: descárgalo en [nodejs.org](https://nodejs.org) (versión LTS)

### 3.2 Preparar el proyecto
1. Descomprime el ZIP que descargaste
2. Abre la carpeta `idealo-films-os` en tu terminal (o en VS Code → Terminal)

```bash
# Instalar todas las dependencias
npm install
```
Esto toma 1-3 minutos la primera vez.

### 3.3 Configurar variables de entorno
1. Busca el archivo `.env.local.example` en la carpeta del proyecto
2. **Duplícalo** y renómbralo como `.env.local` (sin el `.example`)
3. Ábrelo con cualquier editor de texto y rellena los valores:

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5...
CLOUDINARY_CLOUD_NAME=mi_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=AbCdEfGhIjKlMnOpQrStUvWx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3.4 Correr en modo desarrollo
```bash
npm run dev
```
Abre tu navegador en: **http://localhost:3000**

¡Ya deberías ver el sistema funcionando! 🎉

---

## PASO 4 — Publicar en Vercel (Internet)

### 4.1 Subir código a GitHub
1. Crea una cuenta en [github.com](https://github.com) si no tienes
2. Crea un **New Repository** → `idealo-films-os` → Private
3. En tu terminal, dentro de la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Idealo Films OS v1.0"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/idealo-films-os.git
git push -u origin main
```

### 4.2 Conectar con Vercel
1. Entra a [vercel.com](https://vercel.com) → **Sign Up** con tu cuenta de GitHub
2. Clic en **Add New Project**
3. Selecciona el repositorio `idealo-films-os`
4. En **Framework Preset**: selecciona **Next.js** (lo detecta automáticamente)
5. **IMPORTANTE** — Antes de hacer Deploy, ve a **Environment Variables** y agrega las mismas variables de tu `.env.local`:

| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Tu URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tu anon key de Supabase |
| `CLOUDINARY_CLOUD_NAME` | Tu cloud name |
| `CLOUDINARY_API_KEY` | Tu API key |
| `CLOUDINARY_API_SECRET` | Tu API secret |
| `NEXT_PUBLIC_APP_URL` | Lo dejas vacío por ahora |

6. Clic en **Deploy** → espera 2-3 minutos

7. Vercel te dará una URL tipo: `https://idealo-films-os.vercel.app`
8. Copia esa URL y agrégala como variable de entorno:
   - `NEXT_PUBLIC_APP_URL` = `https://idealo-films-os.vercel.app`
   - Luego en Vercel → **Deployments** → **Redeploy**

---

## PASO 5 — Verificar que todo funciona

### Checklist de prueba:
- [ ] Entras a la URL de Vercel y ves el panel de cotizaciones
- [ ] Los servicios y equipos cargan correctamente (vienen de Supabase)
- [ ] Llenas un formulario de prueba y generas un PDF
- [ ] El PDF se abre correctamente desde Cloudinary
- [ ] En Supabase → Table Editor → `cotizaciones` aparece el registro
- [ ] En la sección **Historial** aparece la cotización generada

---

## ¿Qué necesito para complementar el sistema en el futuro?

### Funcionalidades que puedes agregar (pídelas cuando quieras):

| Módulo | Qué necesitas |
|--------|---------------|
| **Login / Autenticación** | Activar Auth en Supabase (gratis). Múltiples usuarios con contraseña |
| **Envío de PDF por email** | Cuenta en [Resend.com](https://resend.com) (gratis hasta 3,000 emails/mes) |
| **WhatsApp al cliente** | API de Twilio o Meta Business (pago) o usar link `wa.me/` con texto prearmado |
| **Gestión de clientes** | Solo añadir tabla `clientes` en Supabase (sin costo) |
| **Firma digital en PDF** | Servicio Docusign o SignNow (pago) |
| **Dashboard con métricas** | Solo código — los datos ya están en Supabase |
| **Dominio propio** | Comprar dominio en Namecheap (~$10/año) y conectarlo en Vercel |
| **Notificaciones push** | OneSignal (gratis) |
| **Modo oscuro/claro** | Solo código, sin cuentas adicionales |

### Costos actuales del sistema (mes):
- Supabase Free: **S/ 0** (hasta 500MB de BD, 2GB de storage)
- Cloudinary Free: **S/ 0** (hasta 25GB de storage, 25GB de ancho de banda)
- Vercel Free: **S/ 0** (hasta 100GB de ancho de banda, proyectos ilimitados)
- **Total: S/ 0/mes** ✅

### Cuándo necesitarías pagar:
- Supabase Pro ($25/mes): cuando superes 500MB de BD o necesites backups automáticos
- Cloudinary Paid: cuando superes 25GB de PDFs almacenados (~5,000+ PDFs)
- Vercel Pro ($20/mes): si necesitas múltiples dominios o funciones avanzadas

---

## Problemas comunes y soluciones

### "Error al cargar datos" en la app
→ Verifica que las variables de entorno en Vercel estén escritas exactamente igual que en `.env.local`

### "Cloudinary error: Invalid signature"
→ El `CLOUDINARY_API_SECRET` está mal copiado. Ve al Dashboard de Cloudinary y cópialo de nuevo.

### Los PDFs no se generan
→ Verifica en Vercel → Functions que el runtime sea `nodejs` (está configurado en el código)

### La app carga pero no muestra servicios
→ Ve a Supabase → SQL Editor y ejecuta de nuevo el archivo `supabase-setup.sql`

---

## Soporte

Para agregar nuevas funcionalidades o resolver problemas, ten a mano:
- URL de tu proyecto Supabase
- Cloud Name de Cloudinary
- URL de tu app en Vercel

¡El sistema está listo para producción! 🚀

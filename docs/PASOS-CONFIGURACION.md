# ✅ Pasos para poner en marcha el proyecto

Sigue estos pasos en orden. No saltes ninguno.

---

## PASO 1 — Instalar dependencias

Abre la terminal en la carpeta del proyecto y escribe:

```bash
npm install
```

Esto instala todo lo necesario (ahora sin Supabase).

---

## PASO 2 — Crear la integración en Notion

1. Ve a: https://www.notion.so/my-integrations
2. Clic en **"+ New integration"**
3. Nombre: `Idealo Cotizaciones`
4. Workspace: tu workspace de Idealo Films
5. En "Capabilities" marca las 3 opciones: Read, Update, Insert
6. Clic en **"Submit"**
7. Copia el **"Internal Integration Secret"** → empieza con `secret_...`

---

## PASO 3 — Agregar propiedades nuevas a tus BDs en Notion

### BD "Contactos" → agregar 2 propiedades:
| Nombre exacto | Tipo |
|---|---|
| `Tipo documento` | Text |
| `Número documento` | Text |

### BD "Servicios" → agregar 1 propiedad:
| Nombre exacto | Tipo | Opciones |
|---|---|---|
| `Categoría` | Select | Evento, Edición, Paquetes, Suscripciones |

### BD "Proyectos 2026" → agregar 6 propiedades:
| Nombre exacto | Tipo |
|---|---|
| `Servicios` | Relation → apunta a BD "Servicios" |
| `Equipos` | Relation → apunta a BD "Equipos" |
| `Total` | Number |
| `Gravado` | Number |
| `IGV` | Number |
| `Usuario` | Text |
| `cliente_nombre` | Text |
| `documento_identidad` | Text |
| `razon_social` | Text |

> La columna `COTIZACIONES` que ya tienes (URL) es donde irá el link del PDF. No la toques.

### BD "Equipos" → sin cambios
Ya está perfecta tal cual.

---

## PASO 4 — Conectar la integración a cada BD

Haz esto en las 4 bases de datos (Contactos, Servicios, Equipos, Proyectos 2026):

1. Abre la BD en Notion
2. Clic en los **3 puntos (···)** arriba a la derecha
3. Selecciona **"Connections"**
4. Busca **"Idealo Cotizaciones"** y selecciónala
5. Clic en **"Confirm"**

⚠️ Si no haces este paso, la API dará error aunque el token sea correcto.

---

## PASO 5 — Obtener los 4 Database IDs

Para cada BD, abre la BD en el navegador y copia el ID de la URL:

```
https://www.notion.so/tu-workspace/ESTE-ES-EL-ID?v=...
```

El ID tiene 32 caracteres (letras y números, puede tener guiones).

Los 4 IDs que necesitas:
- **Contactos** → para `NOTION_DB_CLIENTES`
- **Servicios** → para `NOTION_DB_SERVICIOS`
- **Equipos** → para `NOTION_DB_EQUIPOS`
- **Proyectos 2026** → para `NOTION_DB_COTIZACIONES`

---

## PASO 6 — Llenar el archivo .env.local

Abre el archivo `.env.local` en la raíz del proyecto y reemplaza los valores:

```env
NOTION_TOKEN=secret_TU_TOKEN_AQUI
NOTION_DB_CLIENTES=ID_DE_CONTACTOS
NOTION_DB_SERVICIOS=ID_DE_SERVICIOS
NOTION_DB_EQUIPOS=ID_DE_EQUIPOS
NOTION_DB_COTIZACIONES=ID_DE_PROYECTOS_2026
```

Los datos de Cloudinary ya están llenados — no los cambies.

---

## PASO 7 — Levantar el proyecto en local

```bash
npm run dev
```

Abre el navegador en: http://localhost:3000

---

## PASO 8 — Verificar que las APIs funcionan

Con el servidor corriendo, abre estas URLs en el navegador:

```
http://localhost:3000/api/notion/clientes
http://localhost:3000/api/notion/servicios
http://localhost:3000/api/notion/equipos
http://localhost:3000/api/notion/cotizaciones
```

✅ Si ves `{ "clientes": [...] }` → funcionando
❌ Si ves error 401 → el NOTION_TOKEN está mal copiado
❌ Si ves error 404 → la integración no está conectada a esa BD (Paso 4)
❌ Si ves `{ "clientes": [] }` (vacío) → falta conectar la integración o filtro TIPO

---

## ¿Qué cambió respecto a la versión anterior?

| Antes (Supabase) | Ahora (Notion) |
|---|---|
| `lib/supabase.ts` | Eliminado |
| `app/api/cotizaciones/route.ts` | Reemplazado |
| Datos en Supabase | Datos en tus BDs de Notion |
| Sin búsqueda de clientes | Búsqueda en tiempo real desde Notion |
| Modal básico de resultado | Modal completo: Ver, Copiar, Descargar, WhatsApp |
| Historial sin estado | Historial con badge de estado |

---

## Estructura de archivos nuevos

```
app/api/notion/
├── clientes/route.ts      ← buscar, crear, editar clientes
├── servicios/route.ts     ← listar servicios desde Notion
├── equipos/route.ts       ← listar equipos desde Notion
└── cotizaciones/route.ts  ← crear cotización + PDF + Cloudinary + guardar en Notion

lib/
└── notion.ts              ← helpers de configuración
```

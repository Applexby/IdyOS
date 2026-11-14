# IdyOS — Idealo Films para escritorio

Programa de escritorio (Windows `.exe`) del sistema interno de Idealo Films: **CRM, cotizaciones con PDF, caja chica, contabilidad, producción, campañas, plantillas y notas**, con usuarios y roles. Tiene la misma lógica que *SAAS Idealo Films v2* (Notion API como base de datos, PDFs subidos a Cloudinary, consulta SUNAT/RENIEC con CODART), pero ahora como programa independiente.

## Qué añade frente a la versión web

| | Web (v2) | IdyOS (.exe) |
|---|---|---|
| Dónde corre | Vercel | En cada PC (servidor local en `localhost`) |
| Caché de Notion | Vercel, se pierde | **En disco** (`%APPDATA%\IdyOS\cache`), sobrevive a cerrar y a actualizar |
| Credenciales | Variables en Vercel | **Cifradas en el PC** (Windows DPAPI), configurables desde el programa |
| Usuarios | Escritos en el código | **Configurables** desde el programa (solo admin) |
| Actualizaciones | Redeploy | **Automáticas** desde GitHub Releases: botón + búsqueda cada 6 h + aviso |
| PDFs | Pestaña del navegador | Visor dentro del programa |
| Enlaces WhatsApp / Notion | Pestaña nueva | App del sistema (WhatsApp / Notion de escritorio) |

## Estructura

```
app/, components/, lib/, types/   Interfaz y API (Next.js 14) — misma base que v2
  app/programa/                   Pantalla "Configuración" del programa (actualizaciones, caché…)
  components/desktop/             Aviso de actualización y pantalla de configuración
  lib/desktop.ts                  Puente interfaz ↔ programa (window.idyos)
cache-handler.js                  Caché de Notion persistente en disco
electron/
  main.js         Proceso principal: ventanas, menú, IPC
  server.js       Arranca el servidor local de Next.js (y lo apaga si el programa se cierra)
  config.js       Configuración cifrada (credenciales, usuarios, preferencias)
  updater.js      Actualizaciones desde GitHub Releases
  setup.html      Ventana "Conexión y usuarios"
  preload.js      API segura para la interfaz
scripts/          Preparación del servidor y empaquetado
electron-builder.yml              Instalador de Windows
.github/workflows/release.yml     Compila y publica el .exe al crear un tag vX.Y.Z
```

## Primer uso (en cada PC)

1. Descarga `IdyOS-Setup-x.y.z.exe` desde **Releases** e instálalo (no pide administrador).
2. Al abrirlo por primera vez aparece **Conexión y usuarios**: pega el token de Notion, los IDs de las BDs, las claves de Cloudinary y crea los usuarios (al menos un admin).
   - Atajo: en un PC ya configurado, *Exportar archivo…* y en el nuevo *Importar archivo…*. El archivo lleva los tokens en texto plano: compártelo por un canal privado y bórralo después.
3. *Guardar e iniciar* → inicia sesión con tu correo y contraseña.

Después, la configuración se abre desde **Configuración → Conexión y usuarios** (o menú *IdyOS*), y pide la contraseña de un administrador.

## Publicar una versión nueva

```bash
npm version 1.0.1 --no-git-tag-version
```

```bash
git commit -am "IdyOS 1.0.1"
```

```bash
git tag v1.0.1
```

```bash
git push --follow-tags
```

GitHub Actions compila el `.exe` en Windows y crea el Release. Los programas instalados lo detectan (al abrir y cada 6 h, o con *Buscar ahora*), lo descargan en segundo plano y muestran el **punto amarillo en el engranaje** + la barra *“Reiniciar y actualizar”*.

- **Beta**: usa una versión con guion (`1.1.0-beta.1`, tag `v1.1.0-beta.1`). Solo la reciben quienes activen *Recibir versiones de prueba*.
- Las notas del Release (texto que escribas en GitHub) se muestran en la pantalla de Configuración.

## Desarrollo

```bash
npm install
```

```bash
npm run desktop
```

Abre el programa usando `next dev` (recarga en caliente). Usa la misma configuración local que el programa instalado. `npm run dev` sigue sirviendo para trabajar solo en el navegador (necesita `.env.local`, ver `docs/env-web.example`, con `IDYOS_USUARIOS`).

Para probar el aviso de actualización sin publicar nada: `IDYOS_SIMULAR_ACTUALIZACION=1` al abrir el programa.

Compilar el instalador en tu PC (Windows) sin publicar:

```bash
npm run dist
```

## Repositorio público: qué hay que saber

- **Por qué público**: el actualizador descarga las versiones desde GitHub Releases. Con un repo público funciona sin credenciales. Con uno privado habría que meter un token de GitHub dentro del `.exe` (cualquiera podría extraerlo).
- **Qué NO está en el repo**: tokens de Notion/Cloudinary/CODART, contraseñas ni hashes de usuarios. Todo eso vive cifrado en cada PC. Nunca subas `.env*` ni archivos exportados de configuración.
- **Alternativa si quieres el código privado**: deja este repo privado y publica los instaladores en un segundo repo público solo de releases (p. ej. `Applexby/IdyOS-releases`): cambia `publish.repo` en `electron-builder.yml` y usa un token con permiso sobre ese repo en el workflow (`secrets.RELEASES_TOKEN`).

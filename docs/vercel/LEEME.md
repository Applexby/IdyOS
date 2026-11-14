# Ruta de configuración para IdyOS (proyecto web SAAS-Idealo-Films-v2)

IdyOS no lleva claves: las pide al sistema web en `/api/idyos/config`.
Este cambio va en el repositorio **SAAS-Idealo-Films-v2** (el que despliega Vercel):

- `app/api/idyos/config/route.ts` (nuevo)
- `lib/auth.ts`: `const USUARIOS` → `export const USUARIOS`
- `middleware.ts`: excluir `api/idyos` del login obligatorio (la ruta valida correo y contraseña por su cuenta)

Aplicar desde la carpeta del repo web:

```bash
git apply ruta/a/IdyOS/docs/vercel/idyos-config.patch
```

No requiere variables nuevas: usa las que ya están en Vercel (NOTION_*, CLOUDINARY_*, CODART_API_TOKEN, NEXTAUTH_SECRET).

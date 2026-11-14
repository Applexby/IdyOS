import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { conCache } from '@/lib/cache';
import { opcionesEquipo } from '@/lib/equipo';

export const runtime = 'nodejs';
// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const DB_PIPELINE = process.env.NOTION_DB_PIPELINE || '340f4139a8f04fc0bf85f1fe99e3af07';
const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
});

// GET — opciones del select "OS creador de la cotizacion" (quién atendió)
// Devolvemos los nombres del equipo ACTIVO (lib/equipo.ts), no los usuarios de Notion (que solo tienen
// la cuenta IDEALO EIRL). Estos son los que se guardan como "atendido por".
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  try {
    // Esquema de la BD Proyectos (opciones de selects), cacheado e invalidado al editar
    const d = await conCache(['proyectos'], 'esquema-proyectos', async () => {
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_PIPELINE}`, { headers: H() });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || 'Error Notion'); }
      return r.json();
    });
    const prop = d.properties?.['OS creador de la cotizacion'];
    // Solo el equipo activo (sin ex-colaboradores ni nombres repetidos),
    // usando la opción que ya existe en Notion para cada persona.
    const usuarios = opcionesEquipo((prop?.select?.options || []).map((o: any) => o.name));
    return NextResponse.json({ usuarios });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, usuarios: [] }, { status: 500 });
  }
}

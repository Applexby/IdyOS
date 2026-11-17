import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { trasEscribir } from '@/lib/cache';
import { textoAdjuntos } from '@/lib/adjuntos';

export const runtime = 'nodejs';

const H = () => ({
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
});

const DB_PLANTILLAS = '5c5f4601-feac-4af0-b974-8a3dfcc44771';

const CATEGORIAS = ['Bienvenida','Seguimiento','Pedido de datos','Post-cotización','Post-cierre','Paquetes','Campaña','Otro'] as const;
const CANALES    = ['WhatsApp','Correo','Cualquiera','Llamada'] as const;

// ─── POST — crear nueva plantilla ────────────────────────────────────────────
async function POST_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { nombre, categoria, canal, cuerpo, notas, activo = true, adjuntos } = body;
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  if (!cuerpo?.trim()) return NextResponse.json({ error: 'Cuerpo requerido' }, { status: 400 });

  const properties: any = {
    'Nombre':         { title: [{ type: 'text', text: { content: nombre.trim() } }] },
    'Cuerpo':         { rich_text: [{ type: 'text', text: { content: cuerpo.slice(0, 2000) } }] },
    'Activo':         { checkbox: activo },
  };
  if (categoria) properties['Categoría'] = { select: { name: categoria } };
  if (canal)     properties['Canal Sugerido'] = { select: { name: canal } };
  if (notas)     properties['Notas Internas'] = { rich_text: [{ type: 'text', text: { content: notas.slice(0, 1000) } }] };
  if (Array.isArray(adjuntos) && adjuntos.length) properties['Adjuntos'] = { rich_text: [{ type: 'text', text: { content: textoAdjuntos(adjuntos).slice(0, 2000) } }] };

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: H(),
      body: JSON.stringify({ parent: { database_id: DB_PLANTILLAS }, properties }),
    });
    if (!res.ok) {
      const e = await res.json();
      return NextResponse.json({ error: e.message || 'Error Notion' }, { status: res.status });
    }
    const page = await res.json();
    return NextResponse.json({ ok: true, id: page.id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── PATCH — editar plantilla existente ──────────────────────────────────────
async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { pageId, nombre, categoria, canal, cuerpo, notas, activo, adjuntos } = body;
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });

  const properties: any = {};
  if (nombre !== undefined)    properties['Nombre']         = { title: [{ type: 'text', text: { content: nombre.trim() } }] };
  if (cuerpo !== undefined)    properties['Cuerpo']         = { rich_text: cuerpo ? [{ type: 'text', text: { content: cuerpo.slice(0, 2000) } }] : [] };
  if (categoria !== undefined) properties['Categoría']      = categoria ? { select: { name: categoria } } : { select: null };
  if (canal !== undefined)     properties['Canal Sugerido'] = canal ? { select: { name: canal } } : { select: null };
  if (notas !== undefined)     properties['Notas Internas'] = { rich_text: notas ? [{ type: 'text', text: { content: notas.slice(0, 1000) } }] : [] };
  if (activo !== undefined)    properties['Activo']         = { checkbox: activo };
  if (Array.isArray(adjuntos)) properties['Adjuntos']       = { rich_text: adjuntos.length ? [{ type: 'text', text: { content: textoAdjuntos(adjuntos).slice(0, 2000) } }] : [] };

  if (!Object.keys(properties).length) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH', headers: H(), body: JSON.stringify({ properties }),
    });
    if (!res.ok) {
      const e = await res.json();
      return NextResponse.json({ error: e.message }, { status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Toda escritura correcta invalida la caché de lectura al instante
export const POST = trasEscribir(['plantillas'], POST_);
export const PATCH = trasEscribir(['plantillas'], PATCH_);

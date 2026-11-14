import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { trasEscribir } from '@/lib/cache';
import { listarVersiones, elegirVersion, quitarVersion } from '@/lib/cotizacionVersiones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?pageId=… → versiones de cotización del proyecto (la principal marcada)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const pageId = new URL(req.url).searchParams.get('pageId');
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });
  try {
    return NextResponse.json(await listarVersiones(pageId));
  } catch (e: any) {
    return NextResponse.json({ error: e.message, versiones: [] }, { status: 500 });
  }
}

// POST { pageId, accion: 'elegir', url } → esa versión pasa a ser la principal
// POST { pageId, accion: 'quitar', id }  → se quita de la lista (no la principal)
async function POST_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const { pageId, accion } = body || {};
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });
  try {
    if (accion === 'elegir' && body.url) {
      const r = await elegirVersion(pageId, String(body.url));
      return r.ok ? NextResponse.json({ ok: true, version: r.version }) : NextResponse.json({ error: r.error }, { status: 409 });
    }
    if (accion === 'quitar' && body.id) {
      const r = await quitarVersion(pageId, String(body.id));
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 });
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const POST = trasEscribir(['proyectos'], POST_);

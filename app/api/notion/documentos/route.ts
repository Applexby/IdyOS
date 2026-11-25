// Varios contratos y facturas por proyecto.
// El enlace "principal" sigue en las columnas CONTRATO / FACTURA (lo usan las
// demás pantallas) y TODOS los documentos quedan en "Documentos", una línea por
// documento: "tipo | nombre | enlace".
//   GET   ?pageId=…                       → { documentos: [{ tipo, nombre, url }] }
//   PATCH { pageId, agregar?, quitar? }    → { documentos }
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { trasEscribir } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const H = () => ({ Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' });
const TIPOS = ['contrato', 'factura'] as const;
type Tipo = typeof TIPOS[number];
const COLUMNA: Record<Tipo, string> = { contrato: 'CONTRATO', factura: 'FACTURA' };
interface Doc { tipo: Tipo; nombre: string; url: string }

const limpio = (t: unknown) => String(t ?? '').replace(/[|\r\n]+/g, ' ').trim();
const texto = (p: any) => (p?.rich_text || []).map((t: any) => t.plain_text || '').join('');
const trozos = (t: string) => { const o: any[] = []; for (let i = 0; i < t.length && o.length < 50; i += 2000) o.push({ type: 'text', text: { content: t.slice(i, i + 2000) } }); return o; };

function leer(props: any): Doc[] {
  const lista: Doc[] = [];
  for (const l of texto(props['Documentos']).split('\n')) {
    const [tipo, nombre, ...resto] = l.split(' | ');
    const url = resto.join(' | ').trim();
    if ((TIPOS as readonly string[]).includes(tipo?.trim()) && /^https?:\/\//.test(url)) lista.push({ tipo: tipo.trim() as Tipo, nombre: (nombre || '').trim(), url });
  }
  // El enlace principal de cada columna también cuenta (proyectos antiguos)
  for (const tipo of TIPOS) {
    const url = props[COLUMNA[tipo]]?.url;
    if (url && !lista.some(d => d.url === url)) lista.unshift({ tipo, nombre: '', url });
  }
  return lista;
}

async function pagina(pageId: string) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: H(), cache: 'no-store' });
  if (!r.ok) throw new Error('Proyecto no encontrado');
  return r.json();
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const pageId = new URL(req.url).searchParams.get('pageId');
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });
  try { return NextResponse.json({ documentos: leer((await pagina(pageId)).properties) }); }
  catch (e: any) { return NextResponse.json({ error: e.message, documentos: [] }, { status: 500 }); }
}

async function PATCH_(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { pageId, agregar, quitar } = await req.json().catch(() => ({}));
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });
  try {
    const props = (await pagina(pageId)).properties;
    let lista = leer(props);
    if (agregar && (TIPOS as readonly string[]).includes(agregar.tipo) && /^https?:\/\//.test(agregar.url || '')) {
      if (!lista.some(d => d.url === agregar.url)) lista.push({ tipo: agregar.tipo, nombre: limpio(agregar.nombre), url: String(agregar.url).trim() });
    }
    if (quitar?.url) lista = lista.filter(d => !(d.url === quitar.url && (!quitar.tipo || d.tipo === quitar.tipo)));
    const properties: any = {
      Documentos: { rich_text: trozos(lista.map(d => [d.tipo, limpio(d.nombre), d.url].join(' | ')).join('\n')) },
    };
    // La columna principal: el primer documento de su tipo (o vacía)
    for (const tipo of TIPOS) {
      const primero = lista.find(d => d.tipo === tipo)?.url || null;
      if ((props[COLUMNA[tipo]]?.url || null) !== primero) properties[COLUMNA[tipo]] = { url: primero };
    }
    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ properties }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return NextResponse.json({ error: e.message || 'Error al guardar' }, { status: r.status }); }
    return NextResponse.json({ documentos: lista });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export const PATCH = trasEscribir(['proyectos'], PATCH_);

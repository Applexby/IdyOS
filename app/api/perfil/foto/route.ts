// app/api/perfil/foto/route.ts — foto de perfil del usuario (Cloudinary)
//   GET            → { url | null } de la foto del usuario en sesión (o ?email=)
//   POST {imagen}  → sube/reemplaza la foto (data URL ya recortada en el cliente)
//   DELETE         → quita la foto
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { avatarUrl, subirAvatar, borrarAvatar } from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ¿Existe la foto? Se comprueba con un HEAD a Cloudinary y se recuerda 10 min.
const memoria = new Map<string, { url: string | null; hasta: number }>();

async function buscar(email: string) {
  const m = memoria.get(email);
  if (m && m.hasta > Date.now()) return m.url;
  const base = avatarUrl(email);
  let url: string | null = null;
  if (base) {
    try {
      const r = await fetch(base, { method: 'HEAD', cache: 'no-store' });
      if (r.ok) {
        const lm = Date.parse(r.headers.get('last-modified') || '') || Date.now();
        url = `${base}?v=${lm}`;
      }
    } catch { /* sin internet: sin foto */ }
  }
  memoria.set(email, { url, hasta: Date.now() + 10 * 60_000 });
  return url;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const email = (req.nextUrl.searchParams.get('email') || session.user.email).toLowerCase();
  return NextResponse.json({ url: await buscar(email) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { imagen } = await req.json().catch(() => ({}));
  if (typeof imagen !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(imagen)) {
    return NextResponse.json({ error: 'Imagen no válida' }, { status: 400 });
  }
  if (imagen.length > 4_000_000) return NextResponse.json({ error: 'La imagen es demasiado grande' }, { status: 413 });
  try {
    const { url, version } = await subirAvatar(email, imagen);
    const final = `${url}?v=${version}`;
    memoria.set(email, { url: final, hasta: Date.now() + 10 * 60_000 });
    return NextResponse.json({ url: final });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  try { await borrarAvatar(email); } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  memoria.set(email, { url: null, hasta: Date.now() + 10 * 60_000 });
  return NextResponse.json({ ok: true });
}

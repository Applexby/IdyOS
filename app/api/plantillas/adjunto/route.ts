// app/api/plantillas/adjunto/route.ts — sube un archivo de plantilla a Cloudinary
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { subirAdjunto } from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'El archivo pesa más de 20 MB' }, { status: 400 });
  try {
    const url = await subirAdjunto(Buffer.from(await file.arrayBuffer()), file.name || 'archivo', file.type || '');
    return NextResponse.json({ url, nombre: file.name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'No se pudo subir' }, { status: 500 });
  }
}

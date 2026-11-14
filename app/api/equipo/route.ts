// app/api/equipo/route.ts — miembros del equipo (sin contraseñas)
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { EQUIPO } from '@/lib/equipo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  let usuarios: { nombre: string; email: string; rol: string }[] = [];
  try {
    usuarios = (JSON.parse(process.env.IDYOS_USUARIOS || '[]') as any[])
      .map(u => ({ nombre: u.nombre, email: String(u.email).toLowerCase(), rol: u.rol === 'admin' ? 'admin' : 'user' }));
  } catch { /* sin lista */ }
  if (!usuarios.length) usuarios = EQUIPO.map(m => ({ nombre: m.nombre, email: m.email, rol: 'user' }));
  return NextResponse.json({ miembros: usuarios });
}

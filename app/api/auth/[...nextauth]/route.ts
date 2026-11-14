// app/api/auth/[...nextauth]/route.ts
// En Next.js 14 (App Router) un route.ts SOLO puede exportar handlers HTTP.
// La configuración (authOptions) vive en @/lib/auth para no romper el build.
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

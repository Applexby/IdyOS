// lib/auth.ts
// Configuración central de NextAuth.
//
// IMPORTANTE: authOptions vive AQUÍ y NO en app/api/auth/[...nextauth]/route.ts.
// En Next.js 14 (App Router), un archivo route.ts solo puede exportar
// handlers HTTP (GET, POST, etc.). Exportar `authOptions` desde la Route
// rompe el build de producción con:
//   Type error: "authOptions" is not a valid Route export field.
// Por eso authOptions se importa desde este módulo en la Route, en el
// middleware y en cualquier Server Component que use getServerSession.

import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

// ── USUARIOS ──
// El repositorio de IdyOS es PÚBLICO: aquí no se guardan correos ni hashes.
// Los usuarios se configuran en el programa (ventana "Conexión y usuarios",
// solo admin) y llegan al servidor local en la variable IDYOS_USUARIOS como
// JSON: [{ "nombre", "email", "hash" (bcrypt), "rol": "admin" | "user" }].
// En la web (Vercel) se puede definir la misma variable de entorno.
type Usuario = { nombre: string; email: string; hash: string; rol: 'admin' | 'user' };

function usuarios(): Usuario[] {
  try {
    const lista = JSON.parse(process.env.IDYOS_USUARIOS || '[]');
    return Array.isArray(lista) ? lista.filter(u => u?.email && u?.hash) : [];
  } catch {
    return [];
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Idealo Films',
      credentials: {
        email:    { label: 'Correo', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const usuario = usuarios().find(
          u => u.email.toLowerCase() === credentials.email.toLowerCase().trim()
        );
        if (!usuario) return null;

        const valida = await bcrypt.compare(credentials.password, usuario.hash);
        if (!valida) return null;

        return {
          id: usuario.email,
          name: usuario.nombre,
          email: usuario.email,
          role: usuario.rol === 'admin' ? 'admin' : 'user',
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = (user as any).role;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as any).role = token.role;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
};

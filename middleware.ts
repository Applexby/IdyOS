import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // Si está autenticado, dejar pasar
    return NextResponse.next();
  },
  {
    callbacks: {
      // Solo permitir acceso si hay token válido
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  }
);

// Aplicar middleware a todas las rutas excepto login, api/auth y assets
export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg|.*\\.jpg).*)',
  ],
};

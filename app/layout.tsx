import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import { SCRIPT_TEMA, GuardianTema } from '@/components/ui/Tema';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Idealo Films OS',
  description: 'Sistema Operativo de Idealo Films',
  icons: {
    icon: 'https://res.cloudinary.com/dnprz5iie/image/upload/v1774831703/Recurso_8_2x_pfwtpn.png',
    apple: 'https://res.cloudinary.com/dnprz5iie/image/upload/v1774831703/Recurso_8_2x_pfwtpn.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica el tema guardado antes de pintar (evita el parpadeo claro → oscuro) */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased`}>
        <GuardianTema />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

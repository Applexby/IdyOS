'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import Logo from '@/components/ui/Logo';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', { email, password, redirect: false, callbackUrl });
    setLoading(false);
    if (result?.error) {
      setError('Correo o contraseña incorrectos.');
    } else if (result?.ok) {
      router.push(callbackUrl);
      router.refresh();
    }
  };

  return (
    // El login es siempre oscuro (el logo es blanco), con o sin modo oscuro activado
    <div className="relative min-h-screen bg-[#0b0f17] bg-gradient-to-br from-[#0b0f17] via-[#111827] to-[#1a1608] flex items-center justify-center p-4 overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#ffc500]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#ffc500]/[0.07] rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            {/* Logo real de Idealo Films desde Cloudinary */}
            <div className="relative w-48 h-16">
              <Logo posicion="center" priority blanco />
            </div>
          </div>
          <p className="text-sm text-[#9ca3af]">OS · Sistema operativo interno</p>
        </div>

        {/* Card */}
        <div className="bg-[#111827]/90 backdrop-blur rounded-2xl shadow-2xl shadow-black/40 border border-[#1f2937] p-8">
          <h2 className="text-lg font-semibold text-[#f3f4f6] mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@idealofilms.com"
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-xl border border-[#273244] text-sm text-[#f3f4f6]
                  placeholder-[#4b5563] bg-[#0b0f17] focus:outline-none
                  focus:ring-2 focus:ring-[#ffc500]/30 focus:border-[#ffc500] transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 pr-11 rounded-xl border border-[#273244] text-sm text-[#f3f4f6]
                    placeholder-[#4b5563] bg-[#0b0f17] focus:outline-none
                    focus:ring-2 focus:ring-[#ffc500]/30 focus:border-[#ffc500] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#d1d5db] transition-colors"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-[#3b1219] border border-[#5c1d27] rounded-xl px-4 py-3">
                <p className="text-xs text-[#fda4af] font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#ffc500] hover:bg-[#e6b000] text-[#111827] font-bold
                text-sm py-3 rounded-xl transition-all shadow-lg shadow-[#ffc500]/20
                hover:shadow-[#ffc500]/30 disabled:opacity-60 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Verificando...</>
                : 'Ingresar'
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#6b7280] mt-6">
          © {new Date().getFullYear()} Idealo Films S.A.C. — Uso interno
        </p>
      </div>
    </div>
  );
}

// useSearchParams() obliga a un límite de Suspense para el prerender estático
// en Next.js 14. Sin esto el build de producción falla en /login.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0b0f17]" />}>
      <LoginForm />
    </Suspense>
  );
}

'use client';

// Inicio de sesión de IdyOS — vidrio oscuro con los colores de Idealo.
// Solo login: las cuentas las crea un administrador (no hay registro ni redes).
// En el programa de escritorio la sesión no caduca: se inicia una sola vez.

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import Semaforo from '@/components/shell/Semaforo';

const campo = `w-full bg-transparent border-0 border-b border-white/20 px-0.5 py-2.5 text-[15px] text-white
  placeholder-white/35 outline-none focus:border-[#ffc500] transition-colors`;

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const enVentana = searchParams.get('ventana') === '1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', { email, password, redirect: false, callbackUrl });
    setLoading(false);
    if (result?.error) {
      setError('Correo o contraseña incorrectos.');
    } else if (result?.ok) {
      if (enVentana && window.idyos?.loginOk) { await window.idyos.loginOk(); return; }
      router.push(callbackUrl);
      router.refresh();
    }
  };

  // Programa de escritorio: el login vive en su propia ventanita transparente
  if (enVentana) {
    return (
      <div className="h-screen p-1.5 select-none">
        {/* Fondo de la página transparente: se ve (y en Windows 11 se difumina) lo que hay detrás */}
        <style>{'html,body{background:transparent!important}'}</style>
        <div className="relative h-full rounded-[22px] overflow-hidden border border-white/15
          bg-[rgba(12,12,16,0.62)] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]">
          {/* Degradado cálido de Idealo dentro del vidrio */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -left-20 w-72 h-72 rounded-full bg-[#ffc500]/30 blur-[90px]" />
            <div className="absolute -bottom-28 -right-16 w-80 h-80 rounded-full bg-[#ff8a00]/20 blur-[100px]" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent" />
          </div>

          <div className="region-arrastre relative h-11 flex items-center px-4">
            <Semaforo sinMaximizar />
          </div>

          <div className="relative px-9 pt-4 pb-8 flex flex-col h-[calc(100%-44px)]">
            <div className="relative w-36 h-10 mb-7"><Logo posicion="left center" priority blanco /></div>
            <h1 className="text-[28px] leading-tight font-extrabold text-white">
              Luces, cámara, <span className="text-[#ffc500]">idea.</span>
            </h1>
            <p className="text-[13px] text-white/55 mt-1.5 mb-8">Entra con tu cuenta de Idealo Films.</p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1">Correo</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@idealofilms.com"
                  required autoComplete="email" autoFocus className={campo} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1">Contraseña</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password" className={`${campo} pr-9`} />
                  <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {error && <p className="text-[13px] text-[#fda4af] bg-[#f43f5e]/10 border border-[#f43f5e]/25 rounded-2xl px-4 py-2.5">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full h-12 rounded-full bg-[#ffc500] hover:bg-[#ffd23f] text-[#111827] font-bold text-[15px]
                  shadow-[0_10px_30px_-8px_rgba(255,197,0,0.55)] active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={17} className="animate-spin" /> Verificando…</> : <>Entrar <ArrowRight size={17} /></>}
              </button>
            </form>
            <p className="mt-auto text-center text-[11px] text-white/30">IdyOS · Idealo Films</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07090d] flex items-center justify-center p-6">
      {/* Fondo: luces cálidas desenfocadas (dan sentido al vidrio) */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-[#ffc500]/25 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[560px] h-[560px] rounded-full bg-[#b8890b]/25 blur-[140px]" />
        <div className="absolute -bottom-40 left-1/4 w-[480px] h-[480px] rounded-full bg-[#ff8a00]/15 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      {/* Barra de la ventana (programa de escritorio) */}
      <div className="region-arrastre absolute top-0 inset-x-0 h-10 flex items-center px-4 z-10">
        <Semaforo />
      </div>

      <div className="relative w-full max-w-[980px] grid md:grid-cols-[1.1fr_1fr] rounded-[28px] overflow-hidden
        border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">

        {/* Lado izquierdo: marca y frase */}
        <div className="relative hidden md:flex flex-col justify-between p-12 bg-black/25">
          <div className="relative w-40 h-12">
            <Logo posicion="left center" priority blanco />
          </div>
          <div>
            <h1 className="text-[44px] leading-[1.05] font-extrabold text-white tracking-tight">
              Luces, cámara,<br /><span className="text-[#ffc500]">idea.</span>
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-white/60 max-w-sm">
              Cada proyecto de Idealo empieza con una idea. Aquí la conviertes en cotización, producción y cliente feliz.
            </p>
          </div>
          <p className="text-xs text-white/35">IdyOS · Sistema interno de Idealo Films</p>
        </div>

        {/* Lado derecho: formulario */}
        <div className="relative p-10 md:p-12 bg-black/40 border-l border-white/[0.06]">
          <div className="md:hidden relative w-36 h-10 mb-8"><Logo posicion="left center" priority blanco /></div>
          <h2 className="text-[26px] font-bold text-white">Iniciar sesión</h2>
          <p className="text-sm text-white/45 mt-1 mb-9">Entra con tu cuenta de Idealo Films.</p>

          <form onSubmit={handleSubmit} className="space-y-7">
            <div>
              <label className="block text-[11px] font-medium text-white/50 mb-1">Correo</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@idealofilms.com"
                required autoComplete="email" autoFocus className={campo} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-white/50 mb-1">Contraseña</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password" className={`${campo} pr-9`} />
                <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-[13px] text-[#fda4af] bg-[#f43f5e]/10 border border-[#f43f5e]/25 rounded-2xl px-4 py-2.5">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full h-12 rounded-full bg-[#ffc500] hover:bg-[#ffd23f] text-[#111827] font-bold text-[15px]
                shadow-[0_10px_30px_-8px_rgba(255,197,0,0.55)] transition-all active:scale-[0.99]
                disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={17} className="animate-spin" /> Verificando…</> : <>Entrar <ArrowRight size={17} /></>}
            </button>
          </form>

        </div>
      </div>

      <p className="absolute bottom-4 inset-x-0 text-center text-[11px] text-white/25">
        © {new Date().getFullYear()} Idealo Films — Uso interno
      </p>
    </div>
  );
}

// useSearchParams() obliga a un límite de Suspense para el prerender estático
// en Next.js 14. Sin esto el build de producción falla en /login.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#07090d]" />}>
      <LoginForm />
    </Suspense>
  );
}

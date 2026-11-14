'use client';
// Apariencia y perfil (Configuración): foto, modo claro/oscuro y tema de color.
import { useSession } from 'next-auth/react';
import { Check, Monitor, Moon, Palette, Sun, UserCircle } from 'lucide-react';
import { ACENTOS, useTema, type Tema } from '@/components/ui/Tema';
import CambiarFoto from '@/components/perfil/CambiarFoto';

function Tarjeta({ id, titulo, icono: Icono, children }: { id?: string; titulo: string; icono: any; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
        <Icono size={15} className="text-[var(--acento)]" /> {titulo}
      </h2>
      {children}
    </section>
  );
}

const MODOS: { t: Tema; l: string; icon: any }[] = [
  { t: 'claro', l: 'Claro', icon: Sun },
  { t: 'oscuro', l: 'Oscuro', icon: Moon },
  { t: 'sistema', l: 'Como Windows', icon: Monitor },
];

export default function Apariencia() {
  const { data: session } = useSession();
  const { tema, setTema, acento, setAcento } = useTema();

  return (
    <>
      <Tarjeta titulo="Mi foto de perfil" icono={UserCircle}>
        <CambiarFoto nombre={session?.user?.name} />
        <p className="text-xs text-gray-400 mt-3">Se guarda en Cloudinary y se ve en todos tus PCs.</p>
      </Tarjeta>

      <Tarjeta id="apariencia" titulo="Apariencia" icono={Palette}>
        <p className="text-xs font-semibold text-gray-500 mb-2">Modo</p>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {MODOS.map(({ t, l, icon: Icon }) => (
            <button key={t} onClick={() => setTema(t)}
              className={`flex items-center justify-center gap-2 h-10 rounded-xl border text-[13px] font-medium transition-colors
                ${tema === t ? 'border-[var(--acento)] bg-[var(--acento-suave)] text-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              <Icon size={15} /> {l}
            </button>
          ))}
        </div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Tema de color</p>
        <div className="flex flex-wrap gap-3">
          {ACENTOS.map(a => (
            <button key={a.id} onClick={() => setAcento(a.id)} className="flex flex-col items-center gap-1.5 group">
              <span className="w-10 h-10 rounded-full grid place-items-center ring-offset-2 ring-offset-white dark:ring-offset-[#111827] transition-all"
                style={{ background: a.color, boxShadow: acento === a.id ? `0 0 0 2px ${a.color}` : undefined }}>
                {acento === a.id && <Check size={16} className="text-white drop-shadow" />}
              </span>
              <span className={`text-[11px] ${acento === a.id ? 'text-gray-900 font-semibold' : 'text-gray-400 group-hover:text-gray-600'}`}>{a.nombre}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">El tema se guarda en este PC. El PDF de las cotizaciones mantiene siempre los colores de Idealo.</p>
      </Tarjeta>
    </>
  );
}

'use client';
// Apariencia y perfil (Configuración): foto, modo claro/oscuro y tema de color.
import { Check, Monitor, Moon, Palette, Sun, MessageCircle, HelpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEscritorio } from '@/lib/desktop';
import { abrirAyuda } from '@/components/shell/Ayuda';
import { ACENTOS, useTema, type Tema } from '@/components/ui/Tema';

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

/** Ayuda: va al final de Configuración. */
export function TarjetaAyuda() {
  return (
    <Tarjeta titulo="Ayuda" icono={HelpCircle}>
        <p className="text-xs text-gray-500 mb-3">Atajos de teclado y respuestas a las dudas más comunes.</p>
        <button onClick={abrirAyuda}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300">
          <HelpCircle size={13} /> Abrir ayuda
        </button>
      </Tarjeta>
  );
}

export default function Apariencia() {
  const { tema, setTema, acento, setAcento, vidrio, setVidrio } = useTema();
  const { api } = useEscritorio();
  const [limpia, setLimpia] = useState<boolean | null>(null);
  const [temaMeta, setTemaMeta] = useState<boolean | null>(null);
  const color = ACENTOS.find(a => a.id === acento)?.color || '#ffc500';
  const datosTema = () => ({ acento: color, acentoTexto: ACENTOS.find(a => a.id === acento)?.texto || '#111827', oscuro: document.documentElement.classList.contains('dark') });
  useEffect(() => {
    if (!api?.meta) return;
    api.meta.vistaLimpia().then(v => setLimpia(!!v)).catch(() => {});
    api.meta.tema(datosTema()).then(v => setTemaMeta(!!v)).catch(() => {});
  }, [api, acento, tema]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
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
        <p className="text-xs font-semibold text-gray-500 mb-2">Estilo</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {[{ v: false, l: 'Sólido', d: 'Rápido y limpio' }, { v: true, l: 'Vidrio', d: 'Desenfoque gaussiano' }].map(o => (
            <button key={o.l} onClick={() => setVidrio(o.v)}
              className={`text-left rounded-xl border p-3 transition-colors ${vidrio === o.v ? 'border-[var(--acento)] bg-[var(--acento-suave)]' : 'border-gray-200 hover:border-gray-300'}`}>
              <span className={`block h-14 rounded-lg mb-2 overflow-hidden relative ${o.v ? 'bg-gradient-to-br from-amber-300 via-rose-300 to-violet-400' : 'bg-gray-200'}`}>
                <span className={`absolute left-1.5 top-1.5 bottom-1.5 w-8 rounded-md ${o.v ? 'bg-white/45 backdrop-blur-md border border-white/60' : 'bg-white'}`} />
                <span className={`absolute left-11 right-1.5 top-1.5 bottom-1.5 rounded-md ${o.v ? 'bg-white/65 backdrop-blur-md' : 'bg-gray-50'}`} />
              </span>
              <span className="block text-[13px] font-semibold text-gray-900">{o.l}</span>
              <span className="block text-[11.5px] text-gray-400">{o.d}</span>
            </button>
          ))}
        </div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Tema de color</p>
        <div className="flex flex-wrap gap-3">
          {ACENTOS.map(a => (
            <button key={a.id} onClick={() => setAcento(a.id)} className="flex flex-col items-center gap-1.5 group">
              <span className="w-10 h-10 rounded-full grid place-items-center ring-offset-2 ring-offset-white dark:ring-offset-[#181818] transition-all"
                style={{ background: a.color, boxShadow: acento === a.id ? `0 0 0 2px ${a.color}` : undefined }}>
                {acento === a.id && <Check size={16} className="text-white drop-shadow" />}
              </span>
              <span className={`text-[11px] ${acento === a.id ? 'text-gray-900 font-semibold' : 'text-gray-400 group-hover:text-gray-600'}`}>{a.nombre}</span>
            </button>
          ))}
        </div>
      </Tarjeta>

      {api?.meta && (
        <Tarjeta titulo="Mensajes (WhatsApp, Messenger, Instagram y TikTok)" icono={MessageCircle}>
          {[
            { v: limpia, l: 'Vista limpia', d: 'Oculta la barra superior de Facebook y el menú lateral de Instagram, y estira los chats.',
              cambiar: async () => setLimpia(!!(await api.meta!.vistaLimpia(!limpia))) },
            { v: temaMeta, l: 'Tema IdyOS', d: 'Colores, burbujas, bordes y barras de desplazamiento de IdyOS dentro de Messenger e Instagram. Experimental.',
              cambiar: async () => setTemaMeta(!!(await api.meta!.tema({ ...datosTema(), activo: !temaMeta }))) },
          ].map(o => (
            <label key={o.l} className="flex items-start gap-3 py-2 cursor-pointer">
              <button type="button" role="switch" aria-checked={!!o.v} onClick={o.cambiar}
                className={`mt-0.5 relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${o.v ? 'bg-[var(--acento)]' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${o.v ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
              <span className="flex-1">
                <span className="block text-[13px] font-medium text-gray-800">{o.l}</span>
                <span className="block text-xs text-gray-400">{o.d}</span>
              </span>
            </label>
          ))}
        </Tarjeta>
      )}

    </>
  );
}

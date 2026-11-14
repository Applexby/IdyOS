'use client';
// Equipo: quién es quién y cómo va cada persona (leads que atiende,
// seguimientos que le tocan hoy, ganados del mes y tasa de cierre).
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2, Mail, RefreshCw, Shield, Target, Clock, Trophy, Percent } from 'lucide-react';
import type { Lead } from '@/types/crm';
import { ESTADOS_ACTIVOS } from '@/types/crm';
import { mismaPersona } from '@/lib/equipo';
import { diasDesde, hoyLima, mesLima } from '@/lib/utils';
import { useAvatarDe } from '@/lib/avatarEquipo';
import Avatar from '@/components/perfil/Avatar';

interface Miembro { nombre: string; email: string; rol: string }

function Tarjeta({ m, leads, yo }: { m: Miembro; leads: Lead[]; yo: boolean }) {
  const foto = useAvatarDe(m.email);
  const mes = hoyLima().slice(0, 7);
  const suyos = leads.filter(l => mismaPersona(l.atendido_por || l.persona_contactado?.[0]?.name, m.nombre));
  const activos = suyos.filter(l => ESTADOS_ACTIVOS.includes(l.estado_lead));
  const hoy = activos.filter(l => { const d = diasDesde(l.proximo_seguimiento); return d !== null && d >= 0; }).length;
  const ganadosMes = suyos.filter(l => l.estado_lead === 'GANADO' && mesLima(l.last_edited_time) === mes).length;
  const ganados = suyos.filter(l => l.estado_lead === 'GANADO').length;
  const perdidos = suyos.filter(l => l.estado_lead === 'PERDIDO').length;
  const tasa = ganados + perdidos ? Math.round((ganados / (ganados + perdidos)) * 100) : null;
  const datos = [
    { icon: Target, l: 'Leads activos', v: activos.length },
    { icon: Clock, l: 'Seguimientos hoy', v: hoy },
    { icon: Trophy, l: 'Ganados este mes', v: ganadosMes },
    { icon: Percent, l: 'Tasa de cierre', v: tasa === null ? '—' : `${tasa}%` },
  ];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5">
      <div className="flex items-center gap-3.5">
        <Avatar url={foto} nombre={m.nombre} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-gray-900 truncate">{m.nombre}{yo && <span className="ml-2 text-[11px] font-medium text-gray-400">(tú)</span>}</p>
          <p className="text-[12.5px] text-gray-400 flex items-center gap-1 truncate"><Mail size={11} /> {m.email}</p>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${m.rol === 'admin' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
          {m.rol === 'admin' && <Shield size={10} />}{m.rol === 'admin' ? 'Admin' : 'Equipo'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        {datos.map(({ icon: Icon, l, v }) => (
          <div key={l} className="rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="text-[11px] text-gray-400 flex items-center gap-1"><Icon size={11} /> {l}</p>
            <p className="text-[18px] font-semibold text-gray-900 mt-0.5 tabular-nums">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EquipoContent() {
  const { data: session } = useSession();
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    setCargando(true);
    try {
      const [e, p] = await Promise.all([
        fetch('/api/equipo').then(r => r.json()).catch(() => ({})),
        fetch('/api/notion/pipeline?solo_activos=false').then(r => r.json()).catch(() => ({})),
      ]);
      setMiembros(e.miembros || []);
      setLeads(p.leads || []);
    } finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  const yo = (session?.user?.email || '').toLowerCase();
  const orden = useMemo(() => [...miembros].sort((a, b) => (a.email === yo ? -1 : b.email === yo ? 1 : a.nombre.localeCompare(b.nombre))), [miembros, yo]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Quién atiende qué y cómo va cada uno.</p>
        </div>
        <button onClick={cargar} className="p-2.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="Actualizar">
          {cargando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
        {orden.map(m => <Tarjeta key={m.email} m={m} leads={leads} yo={m.email === yo} />)}
      </div>
    </div>
  );
}

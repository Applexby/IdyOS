'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { formatCurrency } from '@/lib/utils';
import {
  User, Mail, Shield, FileText, Target,
  CheckCircle, TrendingUp, ExternalLink, BarChart2,
} from 'lucide-react';

interface Stats {
  cotizaciones: number;
  monto_total: number;
  leads_atendidos: number;
  leads_ganados: number;
  leads_activos: number;
  leads_perdidos: number;
  tasa_cierre: number;
}

interface Reciente {
  numero: string;
  cliente: string;
  monto: number;
  fecha: string;
}

export default function PerfilContent() {
  const { data: session } = useSession();
  const [stats, setStats]       = useState<Stats | null>(null);
  const [recientes, setRecientes] = useState<Reciente[]>([]);
  const [loading, setLoading]   = useState(true);

  const isAdmin = (session?.user as any)?.role === 'admin';

  useEffect(() => {
    fetch('/api/usuario/stats')
      .then(r => r.json())
      .then(d => {
        if (d.stats)    setStats(d.stats);
        if (d.recientes) setRecientes(d.recientes);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const iniciales = (session?.user?.name || 'U')
    .split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="p-6 space-y-6 max-w-3xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tu información y estadísticas personales</p>
      </div>

      {/* Card de perfil */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-5">
          {/* Avatar con iniciales */}
          <div className="w-16 h-16 rounded-2xl bg-[#ffc500] flex items-center justify-center flex-shrink-0 shadow-md shadow-yellow-200/50">
            <span className="text-xl font-bold text-white">{iniciales}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900">{session?.user?.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-sm text-gray-500">
                <Mail size={13} /> {session?.user?.email}
              </span>
              <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full
                ${isAdmin ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-500'}`}>
                <Shield size={11} /> {isAdmin ? 'Administrador' : 'Usuario'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-gray-50">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-3">Información de cuenta</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[11px] text-gray-400 mb-0.5">Nombre completo</p>
              <p className="text-sm font-semibold text-gray-800">{session?.user?.name || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[11px] text-gray-400 mb-0.5">Correo electrónico</p>
              <p className="text-sm font-semibold text-gray-800">{session?.user?.email || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[11px] text-gray-400 mb-0.5">Rol</p>
              <p className="text-sm font-semibold text-gray-800">{isAdmin ? 'Administrador' : 'Usuario'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[11px] text-gray-400 mb-0.5">Contraseña</p>
              <p className="text-sm text-gray-400 italic">Gestionada por el administrador</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats personales */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <BarChart2 size={15} className="text-gray-400" /> Tus estadísticas
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#ffc500] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Cotizaciones',      value: stats?.cotizaciones ?? 0,            icon: FileText,    color: 'bg-blue-50 text-blue-600' },
              { label: 'Leads atendidos',   value: stats?.leads_atendidos ?? 0,         icon: Target,      color: 'bg-indigo-50 text-indigo-600' },
              { label: 'Leads ganados',     value: stats?.leads_ganados ?? 0,           icon: CheckCircle, color: 'bg-green-50 text-green-600' },
              { label: 'Tasa de cierre',    value: `${stats?.tasa_cierre ?? 0}%`,       icon: TrendingUp,  color: 'bg-amber-50 text-amber-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${color}`}>
                  <Icon size={14} />
                </div>
                <p className="text-xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accesos directos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a href="/crm"
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-[#ffc500] transition-colors">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Target size={15} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Mis leads</p>
            <p className="text-xs text-gray-400">{stats?.leads_activos ?? 0} activos · {stats?.leads_ganados ?? 0} ganados</p>
          </div>
          <ExternalLink size={13} className="ml-auto text-gray-300" />
        </a>
        <a href="/historial"
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-[#ffc500] transition-colors">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <FileText size={15} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Mis cotizaciones</p>
            <p className="text-xs text-gray-400">{stats?.cotizaciones ?? 0} generadas · {formatCurrency(stats?.monto_total ?? 0)}</p>
          </div>
          <ExternalLink size={13} className="ml-auto text-gray-300" />
        </a>
      </div>

    </div>
  );
}

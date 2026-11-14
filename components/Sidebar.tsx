'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  LayoutDashboard, FileText, History,
  LogOut, Users, Package, Briefcase, ChevronDown,
  User, Menu, X, Target, Megaphone, MessageSquare,
  Settings, TrendingUp, Clapperboard, ShieldCheck, DollarSign, StickyNote, Wallet,
} from 'lucide-react';
import { useState } from 'react';
import Logo from '@/components/ui/Logo';
import { SelectorTema } from '@/components/ui/Tema';
import { useEscritorio } from '@/lib/desktop';

// ─── Secciones del nav ────────────────────────────────────────────────────────
const sections = [
  {
    label: 'PRINCIPAL',
    items: [
      { href: '/dashboard', label: 'Dashboard',   icon: LayoutDashboard },
      { href: '/notas',     label: 'Notes Keep',  icon: StickyNote },
      { href: '/clientes',  label: 'Clientes',    icon: Users },
      { href: '/equipos',   label: 'Equipos',     icon: Package },
      { href: '/servicios', label: 'Servicios',   icon: Briefcase },
    ],
  },
  {
    label: 'VENTAS',
    items: [
      { href: '/crm',        label: 'CRM',                     icon: Target },
      { href: '/cotizar',    label: 'Realizar Cotización',     icon: FileText },
      { href: '/historial',  label: 'Cotizaciones realizadas', icon: History },
      { href: '/campanas',   label: 'Campañas',                icon: Megaphone },
      { href: '/plantillas', label: 'Plantillas',              icon: MessageSquare },
    ],
  },
  {
    label: 'OPERACIONES',
    items: [
      { href: '/produccion',    label: 'Producción',   icon: Clapperboard },
      { href: '/contabilidad',  label: 'Contabilidad', icon: DollarSign },
      { href: '/caja',          label: 'Caja Chica',   icon: Wallet },
    ],
  },
  {
    label: 'ADMINISTRADOR',
    adminOnly: true,
    items: [
      { href: '/ajustes', label: 'Ajustes', icon: ShieldCheck, adminOnly: true },
    ],
  },
];

// ─── Contenido del nav ────────────────────────────────────────────────────────
function NavContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [showUser, setShowUser] = useState(false);
  const { escritorio, info, aviso } = useEscritorio();

  const isAdmin = (session?.user as any)?.role === 'admin';
  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === '/' || pathname === '/dashboard'
      : pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full bg-gray-50/80">

      {/* Logo Idealo */}
      <div className="px-3 pt-4 pb-3">
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.04)] px-4 py-3">
          <div className="relative w-28 h-8">
            <Logo posicion="left center" priority unoptimized />
          </div>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 lg:hidden flex-shrink-0">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Nav con secciones */}
      <nav className="flex-1 px-3 py-1 overflow-y-auto space-y-5">
        {sections.map((section) => {
          if (section.adminOnly && !isAdmin) return null;
          return (
            <div key={section.label}>
              <p className="px-2.5 mb-1.5 text-[10px] font-semibold text-gray-400 tracking-widest uppercase">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  if ((item as any).adminOnly && !isAdmin) return null;
                  const { href, label, icon: Icon } = item;
                  const active = isActive(href);
                  return (
                    <Link key={href} href={href} onClick={onClose}>
                      <div className={`flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all cursor-pointer
                        ${active
                          ? 'bg-white shadow-[0_1px_3px_rgba(16,24,40,0.08)] text-gray-900'
                          : 'text-gray-500 hover:bg-white/60 hover:text-gray-800'}`}>
                        <Icon size={16} className={active ? 'text-[#ffc500]' : 'text-gray-400'} />
                        <span className={`text-[13px] flex-1 ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Usuario al fondo */}
      <div className="px-3 pb-3 pt-2 space-y-1">
        {escritorio && (
          <Link href="/programa" onClick={onClose}
            title={aviso ? 'Hay una actualización de IdyOS' : 'Configuración del programa'}>
            <div className={`flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all cursor-pointer
              ${isActive('/programa')
                ? 'bg-white shadow-[0_1px_3px_rgba(16,24,40,0.08)] text-gray-900'
                : 'text-gray-500 hover:bg-white/60 hover:text-gray-800'}`}>
              <span className="relative flex-shrink-0">
                <Settings size={16} className={isActive('/programa') ? 'text-[#ffc500]' : 'text-gray-400'} />
                {aviso && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#ffc500] ring-2 ring-gray-50 animate-pulse" />
                )}
              </span>
              <span className="text-[13px] flex-1 font-medium">Configuración</span>
              {aviso && <span className="text-[10px] font-semibold text-[#b8890b]">Actualizar</span>}
            </div>
          </Link>
        )}
        <button
          onClick={() => setShowUser(!showUser)}
          className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-2xl bg-white border border-gray-100 hover:border-gray-200 transition-all text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div className="w-8 h-8 rounded-full bg-[#ffc500]/15 flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-[#b8890b]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate">{session?.user?.name || 'Usuario'}</p>
            <p className="text-[10px] text-gray-400 truncate">{session?.user?.email}</p>
            <p className="text-[9px] text-gray-300 truncate">{escritorio ? `IdyOS v${info?.version ?? ''}` : 'OS idealo films v14'}</p>
          </div>
          <ChevronDown size={12} className={`text-gray-400 transition-transform flex-shrink-0 ${showUser ? 'rotate-180' : ''}`} />
        </button>

        {showUser && (
          <div className="bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
            <Link href="/perfil" onClick={() => setShowUser(false)}>
              <div className="flex items-center gap-2.5 px-4 py-3 text-xs text-gray-600 hover:bg-gray-50 transition-colors font-medium">
                <User size={13} /> Mi perfil
              </div>
            </Link>
            <div className="h-px bg-gray-100" />
            <SelectorTema />
            <div className="h-px bg-gray-100" />
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-xs text-red-500 hover:bg-red-50 transition-colors font-semibold"
            >
              <LogOut size={13} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex w-60 h-screen sticky top-0 bg-gray-50/80 border-r border-gray-100 flex-col flex-shrink-0">
        <NavContent />
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button onClick={() => setMobileOpen(true)} className="text-gray-600 hover:text-gray-900">
          <Menu size={22} />
        </button>
        <div className="relative w-28 h-7">
          <Logo posicion="left center" />
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-white h-full shadow-2xl flex flex-col">
            <NavContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}

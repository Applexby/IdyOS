// Secciones del menú de IdyOS (barra lateral y búsqueda rápida).
import {
  LayoutDashboard, FileText, History, Users, Package, Briefcase, Target, Megaphone,
  MessageSquare, Clapperboard, ShieldCheck, DollarSign, StickyNote, Wallet,
} from 'lucide-react';

export interface ItemNav { href: string; label: string; icon: any; adminOnly?: boolean; claves?: string }
export interface SeccionNav { label: string; adminOnly?: boolean; items: ItemNav[] }

export const SECCIONES: SeccionNav[] = [
  {
    label: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, claves: 'inicio resumen' },
      { href: '/notas', label: 'Notas', icon: StickyNote, claves: 'notes keep' },
      { href: '/clientes', label: 'Clientes', icon: Users, claves: 'contactos empresas' },
      { href: '/equipos', label: 'Equipos', icon: Package },
      { href: '/servicios', label: 'Servicios', icon: Briefcase },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { href: '/crm', label: 'CRM', icon: Target, claves: 'leads pipeline seguimiento' },
      { href: '/cotizar', label: 'Nueva cotización', icon: FileText, claves: 'realizar cotizar pdf' },
      { href: '/historial', label: 'Cotizaciones', icon: History, claves: 'historial realizadas' },
      { href: '/campanas', label: 'Campañas', icon: Megaphone },
      { href: '/plantillas', label: 'Plantillas', icon: MessageSquare, claves: 'mensajes whatsapp' },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { href: '/produccion', label: 'Producción', icon: Clapperboard },
      { href: '/contabilidad', label: 'Contabilidad', icon: DollarSign, claves: 'pagos cobros ingresos' },
      { href: '/caja', label: 'Caja chica', icon: Wallet },
    ],
  },
  {
    label: 'Administrador',
    adminOnly: true,
    items: [{ href: '/ajustes', label: 'Ajustes', icon: ShieldCheck, adminOnly: true }],
  },
];

export const esActivo = (pathname: string, href: string) =>
  href === '/dashboard' ? pathname === '/' || pathname === '/dashboard' : pathname.startsWith(href);

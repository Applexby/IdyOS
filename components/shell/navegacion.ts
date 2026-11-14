// Menú de IdyOS. Las pantallas relacionadas se agrupan en una sola entrada de
// la barra lateral y dentro se cambian con pestañas (SubMenu), como
// "Cotizaciones › Nueva cotización".
import {
  LayoutDashboard, FileText, Users, Target, Clapperboard, ShieldCheck,
  StickyNote, Wallet, Package,
} from 'lucide-react';

export interface SubItem { href: string; label: string }
export interface ItemNav { href: string; label: string; icon: any; adminOnly?: boolean; claves?: string; sub?: SubItem[] }

export const MENU: ItemNav[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, claves: 'inicio resumen' },
  { href: '/notas', label: 'Notas', icon: StickyNote, claves: 'notes keep' },
  { href: '/clientes', label: 'Clientes', icon: Users, claves: 'contactos empresas' },
  {
    href: '/crm', label: 'CRM', icon: Target, claves: 'leads pipeline seguimiento campañas plantillas',
    sub: [
      { href: '/crm', label: 'Pipeline' },
      { href: '/campanas', label: 'Campañas' },
      { href: '/plantillas', label: 'Plantillas' },
    ],
  },
  {
    href: '/historial', label: 'Cotizaciones', icon: FileText, claves: 'cotizar nueva pdf historial',
    sub: [
      { href: '/historial', label: 'Cotizaciones' },
      { href: '/cotizar', label: 'Nueva cotización' },
    ],
  },
  { href: '/produccion', label: 'Producción', icon: Clapperboard },
  {
    href: '/contabilidad', label: 'Finanzas', icon: Wallet, claves: 'contabilidad caja chica pagos cobros',
    sub: [
      { href: '/contabilidad', label: 'Contabilidad' },
      { href: '/caja', label: 'Caja chica' },
    ],
  },
  {
    href: '/servicios', label: 'Catálogo', icon: Package, claves: 'servicios equipos precios',
    sub: [
      { href: '/servicios', label: 'Servicios' },
      { href: '/equipos', label: 'Equipos' },
    ],
  },
  { href: '/ajustes', label: 'Ajustes', icon: ShieldCheck, adminOnly: true, claves: 'administrador usuarios' },
];

const empieza = (pathname: string, href: string) =>
  href === '/dashboard' ? pathname === '/' || pathname === '/dashboard' : pathname === href || pathname.startsWith(href + '/');

/** ¿La entrada del menú está activa? (incluye sus subpantallas) */
export const esActivo = (pathname: string, item: ItemNav) =>
  empieza(pathname, item.href) || !!item.sub?.some(s => empieza(pathname, s.href));

/** Entrada del menú y subpantalla de la ruta actual */
export function ubicacion(pathname: string) {
  const item = MENU.find(i => esActivo(pathname, i));
  const sub = item?.sub?.find(s => empieza(pathname, s.href));
  return { item, sub };
}

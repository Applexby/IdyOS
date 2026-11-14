'use client';
// Ruta y pestañas de las pantallas agrupadas (p. ej. Cotizaciones › Nueva cotización).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { ubicacion } from './navegacion';

export default function SubMenu() {
  const pathname = usePathname();
  const { item, sub } = ubicacion(pathname);
  if (!item?.sub || !sub) return null;
  return (
    <div className="flex items-center gap-4 px-5 pt-3 flex-wrap">
      <nav className="flex items-center gap-1.5 text-[13px]">
        <Link href={item.href} className="text-[#6b7280] dark:text-[#949494] hover:text-[#111827] dark:hover:text-white">{item.label}</Link>
        <ChevronRight size={14} className="text-[#9aa3b2]" />
        <span className="text-[#111827] dark:text-white font-medium">{sub.label}</span>
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[#eef1f5] dark:bg-[#1a1a1a] border border-[#e4e7ee] dark:border-[#232323]">
        {item.sub.map(s => {
          const act = s.href === sub.href;
          return (
            <Link key={s.href} href={s.href}
              className={`px-3.5 h-8 grid place-items-center rounded-lg text-[13px] transition-colors
                ${act ? 'bg-white dark:bg-[#262626] text-[#111827] dark:text-white font-medium shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#6b7280] dark:text-[#949494] hover:text-[#111827] dark:hover:text-white'}`}>
              {s.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

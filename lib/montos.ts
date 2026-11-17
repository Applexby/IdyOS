'use client';
// lib/montos.ts — ¿se muestran los montos en el Dashboard? (por defecto, ocultos)
// Se guarda en esta PC; se cambia en Configuración → Apariencia.
import { useEffect, useState } from 'react';

const CLAVE = 'idyos:mostrar-montos';
const EVENTO = 'idyos:montos';

export function leerMostrarMontos(): boolean {
  try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; }
}
export function guardarMostrarMontos(v: boolean) {
  try { localStorage.setItem(CLAVE, v ? '1' : '0'); } catch { /* noop */ }
  window.dispatchEvent(new Event(EVENTO));
}
export function useMostrarMontos(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(false);
  useEffect(() => {
    const leer = () => setV(leerMostrarMontos());
    leer();
    window.addEventListener(EVENTO, leer);
    return () => window.removeEventListener(EVENTO, leer);
  }, []);
  return [v, guardarMostrarMontos];
}
export const OCULTO = 'S/ ••••';

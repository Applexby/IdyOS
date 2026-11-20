'use client';
// lib/sonidos.ts — sonidos de notificación de IdyOS (sintetizados, sin archivos).
// Se elige en Configuración → Apariencia → Sonido de notificaciones (por PC).

export const SONIDOS = [
  { id: 'idealo',  nombre: 'IdyOS (dos tonos)' },
  { id: 'cristal', nombre: 'Cristal' },
  { id: 'gota',    nombre: 'Gota' },
  { id: 'campana', nombre: 'Campana' },
  { id: 'marimba', nombre: 'Marimba' },
  { id: 'pop',     nombre: 'Pop' },
  { id: 'ninguno', nombre: 'Sin sonido' },
] as const;
export type Sonido = typeof SONIDOS[number]['id'];

const CLAVE = 'idyos:sonido';
const CLAVE_VOL = 'idyos:sonido-vol';

export function sonidoElegido(): Sonido {
  try { return (localStorage.getItem(CLAVE) as Sonido) || 'idealo'; } catch { return 'idealo'; }
}
export function guardarSonido(s: Sonido) { try { localStorage.setItem(CLAVE, s); } catch { /* noop */ } }
export function volumen(): number {
  try { const v = Number(localStorage.getItem(CLAVE_VOL)); return isNaN(v) || !localStorage.getItem(CLAVE_VOL) ? 0.6 : Math.min(1, Math.max(0, v)); } catch { return 0.6; }
}
export function guardarVolumen(v: number) { try { localStorage.setItem(CLAVE_VOL, String(v)); } catch { /* noop */ } }

let ctx: AudioContext | null = null;
let ultimo = 0;

/** Una nota con envolvente suave. */
function nota(c: AudioContext, destino: AudioNode, frec: number, inicio: number, dur: number, tipo: OscillatorType = 'sine', vol = 1, frecFin?: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(frec, inicio);
  if (frecFin) o.frequency.exponentialRampToValueAtTime(frecFin, inicio + dur);
  g.gain.setValueAtTime(0.0001, inicio);
  g.gain.exponentialRampToValueAtTime(vol, inicio + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
  o.connect(g).connect(destino);
  o.start(inicio); o.stop(inicio + dur + 0.05);
}

/** Suena el sonido elegido (o el indicado, para probar). No repite en menos de 1,5 s. */
export function sonar(cual?: Sonido, forzar = false) {
  const s = cual || sonidoElegido();
  if (s === 'ninguno') return;
  const ahora = Date.now();
  if (!forzar && ahora - ultimo < 1500) return;
  ultimo = ahora;
  try {
    ctx = ctx || new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const c = ctx, t = c.currentTime + 0.02;
    const master = c.createGain(); master.gain.value = volumen() * 0.5; master.connect(c.destination);
    switch (s) {
      case 'idealo':  nota(c, master, 880, t, 0.22); nota(c, master, 1318.5, t + 0.12, 0.35); break;
      case 'cristal': [1568, 1975.5, 2637].forEach((f, i) => nota(c, master, f, t + i * 0.07, 0.5, 'sine', 0.6)); break;
      case 'gota':    nota(c, master, 1400, t, 0.18, 'sine', 1, 600); break;
      case 'campana': [523.25, 1046.5, 1568, 2093].forEach((f, i) => nota(c, master, f, t, 1.2 - i * 0.2, 'sine', 0.5 / (i + 1))); break;
      case 'marimba': nota(c, master, 659.25, t, 0.25, 'triangle'); nota(c, master, 987.8, t + 0.1, 0.3, 'triangle'); break;
      case 'pop':     nota(c, master, 300, t, 0.09, 'sine', 1, 900); break;
    }
  } catch { /* sin audio */ }
}

'use client';
// Cambiar la foto de perfil: elegir imagen → encuadrar (arrastrar + zoom) →
// se recorta a 512×512 en el navegador y se sube a Cloudinary.

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import Avatar from './Avatar';
import { guardarAvatarLocal, useAvatar } from '@/lib/avatar';

const LADO = 280;   // tamaño del visor
const SALIDA = 512; // tamaño de la imagen final

export default function CambiarFoto({ nombre }: { nombre?: string | null }) {
  const url = useAvatar();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Escala base: la imagen cubre todo el círculo
  const base = img ? Math.max(LADO / img.width, LADO / img.height) : 1;
  const escala = base * zoom;

  const limitar = (p: { x: number; y: number }, z = zoom) => {
    if (!img) return p;
    const e = base * z;
    const mx = Math.max(0, (img.width * e - LADO) / 2);
    const my = Math.max(0, (img.height * e - LADO) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };

  useEffect(() => { setPos(p => limitar(p)); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  function elegir(f?: File) {
    setError('');
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Elige una imagen (JPG o PNG).'); return; }
    const lector = new FileReader();
    lector.onload = () => {
      const i = new Image();
      i.onload = () => { setImg(i); setZoom(1); setPos({ x: 0, y: 0 }); };
      i.src = String(lector.result);
    };
    lector.readAsDataURL(f);
  }

  async function guardar() {
    if (!img) return;
    setSubiendo(true); setError('');
    try {
      const c = document.createElement('canvas');
      c.width = c.height = SALIDA;
      const ctx = c.getContext('2d')!;
      const k = SALIDA / LADO;
      const w = img.width * escala * k, h = img.height * escala * k;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, SALIDA, SALIDA);
      ctx.drawImage(img, (SALIDA - w) / 2 + pos.x * k, (SALIDA - h) / 2 + pos.y * k, w, h);
      const r = await fetch('/api/perfil/foto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen: c.toDataURL('image/jpeg', 0.9) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo subir');
      guardarAvatarLocal(d.url);
      setImg(null);
    } catch (e: any) { setError(e.message); }
    finally { setSubiendo(false); }
  }

  async function quitar() {
    setSubiendo(true); setError('');
    try {
      const r = await fetch('/api/perfil/foto', { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error || 'No se pudo quitar');
      guardarAvatarLocal(null);
    } catch (e: any) { setError(e.message); }
    finally { setSubiendo(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar url={url} nombre={nombre} size={64} />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => input.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-xs font-semibold hover:brightness-95">
            <Camera size={13} /> {url ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {url && (
            <button onClick={quitar} disabled={subiendo}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-50">
              <Trash2 size={13} /> Quitar
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/*" className="hidden"
          onChange={e => { elegir(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      {img && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={() => !subiendo && setImg(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-[340px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Ajustar foto</h3>
              <button onClick={() => setImg(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div
              className="relative mx-auto rounded-full overflow-hidden bg-gray-100 cursor-grab active:cursor-grabbing touch-none select-none"
              style={{ width: LADO, height: LADO }}
              onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); arrastre.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
              onPointerMove={e => { const a = arrastre.current; if (a) setPos(limitar({ x: a.px + e.clientX - a.x, y: a.py + e.clientY - a.y })); }}
              onPointerUp={() => { arrastre.current = null; }}
              onWheel={e => setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.0015)))}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt="" draggable={false} className="absolute max-w-none pointer-events-none"
                style={{
                  width: img.width * escala, height: img.height * escala,
                  left: (LADO - img.width * escala) / 2 + pos.x, top: (LADO - img.height * escala) / 2 + pos.y,
                }} />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <ZoomOut size={14} className="text-gray-400" />
              <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))}
                className="flex-1 accent-[var(--acento)]" />
              <ZoomIn size={14} className="text-gray-400" />
            </div>
            <p className="text-[11px] text-gray-400 text-center mt-1">Arrastra para encuadrar · rueda o barra para el zoom</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setImg(null)} disabled={subiendo}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600">Cancelar</button>
              <button onClick={guardar} disabled={subiendo}
                className="flex-1 py-2 rounded-xl bg-[var(--acento)] text-[var(--acento-texto)] text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                {subiendo ? <><Loader2 size={13} className="animate-spin" /> Subiendo…</> : 'Guardar foto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

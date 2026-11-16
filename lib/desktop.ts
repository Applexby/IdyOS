'use client';
// lib/desktop.ts
// Acceso desde la interfaz a las funciones del programa de escritorio
// (expuestas por electron/preload.js como window.idyos). En el navegador
// `useEscritorio()` devuelve escritorio = false y nada de esto se muestra.

import { useEffect, useState } from 'react';

export type FaseActualizacion =
  | 'inactivo' | 'buscando' | 'disponible' | 'descargando'
  | 'descargada' | 'al-dia' | 'error' | 'no-soportado';

export interface EstadoActualizacion {
  fase: FaseActualizacion;
  version: string;
  nueva: { version: string; fecha?: string; notas?: string } | null;
  progreso: number;
  error: string | null;
  ultimaBusqueda: number;
}

export interface PreferenciasPrograma {
  autoBuscar: boolean;
  intervaloHoras: number;
  autoDescargar: boolean;
  canal: 'latest' | 'beta';
  notificaciones: boolean;
  iniciarConWindows?: boolean;
  segundoPlano?: boolean;
  mensajesSegundoPlano?: boolean;
  ultimaBusqueda: number;
}

export interface InfoPrograma {
  version: string;
  plataforma: string;
  empaquetado: boolean;
  preferencias: PreferenciasPrograma;
  actualizacion: EstadoActualizacion;
  rutaDatos: string;
}

interface PuenteIdyos {
  esEscritorio: true;
  info(): Promise<InfoPrograma>;
  buscarActualizacion(): Promise<EstadoActualizacion>;
  descargarActualizacion(): Promise<EstadoActualizacion>;
  instalarActualizacion(): Promise<void>;
  alCambiarActualizacion(fn: (e: EstadoActualizacion) => void): () => void;
  guardarPreferencias(c: Partial<PreferenciasPrograma>): Promise<PreferenciasPrograma>;
  abrirConexion(): Promise<void>;
  verBienvenida?(): Promise<void>;
  limpiarCache(): Promise<boolean>;
  abrirCarpeta(cual: 'logs' | 'datos'): Promise<void>;
  reiniciar(): Promise<void>;
  loginOk?(): Promise<void>;
  meta?: {
    mostrar(canal: CanalMensajes, limites: Limites, modo?: ModoMensajes): Promise<void>;
    mover(limites: Limites): Promise<void>;
    ocultar(): Promise<void>;
    recargar(canal: CanalMensajes, modo?: ModoMensajes): Promise<void>;
    leer(canal: CanalMensajes): Promise<ChatLeido | null>;
    pegar(canal: CanalMensajes, texto: string): Promise<boolean>;
    noLeidos(): Promise<Record<CanalMensajes, number>>;
    vistaLimpia(v?: boolean): Promise<boolean>;
    tema(t: { activo?: boolean; acento: string; oscuro: boolean; acentoTexto?: string }): Promise<boolean>;
    alEvento(fn: (d: EventoMensajes) => void): () => void;
  };
  alFondoLogin?(fn: (f: { imagen: string; w: number; h: number; dx: number; dy: number }) => void): () => void;
  ventana?(accion: 'cerrar' | 'minimizar' | 'maximizar'): Promise<{ maximizada: boolean; pantallaCompleta: boolean } | null>;
  alCambiarVentana?(fn: (e: { maximizada: boolean; pantallaCompleta: boolean }) => void): () => void;
}

export type CanalMensajes = 'messenger' | 'instagram' | 'tiktok';
export type ModoMensajes = 'chats' | 'avisos';
export interface Limites { x: number; y: number; width: number; height: number }
export interface ChatLeido { nombre: string; publicacion: string; lineas: string[]; mensajes: string[]; url: string; titulo: string }
export type EventoMensajes =
  | { evento: 'aviso'; canal: CanalMensajes; nombre: string; titulo: string; cuerpo: string }
  | { evento: 'abrir'; canal: CanalMensajes }
  | ({ evento: 'no-leidos' } & Record<CanalMensajes, number>);

declare global {
  interface Window { idyos?: PuenteIdyos }
}

export function puente(): PuenteIdyos | null {
  return typeof window !== 'undefined' && window.idyos?.esEscritorio ? window.idyos : null;
}

/** Hay algo que el usuario debe ver (punto en el engranaje). */
export function hayAviso(e: EstadoActualizacion | null) {
  return !!e && ['disponible', 'descargando', 'descargada'].includes(e.fase);
}

/** Estado del programa de escritorio, actualizado en vivo. */
export function useEscritorio() {
  const [info, setInfo] = useState<InfoPrograma | null>(null);
  const [actualizacion, setActualizacion] = useState<EstadoActualizacion | null>(null);
  // Se detecta después de montar: así el primer render coincide con el del servidor
  const [p, setP] = useState<PuenteIdyos | null>(null);

  useEffect(() => {
    const api = puente();
    setP(api);
    if (!api) return;
    let vivo = true;
    api.info().then(i => { if (vivo) { setInfo(i); setActualizacion(i.actualizacion); } });
    const quitar = api.alCambiarActualizacion(e => setActualizacion(e));
    return () => { vivo = false; quitar(); };
  }, []);

  return {
    escritorio: !!p,
    info,
    setInfo,
    actualizacion,
    aviso: hayAviso(actualizacion),
    api: p,
  };
}

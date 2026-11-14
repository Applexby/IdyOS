'use client';

// Detecta clientes que ya existen en Notion con el mismo RUC, DNI, teléfono o
// correo mientras se rellena un cliente nuevo, para no crear fichas repetidas.

import { useEffect, useMemo, useState } from 'react';

export interface ClienteExistente {
  id: string; nombre_completo: string; persona_contacto: string;
  ruc: string; num_doc: string; telefono: string; email: string; tipo?: string;
  tipo_doc?: string; estado?: string;
}

let cacheClientes: Promise<ClienteExistente[]> | null = null;
function cargarClientes(): Promise<ClienteExistente[]> {
  if (!cacheClientes) {
    cacheClientes = fetch('/api/notion/clientes?incluir_leads=1')
      .then(r => r.json())
      .then(d => d.clientes || [])
      .catch(() => { cacheClientes = null; return []; });
  }
  return cacheClientes;
}

const digitos = (s: string) => (s || '').replace(/\D/g, '');
// Últimos 9 dígitos: "+51 987 654 321" y "987654321" son el mismo número
const tel = (s: string) => digitos(s).slice(-9);

export function useDuplicadosCliente(
  datos: { ruc?: string; dni?: string; telefono?: string; email?: string },
  activo: boolean,
  excluirId?: string,
) {
  const [clientes, setClientes] = useState<ClienteExistente[]>([]);
  useEffect(() => { if (activo) cargarClientes().then(setClientes); }, [activo]);

  return useMemo(() => {
    if (!activo) return [];
    const ruc = digitos(datos.ruc || ''), dni = digitos(datos.dni || ''), t = tel(datos.telefono || '');
    const email = (datos.email || '').trim().toLowerCase();
    const res: { cliente: ClienteExistente; motivo: string }[] = [];
    for (const c of clientes) {
      if (c.id === excluirId) continue;
      let motivo = '';
      if (ruc.length === 11 && digitos(c.ruc) === ruc) motivo = 'mismo RUC';
      else if (dni.length === 8 && digitos(c.num_doc) === dni) motivo = 'mismo DNI';
      else if (t.length === 9 && tel(c.telefono) === t) motivo = 'mismo teléfono';
      else if (email.includes('@') && (c.email || '').toLowerCase() === email) motivo = 'mismo correo';
      if (motivo) res.push({ cliente: c, motivo });
    }
    return res.slice(0, 3);
  }, [clientes, datos.ruc, datos.dni, datos.telefono, datos.email, activo, excluirId]);
}

/** Olvida la lista cacheada (tras crear/editar un cliente). */
export function invalidarClientesCache() { cacheClientes = null; }

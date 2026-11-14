// lib/notion-clientes.ts
// Lectura de fichas de la BD de Clientes/Contactos (NOTION_DB_CLIENTES).
// Compartido por /api/notion/clientes y /api/notion/pipeline para que el CRM y
// las cotizaciones interpreten los campos igual. Solo para rutas de servidor.

import { NOTION_VERSION } from '@/lib/notion';
import { conCache } from '@/lib/cache';

export interface FichaCliente {
  id: string;
  nombre_completo: string;   // razón social / empresa (title)
  persona_contacto: string;  // persona de contacto
  tipo_doc: string;
  num_doc: string;           // DNI del representante u otro documento
  ruc: string;
  telefono: string;
  email: string;
  estado: string;
  tipo: string;
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

// Notion distingue mayúsculas/minúsculas en nombres de propiedades, así que
// buscamos los campos de forma tolerante (sin tildes, sin mayúsculas, sin
// espacios extra) para aguantar cualquier variante del nombre.
export function parseCliente(page: any): FichaCliente {
  const p = page.properties || {};
  const findKey = (...names: string[]) => {
    const targets = names.map(norm);
    for (const key of Object.keys(p)) {
      if (targets.includes(norm(key))) return key;
    }
    return undefined;
  };
  const getRichText = (...names: string[]) => {
    const k = findKey(...names);
    return (k && p[k]?.rich_text?.[0]?.plain_text) || '';
  };
  const getTitle = (...names: string[]) => {
    const k = findKey(...names);
    return (k && p[k]?.title?.[0]?.plain_text) || '';
  };
  const getSelect = (...names: string[]) => {
    const k = findKey(...names);
    return (k && p[k]?.select?.name) || '';
  };
  // El documento puede ser texto o número según cómo se creó el campo
  const getDoc = (...names: string[]) => {
    const k = findKey(...names);
    if (!k) return '';
    if (p[k]?.type === 'number') return p[k].number != null ? String(p[k].number) : '';
    return p[k]?.rich_text?.[0]?.plain_text || '';
  };

  const phoneKey = findKey('Phone', 'Teléfono', 'Telefono');
  const emailKey = findKey('Email', 'Correo');
  return {
    id: page.id,
    nombre_completo:  getTitle('Empresa', 'Nombre', 'Name'),
    persona_contacto: getRichText('Cliente', 'Contacto', 'Persona de contacto', 'Persona contacto'),
    tipo_doc:         getSelect('Tipo de documento', 'Tipo doc', 'TipoDocumento'),
    num_doc:          getDoc('DNI representante', 'Número de documento', 'Numero de documento', 'N° de documento', 'DNI', 'Documento'),
    ruc:              getDoc('RUC'),
    telefono:         (phoneKey && p[phoneKey]?.phone_number) || '',
    email:            (emailKey && p[emailKey]?.email) || '',
    estado:           getSelect('Estado'),
    tipo:             getSelect('TIPO', 'Tipo'),
  };
}

/** Todas las fichas de la BD de Clientes (paginando), con caché que se
 *  invalida en cuanto se crea/edita/elimina un cliente. Lanza si Notion falla. */
export function listarFichasClientes(): Promise<FichaCliente[]> {
  return conCache(['clientes'], 'fichas', async () => {
    const dbId = process.env.NOTION_DB_CLIENTES;
    if (!dbId) throw new Error('NOTION_DB_CLIENTES no configurado');
    const headers = {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    };
    const fichas: FichaCliente[] = [];
    let cursor: string | undefined;
    do {
      const body: any = { page_size: 100, sorts: [{ property: 'Empresa', direction: 'ascending' }] };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const raw = await res.text();
        let msg = raw; try { msg = JSON.parse(raw).message; } catch {}
        throw new Error(msg || `Notion ${res.status}`);
      }
      const data = await res.json();
      for (const page of data.results || []) fichas.push(parseCliente(page));
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return fichas;
  });
}

/** Fichas indexadas por id (para enriquecer leads). Si falla, mapa vacío. */
export async function cargarFichasClientes(): Promise<Map<string, FichaCliente>> {
  try {
    const fichas = await listarFichasClientes();
    return new Map(fichas.map(f => [f.id, f]));
  } catch {
    return new Map();
  }
}

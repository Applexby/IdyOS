// lib/notion.ts
// Constantes y helpers para las API routes de Notion
// No importar desde componentes del cliente — solo desde app/api/

export const NOTION_VERSION = '2022-06-28';

export function notionHeaders() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN no está configurado en .env.local');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

export function getDBId(name: 'CLIENTES' | 'SERVICIOS' | 'EQUIPOS' | 'COTIZACIONES') {
  const key = `NOTION_DB_${name}`;
  const id = process.env[key];
  if (!id || id.startsWith('XXX')) {
    throw new Error(`${key} no está configurado en .env.local`);
  }
  return id;
}

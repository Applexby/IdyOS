import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

// Diagnóstico de BDs Notion.
// Abre en navegador: http://localhost:3000/api/notion/debug
//
// Muestra:
//  - Las propiedades de cada BD
//  - Las opciones exactas de cada campo `status` y `select` (con su nombre tal cual,
//    incluyendo tildes y mayúsculas) → te dice exactamente qué nombre debe usar
//    el código al escribir esos campos.

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };
}

async function inspeccionarBD(nombre: string, dbId: string | undefined) {
  if (!dbId || dbId.startsWith('XXX')) return { error: `${nombre}: ID no configurado` };
  try {
    // 1. Esquema completo de la BD — incluye las opciones de status/select
    const schemaRes = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
      headers: getHeaders(),
    });
    const schemaData = await schemaRes.json();
    if (!schemaRes.ok) return { error: `${nombre}: ${schemaData.message}`, status: schemaRes.status };

    // Extraer opciones de cada campo status/select
    const opciones: any = {};
    for (const [propName, propDef] of Object.entries(schemaData.properties || {})) {
      const def: any = propDef;
      if (def.type === 'status') {
        const optionList = def.status?.options || [];
        opciones[propName] = {
          tipo: 'status',
          opciones: optionList.map((o: any) => ({ nombre: o.name, color: o.color })),
          nota: 'Las opciones de tipo STATUS no se crean automáticamente vía API. Debes crearlas manualmente en Notion.',
        };
      } else if (def.type === 'select') {
        const optionList = def.select?.options || [];
        opciones[propName] = {
          tipo: 'select',
          opciones: optionList.map((o: any) => ({ nombre: o.name, color: o.color })),
        };
      }
    }

    // 2. Muestra de los primeros 3 registros
    const queryRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify({ page_size: 3 }),
    });
    const queryData = await queryRes.json();

    const propiedades = queryData.results?.[0]
      ? Object.entries(queryData.results[0].properties).map(([k, v]: any) => ({
          campo: k,
          tipo: v.type,
          valor_ejemplo: extraerValor(v),
        }))
      : [];

    return {
      ok: true,
      total_registros: queryData.results?.length,
      campos_status_y_select: opciones,
      propiedades_primera_pagina: propiedades,
      primer_registro_id: queryData.results?.[0]?.id,
    };
  } catch (e: any) {
    return { error: `${nombre}: ${e.message}` };
  }
}

function extraerValor(v: any): string {
  try {
    switch (v.type) {
      case 'title':        return v.title?.[0]?.plain_text || '(vacío)';
      case 'rich_text':    return v.rich_text?.[0]?.plain_text || '(vacío)';
      case 'select':       return v.select?.name || '(vacío)';
      case 'status':       return v.status?.name || '(vacío)';
      case 'multi_select': return v.multi_select?.map((x: any) => x.name).join(', ') || '(vacío)';
      case 'number':       return String(v.number ?? '(null)');
      case 'formula':      return `[formula: ${v.formula?.number ?? v.formula?.string ?? '?'}]`;
      case 'url':          return v.url ? v.url.slice(0, 50) + '...' : '(vacío)';
      case 'email':        return v.email || '(vacío)';
      case 'phone_number': return v.phone_number || '(vacío)';
      case 'date':         return v.date?.start || '(vacío)';
      case 'relation':     return `${v.relation?.length ?? 0} relaciones`;
      case 'checkbox':     return String(v.checkbox);
      default:             return `(tipo: ${v.type})`;
    }
  } catch { return '(error)'; }
}

export async function GET() {
  // Expone esquema y registros reales de Notion: solo administradores.
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if ((session.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const token = process.env.NOTION_TOKEN;
  if (!token || token.startsWith('secret_XXX') || token.startsWith('ntn_XXX')) {
    return NextResponse.json({ error: 'NOTION_TOKEN no configurado' }, { status: 500 });
  }

  const [contactos, servicios, equipos, proyectos] = await Promise.all([
    inspeccionarBD('Contactos', process.env.NOTION_DB_CLIENTES),
    inspeccionarBD('Servicios', process.env.NOTION_DB_SERVICIOS),
    inspeccionarBD('Equipos',   process.env.NOTION_DB_EQUIPOS),
    inspeccionarBD('Proyectos', process.env.NOTION_DB_COTIZACIONES),
  ]);

  return NextResponse.json({
    mensaje: 'Abre esta URL en tu navegador para diagnosticar la conexión con Notion',
    como_leer: 'Mira el bloque `bases_de_datos.proyectos.campos_status_y_select` — ahí están los nombres EXACTOS de las opciones que existen en Notion. Si quieres que la app marque automáticamente "Cotización enviada", esa opción exacta debe aparecer en el campo `ESTADO DE LEAD`.',
    token_configurado: token ? 'SÍ' : 'NO',
    bases_de_datos: { contactos, servicios, equipos, proyectos },
  }, { status: 200 });
}

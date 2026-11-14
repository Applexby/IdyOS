import { NextRequest, NextResponse } from 'next/server';
import { parseCliente, listarFichasClientes } from '@/lib/notion-clientes';
import { invalidar } from '@/lib/cache';

// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

const NOTION_VERSION = '2022-06-28';
function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache del esquema de la BD: descubrimos qué campos existen REALMENTE,
// con qué tipo y bajo qué nombre exacto. Así no escribimos campos
// que no existen (que rompen TODO el PATCH).
// ─────────────────────────────────────────────────────────────────────────────
let schemaCache: { props: Record<string, { name: string; type: string }>; ts: number } | null = null;
const SCHEMA_TTL_MS = 5 * 60 * 1000; // 5 min

async function getSchema(dbId: string) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, { headers: getHeaders() });
  if (!res.ok) return {};
  const data = await res.json();
  const props: Record<string, { name: string; type: string }> = {};
  for (const [name, def] of Object.entries(data.properties || {})) {
    const type = (def as any).type;
    props[normalize(name)] = { name, type };
  }
  return props;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Busca un campo en el esquema probando varios nombres candidatos.
// Devuelve { name, type } del primero que matchee, o null si ninguno existe.
function findField(schema: Record<string, { name: string; type: string }>, candidates: string[]): { name: string; type: string } | null {
  for (const c of candidates) {
    const hit = schema[normalize(c)];
    if (hit) return hit;
  }
  return null;
}

// La lectura de fichas vive en lib/notion-clientes.ts (compartida con el CRM)
const parsePage = parseCliente;

// Construye un objeto de propiedades VÁLIDO contra el esquema:
// solo incluye campos que existen en Notion, y los nombra exactamente
// como están en el esquema (con tildes y mayúsculas correctas).
function buildPropertiesSafe(data: any, schema: Record<string, { name: string; type: string }>): { props: any; skipped: string[] } {
  const props: any = {};
  const skipped: string[] = [];

  const tryField = (candidates: string[], builder: (fieldName: string, fieldType: string) => any) => {
    const f = findField(schema, candidates);
    if (!f) { skipped.push(candidates[0]); return; }
    const value = builder(f.name, f.type);
    if (value !== undefined) props[f.name] = value;
  };

  // Empresa (title) — único nombre estándar
  if (data.nombre_completo !== undefined) {
    tryField(['Empresa', 'Nombre', 'Name'], (name, type) => {
      if (type === 'title') return { title: [{ text: { content: data.nombre_completo || '' } }] };
      if (type === 'rich_text') return { rich_text: [{ text: { content: data.nombre_completo || '' } }] };
      return undefined;
    });
  }

  // Email
  if (data.email !== undefined) {
    tryField(['Email', 'Correo', 'Mail'], (n, t) => {
      if (t === 'email') return { email: data.email || null };
      if (t === 'rich_text') return { rich_text: [{ text: { content: data.email || '' } }] };
      return undefined;
    });
  }

  // Persona / Cliente
  if (data.persona_contacto !== undefined) {
    tryField(['Cliente', 'Contacto', 'Persona de contacto', 'Persona contacto'], (n, t) => {
      if (t === 'rich_text') return { rich_text: [{ text: { content: data.persona_contacto || '' } }] };
      if (t === 'title') return { title: [{ text: { content: data.persona_contacto || '' } }] };
      return undefined;
    });
  }

  // Tipo de documento (select)
  if (data.tipo_doc) {
    tryField(['Tipo de documento', 'Tipo doc', 'TipoDocumento'], (n, t) => {
      if (t === 'select') return { select: { name: data.tipo_doc } };
      return undefined;
    });
  }

  // Número de documento — permite borrarlo igual que el RUC
  if (data.num_doc !== undefined) {
    tryField(['DNI representante', 'Número de documento', 'Numero de documento', 'N° de documento', 'DNI', 'Documento'], (n, t) => {
      const limpio = String(data.num_doc ?? '').replace(/\D/g, '');
      if (t === 'rich_text') return { rich_text: limpio ? [{ text: { content: limpio } }] : [] };
      if (t === 'number') {
        if (limpio === '') return { number: null };
        const n2 = parseInt(limpio, 10);
        return isNaN(n2) ? { number: null } : { number: n2 };
      }
      return undefined;
    });
  }

  // RUC — permite borrarlo: si viene vacío se manda null/array vacío para limpiar Notion
  if (data.ruc !== undefined) {
    tryField(['RUC'], (n, t) => {
      const limpio = String(data.ruc ?? '').replace(/\D/g, '');
      if (t === 'number') {
        if (limpio === '') return { number: null };
        const r = parseInt(limpio, 10);
        return isNaN(r) ? { number: null } : { number: r };
      }
      if (t === 'rich_text') return { rich_text: limpio ? [{ text: { content: limpio } }] : [] };
      return undefined;
    });
  }

  // Teléfono
  if (data.telefono) {
    const tel = String(data.telefono).startsWith('+')
      ? String(data.telefono)
      : `+51${String(data.telefono).replace(/\D/g, '')}`;
    tryField(['Phone', 'Teléfono', 'Telefono'], (n, t) => {
      if (t === 'phone_number') return { phone_number: tel };
      if (t === 'rich_text') return { rich_text: [{ text: { content: tel } }] };
      return undefined;
    });
  }

  // Estado (select)
  if (data.estado) {
    tryField(['Estado'], (n, t) => {
      if (t === 'select') return { select: { name: data.estado } };
      if (t === 'status') return { status: { name: data.estado } };
      return undefined;
    });
  }

  // TIPO (select)
  if (data.tipo) {
    tryField(['TIPO', 'Tipo'], (n, t) => {
      if (t === 'select') return { select: { name: data.tipo } };
      return undefined;
    });
  }

  return { props, skipped };
}

// Escribe un PATCH campo por campo. Si uno falla, los demás siguen.
async function patchAtomico(pageId: string, properties: any): Promise<{ ok: number; errors: string[] }> {
  const errors: string[] = [];
  let ok = 0;
  for (const [name, val] of Object.entries(properties)) {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH', headers: getHeaders(),
      body: JSON.stringify({ properties: { [name]: val } }),
    });
    if (res.ok) ok++;
    else {
      const raw = await res.text();
      let msg = raw; try { msg = JSON.parse(raw).message; } catch {}
      errors.push(`${name}: ${msg}`);
    }
  }
  return { ok, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const DB_ID = process.env.NOTION_DB_CLIENTES!;
  const q = req.nextUrl.searchParams.get('q') || '';
  const filtroEstado = req.nextUrl.searchParams.get('estado') || '';

  try {
    // Lectura cacheada (se invalida al instante al crear/editar/eliminar)
    let clientes: any[] = await listarFichasClientes();
    if (filtroEstado) clientes = clientes.filter(c => c.estado === filtroEstado);

    // Por defecto, la lista de Clientes NO muestra los registros TIPO = LEAD
    // (esos pertenecen al CRM). Solo clientes o sin tipo definido.
    // Con ?incluir_leads=1 se devuelven todos (para búsqueda/enlace desde el CRM).
    const incluirLeads = req.nextUrl.searchParams.get('incluir_leads') === '1';
    if (!incluirLeads) {
      clientes = clientes.filter((c: any) => {
        const t = (c.tipo || '').toUpperCase();
        return t !== 'LEAD';
      });
    }

    if (q.length > 1) {
      // Búsqueda sin distinguir mayúsculas ni tildes ("peru" encuentra "Perú")
      const ql = normalize(q);
      const qDigits = q.replace(/\D/g, '');
      clientes = clientes.filter((c: any) =>
        normalize(c.nombre_completo).includes(ql) ||
        normalize(c.persona_contacto).includes(ql) ||
        normalize(c.email).includes(ql) ||
        (qDigits.length > 0 && (
          c.num_doc.includes(qDigits) || c.ruc.includes(qDigits) ||
          (c.telefono || '').replace(/\D/g, '').includes(qDigits)
        ))
      );
    }

    return NextResponse.json({ clientes, total: clientes.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, clientes: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const DB_ID = process.env.NOTION_DB_CLIENTES!;
  const body = await req.json();
  const schema = await getSchema(DB_ID);

  if (Object.keys(schema).length === 0) {
    return NextResponse.json({
      error: 'No se pudo leer el esquema de la BD Contactos. Verifica el NOTION_TOKEN y NOTION_DB_CLIENTES.',
    }, { status: 500 });
  }

  // Por defecto añadimos TIPO=CLIENTE y Estado=Activo, pero solo si esos campos existen
  const { props: safeProps, skipped } = buildPropertiesSafe(
    { tipo: 'CLIENTE', estado: 'Activo', ...body },
    schema,
  );

  if (skipped.length) console.warn('[POST /clientes] campos no encontrados en la BD:', skipped);

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST', headers: getHeaders(),
    body: JSON.stringify({ parent: { database_id: DB_ID }, properties: safeProps }),
  });
  const raw = await res.text();
  if (!res.ok) {
    let msg = raw; try { msg = JSON.parse(raw).message; } catch {}
    return NextResponse.json({
      error: msg,
      skipped,
      campos_disponibles_en_bd: Object.values(schema).map(f => ({ nombre: f.name, tipo: f.type })),
      campos_intentados: Object.keys(safeProps),
    }, { status: res.status });
  }
  invalidar('clientes', 'proyectos');
  return NextResponse.json({
    cliente: parsePage(JSON.parse(raw)),
    skipped: skipped.length > 0 ? skipped : undefined,
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  const body = await req.json();
  const DB_ID = process.env.NOTION_DB_CLIENTES!;

  // 1. Cargar schema actualizado de la BD
  const schema = await getSchema(DB_ID);
  if (Object.keys(schema).length === 0) {
    return NextResponse.json({
      error: 'No se pudo leer el esquema de la BD Contactos. Verifica que el NOTION_TOKEN tenga acceso a esa BD y que NOTION_DB_CLIENTES sea correcto.',
    }, { status: 500 });
  }

  // 2. Construir solo propiedades que existen en la BD
  const { props: safeProps, skipped } = buildPropertiesSafe(body, schema);

  if (skipped.length) console.warn('[PATCH /clientes] campos no encontrados en la BD:', skipped);

  if (Object.keys(safeProps).length === 0) {
    return NextResponse.json({
      error: 'Ningún campo del formulario coincide con la BD de Contactos. Revisa los nombres de campos en Notion.',
      campos_disponibles_en_bd: Object.values(schema).map(f => ({ nombre: f.name, tipo: f.type })),
      campos_que_intentamos_escribir: skipped,
    }, { status: 400 });
  }

  // 3. Escribir campo por campo
  const { ok, errors } = await patchAtomico(id, safeProps);

  if (ok === 0 && errors.length > 0) {
    return NextResponse.json({
      error: errors.join(' | '),
      skipped,
      campos_intentados: Object.keys(safeProps),
    }, { status: 500 });
  }

  invalidar('clientes', 'proyectos');

  // 4. Releer la página actualizada
  const refresh = await fetch(`https://api.notion.com/v1/pages/${id}`, { headers: getHeaders() });
  const refreshed = await refresh.json();

  return NextResponse.json({
    cliente: parsePage(refreshed),
    skipped: skipped.length > 0 ? skipped : undefined,
    warnings: errors.length > 0 ? errors : undefined,
  });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: 'PATCH', headers: getHeaders(),
    body: JSON.stringify({ archived: true }),
  });
  const raw = await res.text();
  if (!res.ok) { let msg = raw; try { msg = JSON.parse(raw).message; } catch {}; return NextResponse.json({ error: msg }, { status: res.status }); }
  invalidar('clientes', 'proyectos');
  return NextResponse.json({ ok: true });
}

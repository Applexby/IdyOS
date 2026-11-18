import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sumarDiasISO } from '@/lib/utils';
import { CADENCIA_SEGUIMIENTO } from '@/types/crm';
import { cargarFichasClientes, parseCliente, type FichaCliente } from '@/lib/notion-clientes';
import { conCache, invalidar, refrescarSiSePide } from '@/lib/cache';
import { opcionDePersona } from '@/lib/equipo';

export const runtime = 'nodejs';
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

// ─── Normalización de nombres de campo (igual que el resto del SaaS) ─────────
const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

function findKey(p: any, ...names: string[]): string | undefined {
  const targets = names.map(norm);
  for (const key of Object.keys(p)) {
    if (targets.includes(norm(key))) return key;
  }
  return undefined;
}
const getRichText = (p: any, ...names: string[]) => {
  const k = findKey(p, ...names);
  return (k && p[k]?.rich_text?.[0]?.plain_text) || '';
};
const getTitle = (p: any, ...names: string[]) => {
  const k = findKey(p, ...names);
  return (k && p[k]?.title?.[0]?.plain_text) || '';
};
const getStatus = (p: any, ...names: string[]) => {
  const k = findKey(p, ...names);
  return (k && p[k]?.status?.name) || '';
};
const getSelect = (p: any, ...names: string[]) => {
  const k = findKey(p, ...names);
  return (k && p[k]?.select?.name) || '';
};
const getDate = (p: any, ...names: string[]) => {
  const k = findKey(p, ...names);
  return (k && p[k]?.date?.start) || null;
};
const getNumber = (p: any, ...names: string[]) => {
  const k = findKey(p, ...names);
  return (k && p[k]?.number) ?? null;
};
const getUrl = (p: any, ...names: string[]) => {
  const k = findKey(p, ...names);
  return (k && p[k]?.url) || null;
};
const getPeople = (p: any, ...names: string[]) => {
  const k = findKey(p, ...names);
  if (!k || !p[k]?.people) return [];
  return (p[k].people as any[]).map((u: any) => ({
    id: u.id,
    name: u.name || '',
    avatar: u.avatar_url || null,
  }));
};
const readRollup = (p: any, ...names: string[]): string => {
  const k = findKey(p, ...names);
  if (!k || p[k]?.type !== 'rollup') return '';
  const r = p[k].rollup;
  if (!r) return '';
  if (r.type === 'array' && r.array?.length > 0) {
    const first = r.array[0];
    if (first.type === 'rich_text')    return first.rich_text?.[0]?.plain_text || '';
    if (first.type === 'title')        return first.title?.[0]?.plain_text || '';
    if (first.type === 'email')        return first.email || '';
    if (first.type === 'phone_number') return first.phone_number || '';
    if (first.type === 'number')       return String(first.number ?? '');
    if (first.type === 'select')       return first.select?.name || '';
  }
  return '';
};

// ─── Parser de página ─────────────────────────────────────────────────────────
function parseLead(page: any) {
  const p = page.properties;
  return {
    id:                   page.id,
    notion_url:           page.url,
    proyecto:             getTitle(p, 'Proyecto', 'Name'),
    empresa:              readRollup(p, 'Cliente', 'Empresa') || getRichText(p, 'Empresa'),
    empresa_id:           (p[findKey(p, 'Empresa') || '']?.relation?.[0]?.id) || null,
    cliente:              readRollup(p, 'Cliente'),
    ruc:                  readRollup(p, 'RUC'),
    dni_representante:    getNumber(p, 'DNI REPRESENTANTE', 'DNI representante'),
    telefono:             readRollup(p, 'Telefono', 'Teléfono'),
    mail:                 readRollup(p, 'Mail', 'Email'),
    sitio_web:            readRollup(p, 'Sitio Web'),
    estado_lead:          getStatus(p, 'ESTADO DE LEAD', 'Estado de lead'),
    canal:                readRollup(p, 'Canal'),
    origen:               getSelect(p, 'Origen'),
    campana:              getRichText(p, 'Campaña'),
    campana_vinculada_id: (p[findKey(p, 'Campaña vinculada') || '']?.relation?.[0]?.id) || null,
    cotizaciones_url:     getUrl(p, 'COTIZACIONES', 'Cotizaciones'),
    total:                getNumber(p, 'Total'),
    monto_pagado:         getNumber(p, 'Monto Pagado'),
    fecha_cobro:          getDate(p, 'Fecha de cobro'),
    fecha_contactado:     getDate(p, 'Fecha de contactado'),
    fecha_ultimo_contacto: getDate(p, 'Fecha último contacto', 'Fecha ultimo contacto'),
    contactado_hoy:       getDate(p, 'Contactado hoy'),
    proximo_seguimiento:  getDate(p, 'Próximo seguimiento', 'Proximo seguimiento'),
    notas_seguimiento:    getRichText(p, 'Notas de seguimiento'),
    motivo_perdida:       getSelect(p, 'Motivo de Perdida', 'Motivo de Pérdida'),
    persona_contactado:   getPeople(p, 'Persona de Contactado'),
    atendido_por:         getSelect(p, 'OS creador de la cotizacion'),
    prioridad:            getSelect(p, 'Prioridad'),
    estado:               getStatus(p, 'Estado'),
    periodo:              readRollup(p, 'Período', 'Periodo'),
    created_time:         page.created_time,
    last_edited_time:     page.last_edited_time,
  };
}

// Los rollups "Cliente"/"Empresa" del lead no distinguen razón social de
// persona de contacto (ambos campos salían con el mismo valor). Si tenemos la
// ficha real del cliente vinculado, usamos sus datos.
function conFicha<T extends ReturnType<typeof parseLead>>(lead: T, ficha?: FichaCliente): T {
  if (!ficha) return lead;
  const dniFicha = ficha.num_doc ? Number(ficha.num_doc.replace(/\D/g, '')) : NaN;
  return {
    ...lead,
    empresa:  ficha.nombre_completo || lead.empresa,
    cliente:  ficha.persona_contacto,
    ruc:      ficha.ruc || lead.ruc,
    telefono: ficha.telefono || lead.telefono,
    mail:     ficha.email || lead.mail,
    dni_representante: lead.dni_representante ?? (isNaN(dniFicha) ? null : dniFicha),
  };
}

async function fichaDe(empresaId: string | null): Promise<FichaCliente | undefined> {
  if (!empresaId) return undefined;
  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${empresaId}`, { headers: getHeaders() });
    return r.ok ? parseCliente(await r.json()) : undefined;
  } catch { return undefined; }
}

// ─── GET — listar leads con filtros opcionales ────────────────────────────────
// Query params: estado, canal, encargado_id, mes (YYYY-MM), año (YYYY), solo_activos
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const dbId = process.env.NOTION_DB_PIPELINE;
  if (!dbId) return NextResponse.json({ error: 'NOTION_DB_PIPELINE no configurado' }, { status: 500 });

  refrescarSiSePide(req.url, 'proyectos', 'clientes');
  const { searchParams } = new URL(req.url);
  const estadoFiltro   = searchParams.get('estado');
  const soloActivos    = searchParams.get('solo_activos') === 'true';
  const mesParam       = searchParams.get('mes');    // YYYY-MM
  const anoParam       = searchParams.get('ano');    // YYYY
  const canalParam     = searchParams.get('canal');

  // Construir filtros de Notion
  const filters: any[] = [];

  if (estadoFiltro) {
    filters.push({ property: 'ESTADO DE LEAD', status: { equals: estadoFiltro } });
  }

  if (soloActivos) {
    // Excluir GANADO y PERDIDO
    filters.push({ property: 'ESTADO DE LEAD', status: { does_not_equal: 'GANADO' } });
    filters.push({ property: 'ESTADO DE LEAD', status: { does_not_equal: 'PERDIDO' } });
  }

  if (mesParam) {
    const [year, month] = mesParam.split('-').map(Number);
    // Fechas como texto: con new Date(...) local + toISOString el rango se
    // corría un día según la zona horaria del servidor.
    const mm = String(month).padStart(2, '0');
    const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const start = `${year}-${mm}-01`;
    const end   = `${year}-${mm}-${String(ultimoDia).padStart(2, '0')}`;
    filters.push({ timestamp: 'created_time', created_time: { on_or_after: start } });
    filters.push({ timestamp: 'created_time', created_time: { on_or_before: end } });
  } else if (anoParam) {
    const year = parseInt(anoParam);
    filters.push({ timestamp: 'created_time', created_time: { on_or_after: `${year}-01-01` } });
    filters.push({ timestamp: 'created_time', created_time: { on_or_before: `${year}-12-31` } });
  }

  const body: any = {
    page_size: 100,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
  };

  if (filters.length === 1) {
    body.filter = filters[0];
  } else if (filters.length > 1) {
    body.filter = { and: filters };
  }

  try {
    // Lectura cacheada por combinación de filtros; se invalida al instante
    // cuando cualquier lead o cliente cambia.
    let leads = await conCache(['proyectos', 'clientes'], `leads:${JSON.stringify(body)}`, async () => {
      let allResults: any[] = [];
      let cursor: string | undefined;
      do {
        const pageBody = cursor ? { ...body, start_cursor: cursor } : body;
        const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(pageBody),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Error Notion (${res.status})`);
        }
        const data = await res.json();
        allResults = allResults.concat(data.results || []);
        cursor = data.has_more ? data.next_cursor : undefined;
      } while (cursor);

      let parsed = allResults.map(parseLead);
      // Enriquecer con la ficha del cliente (una sola consulta paginada a Contactos)
      if (parsed.some(l => l.empresa_id)) {
        const fichas = await cargarFichasClientes();
        parsed = parsed.map(l => conFicha(l, l.empresa_id ? fichas.get(l.empresa_id) : undefined));
      }
      return parsed;
    });

    // Filtro de canal post-proceso (es rollup, no se puede filtrar en query Notion)
    if (canalParam) {
      leads = leads.filter(l =>
        norm(l.canal || '').includes(norm(canalParam))
      );
    }

    return NextResponse.json({ leads, total: leads.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── PATCH — actualizar campos de un lead ─────────────────────────────────────
// Body: { pageId, fields: { estado_lead?, fecha_ultimo_contacto?, proximo_seguimiento?, notas_seguimiento?, motivo_perdida? } }
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { pageId, fields } = body;
  if (!pageId || !fields) {
    return NextResponse.json({ error: 'Faltan pageId o fields' }, { status: 400 });
  }

  // Obtener schema real de la página para no escribir campos que no existen
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: getHeaders() });
  if (!pageRes.ok) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
  const pageData = await pageRes.json();
  const p = pageData.properties;

  const properties: any = {};

  // estado_lead → status
  if (fields.estado_lead !== undefined) {
    const k = findKey(p, 'ESTADO DE LEAD', 'Estado de lead');
    if (k) properties[k] = { status: { name: fields.estado_lead } };
  }

  // fecha_ultimo_contacto → date
  if (fields.fecha_ultimo_contacto !== undefined) {
    const k = findKey(p, 'Fecha último contacto', 'Fecha ultimo contacto');
    if (k) properties[k] = fields.fecha_ultimo_contacto
      ? { date: { start: fields.fecha_ultimo_contacto } }
      : { date: null };
  }

  // proximo_seguimiento → date
  if (fields.proximo_seguimiento !== undefined) {
    const k = findKey(p, 'Próximo seguimiento', 'Proximo seguimiento');
    if (k) properties[k] = fields.proximo_seguimiento
      ? { date: { start: fields.proximo_seguimiento } }
      : { date: null };
  }

  // notas_seguimiento → rich_text (prepend nueva línea al texto existente)
  if (fields.notas_seguimiento !== undefined) {
    const k = findKey(p, 'Notas de seguimiento');
    if (k) {
      const textoActual = p[k]?.rich_text?.[0]?.plain_text || '';
      const textoNuevo = fields.notas_seguimiento
        ? `${fields.notas_seguimiento}\n${textoActual}`.trim()
        : textoActual;
      properties[k] = { rich_text: [{ type: 'text', text: { content: textoNuevo.slice(0, 2000) } }] };
    }
  }

  // notas_seguimiento_replace → reemplaza el historial completo (edición manual)
  if (fields.notas_seguimiento_replace !== undefined) {
    const k = findKey(p, 'Notas de seguimiento');
    if (k) properties[k] = { rich_text: [{ type: 'text', text: { content: String(fields.notas_seguimiento_replace).slice(0, 2000) } }] };
  }

  // motivo_perdida → select
  if (fields.motivo_perdida !== undefined) {
    const k = findKey(p, 'Motivo de Perdida', 'Motivo de Pérdida');
    if (k) properties[k] = fields.motivo_perdida
      ? { select: { name: fields.motivo_perdida } }
      : { select: null };
  }

  // origen → select (Orgánico / Campaña / Referido)
  if (fields.origen !== undefined) {
    const k = findKey(p, 'Origen');
    if (k) properties[k] = fields.origen ? { select: { name: fields.origen } } : { select: null };
  }

  // campana_id → relación a CAMPAÑAS. Al vincular, el Origen pasa a "Campaña" (semi-automático)
  if (fields.campana_id !== undefined) {
    const k = findKey(p, 'Campaña vinculada');
    if (k) {
      properties[k] = fields.campana_id ? { relation: [{ id: fields.campana_id }] } : { relation: [] };
      // Si se vincula una campaña y no se especificó origen, marcarlo como Campaña
      if (fields.campana_id && fields.origen === undefined) {
        const kO = findKey(p, 'Origen');
        if (kO) properties[kO] = { select: { name: 'Campaña' } };
      }
    }
  }

  // proyecto (título) → title
  if (fields.proyecto !== undefined) {
    const k = findKey(p, 'Proyecto', 'Name');
    if (k) properties[k] = { title: [{ type: 'text', text: { content: String(fields.proyecto).slice(0, 200) } }] };
  }

  // dni_representante → number (vive en el lead)
  if (fields.dni_representante !== undefined) {
    const k = findKey(p, 'DNI REPRESENTANTE', 'DNI representante');
    if (k) {
      const n = Number(String(fields.dni_representante).replace(/\D/g, ''));
      properties[k] = fields.dni_representante ? { number: isNaN(n) ? null : n } : { number: null };
    }
  }

  // fecha_contactado → date (primer contacto)
  if (fields.fecha_contactado !== undefined) {
    const k = findKey(p, 'Fecha de contactado');
    if (k) properties[k] = fields.fecha_contactado ? { date: { start: fields.fecha_contactado } } : { date: null };
  }

  // atendido_por → select "OS creador de la cotizacion" (Isai/Rebeca/Administración/etc.)
  if (fields.atendido_por !== undefined) {
    const k = findKey(p, 'OS creador de la cotizacion');
    if (k) properties[k] = fields.atendido_por ? { select: { name: fields.atendido_por } } : { select: null };
  }

  // empresa_id → relación a la BD de Clientes (re-enlazar a otro cliente)
  if (fields.empresa_id !== undefined) {
    const k = findKey(p, 'Empresa');
    if (k) properties[k] = fields.empresa_id ? { relation: [{ id: fields.empresa_id }] } : { relation: [] };
  }

  // total → number
  if (fields.total !== undefined) {
    const k = findKey(p, 'Total');
    if (k) { const n = fields.total === null || fields.total === '' ? NaN : Number(fields.total); properties[k] = { number: isNaN(n) ? null : n }; }
  }

  // ── Datos del CLIENTE vinculado (viven en la BD Contacto, no en el lead) ──────
  // Si vienen datos de cliente y el lead tiene una empresa relacionada, los
  // escribimos en la ficha del cliente. Campos: cliente_nombre (persona),
  // empresa_nombre (título), telefono, mail, ruc, sitio_web, canal.
  const clienteFields = ['cliente_nombre','empresa_nombre','telefono','mail','ruc','dni_representante','sitio_web','canal'];
  const tieneCliente = clienteFields.some(f => fields[f] !== undefined);
  let clienteActualizado = false;
  if (tieneCliente) {
    const kEmpresa = findKey(p, 'Empresa');
    const empresaId = fields.empresa_id || p[kEmpresa || '']?.relation?.[0]?.id;
    if (empresaId) {
      try {
        // Leer schema de la ficha del cliente para escribir con nombres correctos
        const cliRes = await fetch(`https://api.notion.com/v1/pages/${empresaId}`, { headers: getHeaders() });
        if (cliRes.ok) {
          const cliData = await cliRes.json();
          const cp = cliData.properties;
          const cprops: any = {};
          const setText  = (names: string[], val: any) => { const k = findKey(cp, ...names); if (k && val !== undefined) cprops[k] = { rich_text: [{ type:'text', text:{ content:String(val).slice(0,300) } }] }; };
          const setTitle = (names: string[], val: any) => { const k = findKey(cp, ...names); if (k && val !== undefined) cprops[k] = { title: [{ type:'text', text:{ content:String(val).slice(0,200) } }] }; };
          const setPhone = (names: string[], val: any) => { const k = findKey(cp, ...names); if (k && val !== undefined) cprops[k] = { phone_number: val || null }; };
          const setEmail = (names: string[], val: any) => { const k = findKey(cp, ...names); if (k && val !== undefined) cprops[k] = { email: val || null }; };
          const setUrl   = (names: string[], val: any) => { const k = findKey(cp, ...names); if (k && val !== undefined) cprops[k] = { url: val || null }; };
          const setSelect= (names: string[], val: any) => { const k = findKey(cp, ...names); if (k && val !== undefined) cprops[k] = val ? { select: { name: val } } : { select: null }; };

          if (fields.empresa_nombre !== undefined) setTitle(['Empresa','Nombre','Name'], fields.empresa_nombre);
          if (fields.cliente_nombre !== undefined) setText(['Cliente','Persona de contacto','Contacto'], fields.cliente_nombre);
          if (fields.telefono !== undefined)       setPhone(['Phone','Teléfono','Telefono'], fields.telefono);
          if (fields.mail !== undefined)           setEmail(['Email','Mail','Correo'], fields.mail);
          if (fields.ruc !== undefined) {
            // Permite borrar el RUC (antes un RUC vacío se guardaba como 0)
            const k = findKey(cp, 'RUC');
            const limpio = String(fields.ruc ?? '').replace(/\D/g, '');
            if (k && cp[k]?.type === 'number') cprops[k] = { number: limpio ? Number(limpio) : null };
            else if (k && cp[k]?.type === 'rich_text') cprops[k] = { rich_text: limpio ? [{ type: 'text', text: { content: limpio } }] : [] };
          }
          // DNI del representante: se guarda también en la ficha del cliente,
          // que es de donde lo lee la cotización.
          if (fields.dni_representante !== undefined) {
            const k = findKey(cp, 'DNI representante', 'Número de documento', 'Numero de documento', 'DNI');
            const limpio = String(fields.dni_representante ?? '').replace(/\D/g, '');
            if (k && cp[k]?.type === 'rich_text') cprops[k] = { rich_text: limpio ? [{ type: 'text', text: { content: limpio } }] : [] };
            else if (k && cp[k]?.type === 'number') cprops[k] = { number: limpio ? Number(limpio) : null };
          }
          if (fields.sitio_web !== undefined)      setUrl(['Sitio Web'], fields.sitio_web);
          if (fields.canal !== undefined)          setSelect(['Canal'], fields.canal);

          if (Object.keys(cprops).length > 0) {
            const upd = await fetch(`https://api.notion.com/v1/pages/${empresaId}`, {
              method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ properties: cprops }),
            });
            clienteActualizado = upd.ok;
          }
        }
      } catch { /* si falla el cliente, seguimos con el lead */ }
    }
  }

  if (Object.keys(properties).length === 0 && !clienteActualizado) {
    return NextResponse.json({ error: 'Ningún campo válido para actualizar' }, { status: 400 });
  }

  try {
    let updated = pageData;
    if (Object.keys(properties).length > 0) {
      const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ properties }),
      });
      if (!res.ok) {
        const err = await res.json();
        return NextResponse.json({ error: err.message || 'Error al actualizar' }, { status: res.status });
      }
      updated = await res.json();
    }
    // Releer la página para traer rollups actualizados del cliente
    if (clienteActualizado) {
      const fresh = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: getHeaders() });
      if (fresh.ok) updated = await fresh.json();
    }
    invalidar('proyectos', 'campanas', ...(clienteActualizado ? ['clientes' as const] : []));
    const leadActualizado = parseLead(updated);
    return NextResponse.json({ lead: conFicha(leadActualizado, await fichaDe(leadActualizado.empresa_id)), cliente_actualizado: clienteActualizado });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── POST — crear nuevo lead ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const dbId = process.env.NOTION_DB_PIPELINE;
  if (!dbId) return NextResponse.json({ error: 'NOTION_DB_PIPELINE no configurado' }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { proyecto, empresa_id, estado_lead, fecha_contactado, notas } = body;
  if (!proyecto) return NextResponse.json({ error: 'El campo proyecto es obligatorio' }, { status: 400 });

  const properties: any = {
    'Proyecto': { title: [{ type: 'text', text: { content: proyecto } }] },
    'ESTADO DE LEAD': { status: { name: estado_lead || 'NUEVO LEAD' } },
  };

  if (empresa_id) {
    properties['Empresa'] = { relation: [{ id: empresa_id }] };
  }
  if (fecha_contactado) {
    properties['Fecha de contactado'] = { date: { start: fecha_contactado } };
  }
  if (notas) {
    properties['Notas de seguimiento'] = {
      rich_text: [{ type: 'text', text: { content: notas.slice(0, 2000) } }],
    };
  }
  // El canal vive en la ficha del cliente (select "Canal"), que es de donde lo
  // lee el CRM. Solo si el lead no tiene cliente se deja como texto en el lead.
  if (body.canal && !empresa_id) {
    properties['Campaña'] = {
      rich_text: [{ type: 'text', text: { content: body.canal } }],
    };
  }
  if (body.campana) {
    properties['Campaña'] = {
      rich_text: [{ type: 'text', text: { content: body.campana } }],
    };
  }
  // Origen del lead (Orgánico / Campaña / Referido)
  if (body.origen) {
    properties['Origen'] = { select: { name: body.origen } };
  }
  // Campaña vinculada (relación). Al vincular, marca Origen = Campaña si no se dio otro
  if (body.campana_id) {
    properties['Campaña vinculada'] = { relation: [{ id: body.campana_id }] };
    if (!body.origen) properties['Origen'] = { select: { name: 'Campaña' } };
  }

  // Campos de seguimiento y responsable: solo si existen en la BD (consultamos
  // el esquema para no romper la creación si alguno no está).
  try {
    const schemaRes = await fetch(`https://api.notion.com/v1/databases/${dbId}`, { headers: getHeaders() });
    if (schemaRes.ok) {
      const sp = (await schemaRes.json()).properties || {};
      const estadoInicial = estado_lead || 'NUEVO LEAD';
      // Si el lead ya fue contactado, esa fecha es también el último contacto
      // y arranca la cadencia de seguimiento (primer hito a los 3 días).
      if (fecha_contactado && estadoInicial !== 'NUEVO LEAD') {
        const kUltimo = findKey(sp, 'Fecha último contacto', 'Fecha ultimo contacto');
        if (kUltimo) properties[kUltimo] = { date: { start: fecha_contactado } };
      }
      const kProximo = findKey(sp, 'Próximo seguimiento', 'Proximo seguimiento');
      if (kProximo && fecha_contactado) {
        properties[kProximo] = { date: { start: sumarDiasISO(estadoInicial === 'NUEVO LEAD' ? 0 : CADENCIA_SEGUIMIENTO[0], fecha_contactado) } };
      }
      // Quién atiende el lead (select "OS creador de la cotizacion"). Se usa la
      // opción existente de esa persona del equipo activo (lib/equipo.ts).
      const kAtendido = findKey(sp, 'OS creador de la cotizacion');
      if (kAtendido && body.atendido_por) {
        const opciones: string[] = (sp[kAtendido]?.select?.options || []).map((o: any) => o.name);
        const opcion = opciones.includes(body.atendido_por) ? body.atendido_por : opcionDePersona(body.atendido_por, opciones);
        if (opcion) properties[kAtendido] = { select: { name: opcion } };
      }
    }
  } catch { /* si no se puede leer el esquema, se crea el lead con los campos básicos */ }

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ parent: { database_id: dbId }, properties }),
    });
    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err.message || 'Error al crear lead' }, { status: res.status });
    }
    if (body.canal && empresa_id) {
      // Best-effort: si falla, el lead ya está creado
      await fetch(`https://api.notion.com/v1/pages/${empresa_id}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({ properties: { Canal: { select: { name: String(body.canal) } } } }),
      }).catch(() => null);
      invalidar('clientes');
    }
    invalidar('proyectos', 'campanas');
    const created = parseLead(await res.json());
    return NextResponse.json({ lead: conFicha(created, await fichaDe(created.empresa_id)) }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── DELETE — archivar (eliminar) un lead ─────────────────────────────────────
// En Notion no hay borrado duro vía API; se archiva (in_trash). Desaparece del CRM.
// Body: { pageId }
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const { pageId } = body;
  if (!pageId) return NextResponse.json({ error: 'Falta pageId' }, { status: 400 });

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH', headers: getHeaders(),
      body: JSON.stringify({ archived: true }),
    });
    if (!res.ok) { const e = await res.json(); return NextResponse.json({ error: e.message || 'Error al eliminar' }, { status: res.status }); }
    invalidar('proyectos', 'campanas');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

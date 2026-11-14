import { NextRequest, NextResponse } from 'next/server';

// La caché la controla lib/cache.ts (con invalidación al escribir), no el
// renderizado estático de Next: el handler se ejecuta en cada petición.
export const dynamic = 'force-dynamic';

// Proxy seguro para las APIs de SUNAT y RENIEC
// El token se guarda en el servidor (.env.local), nunca se expone al cliente

const CODART_TOKEN = process.env.CODART_API_TOKEN!;
const BASE_URL = 'https://api-codart.cgrt.org/api/v1/consultas';

function codartHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${CODART_TOKEN}`,
  };
}

export async function GET(req: NextRequest) {
  const tipo = req.nextUrl.searchParams.get('tipo'); // 'ruc' o 'dni'
  const numero = req.nextUrl.searchParams.get('numero');

  if (!tipo || !numero) {
    return NextResponse.json({ error: 'Faltan parámetros tipo y numero' }, { status: 400 });
  }

  // Validaciones básicas
  if (tipo === 'ruc' && numero.replace(/\D/g, '').length !== 11) {
    return NextResponse.json({ error: 'RUC debe tener 11 dígitos' }, { status: 400 });
  }
  if (tipo === 'dni' && numero.replace(/\D/g, '').length !== 8) {
    return NextResponse.json({ error: 'DNI debe tener 8 dígitos' }, { status: 400 });
  }

  try {
    let url = '';
    if (tipo === 'ruc') {
      url = `${BASE_URL}/sunat/ruc/${numero.replace(/\D/g, '')}`;
    } else if (tipo === 'dni') {
      url = `${BASE_URL}/reniec/dni/${numero.replace(/\D/g, '')}`;
    } else {
      return NextResponse.json({ error: 'Tipo debe ser ruc o dni' }, { status: 400 });
    }

    const res = await fetch(url, { headers: codartHeaders() });
    const raw = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: `Error en API externa (${res.status})` },
        { status: res.status }
      );
    }

    const data = JSON.parse(raw);

    if (!data.success) {
      return NextResponse.json({ error: 'No se encontró el documento' }, { status: 404 });
    }

    // Normalizar respuesta según tipo
    if (tipo === 'ruc') {
      const r = data.result;
      return NextResponse.json({
        ok: true,
        tipo: 'ruc',
        razon_social: r.razon_social || '',
        numero_ruc: r.numero_documento || numero,
        estado: r.estado || '',
        condicion: r.condicion || '',
        direccion: r.direccion || '',
        distrito: r.distrito || '',
        provincia: r.provincia || '',
        departamento: r.departamento || '',
        tipo_empresa: r.tipo || '',
        activo: r.estado === 'ACTIVO' && r.condicion === 'HABIDO',
      });
    } else {
      const r = data.result;
      return NextResponse.json({
        ok: true,
        tipo: 'dni',
        nombre_completo: r.full_name || '',
        primer_nombre: r.first_name || '',
        apellido_paterno: r.first_last_name || '',
        apellido_materno: r.second_last_name || '',
        numero_dni: r.document_number || numero,
      });
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Error de conexión: ${e.message}` }, { status: 500 });
  }
}

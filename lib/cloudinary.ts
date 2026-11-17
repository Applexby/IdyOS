// ⚠️  SERVER-SIDE ONLY — usar solo en API Routes o Server Actions
import { createHash } from 'crypto';
// Nunca importar este módulo desde componentes del cliente

export async function uploadPDFToCloudinary(
  pdfBuffer: Buffer,
  filename: string
): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Faltan credenciales de Cloudinary en .env.local');
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'cotizaciones';
  const publicId = `${folder}/${filename}`;

  // Generar firma SHA-1
  const signatureString = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-1', encoder.encode(signatureString));
  const signature = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const formData = new FormData();
  // Buffer no es directamente asignable a BlobPart con @types/node 20+
  // (la unión ArrayBufferLike incluye SharedArrayBuffer). Copiamos a un
  // Uint8Array respaldado por un ArrayBuffer normal para satisfacer el tipo.
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
  formData.append('file', blob, `${filename}.pdf`);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  formData.append('resource_type', 'raw');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Cloudinary error: ${err.error?.message ?? 'Unknown error'}`);
  }

  const result = await response.json();
  return result.secure_url as string;
}

// ── Fotos de perfil ─────────────────────────────────────────────────────────
// Cada usuario tiene UNA foto con un nombre fijo derivado de su correo
// (idyos/avatars/<sha1>): no hace falta guardar la URL en ninguna base de datos.


export function avatarPublicId(email: string) {
  const h = createHash('sha1').update(email.trim().toLowerCase()).digest('hex').slice(0, 24);
  return `idyos/avatars/${h}`;
}

export function avatarUrl(email: string, version?: string | number) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud) return null;
  const v = version ? `v${version}/` : '';
  return `https://res.cloudinary.com/${cloud}/image/upload/c_fill,g_face,w_256,h_256,q_auto,f_auto/${v}${avatarPublicId(email)}`;
}

async function firmar(params: Record<string, string>, secret: string) {
  const cadena = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + secret;
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(cadena));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Sube (o reemplaza) la foto de perfil. `imagen` es un data URL (image/jpeg o png). */
export async function subirAvatar(email: string, imagen: string): Promise<{ url: string; version: number }> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Faltan credenciales de Cloudinary');

  const params: Record<string, string> = {
    invalidate: 'true',
    overwrite: 'true',
    public_id: avatarPublicId(email),
    timestamp: Math.round(Date.now() / 1000).toString(),
  };
  const form = new FormData();
  form.append('file', imagen);
  form.append('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append('signature', await firmar(params, apiSecret));

  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: form });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Cloudinary: ${d.error?.message ?? r.status}`);
  return { url: avatarUrl(email, d.version)!, version: d.version };
}

/** Borra la foto de perfil. */
export async function borrarAvatar(email: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Faltan credenciales de Cloudinary');
  const params: Record<string, string> = {
    invalidate: 'true',
    public_id: avatarPublicId(email),
    timestamp: Math.round(Date.now() / 1000).toString(),
  };
  const form = new FormData();
  form.append('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append('signature', await firmar(params, apiSecret));
  await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: 'POST', body: form });
}

// ── Adjuntos de plantillas (imágenes o PDF) ─────────────────────────────────
// Se suben una vez; cada PC de IdyOS los descarga para arrastrarlos al chat
// (al cliente se le envía el archivo, nunca el enlace de Cloudinary).
export async function subirAdjunto(buffer: Buffer, nombre: string, mime: string): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Faltan credenciales de Cloudinary');
  const esImagen = mime.startsWith('image/');
  const punto = nombre.lastIndexOf('.');
  const ext = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : '';
  const base = (punto > 0 ? nombre.slice(0, punto) : nombre)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'archivo';
  // En "raw" (PDF y otros) la extensión forma parte del nombre público
  const publicId = `${base}-${Date.now().toString(36)}${!esImagen && ext ? '.' + ext : ''}`;
  const params: Record<string, string> = {
    folder: 'idyos/plantillas',
    public_id: publicId,
    timestamp: Math.round(Date.now() / 1000).toString(),
  };
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mime || 'application/octet-stream' }), nombre);
  form.append('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append('signature', await firmar(params, apiSecret));
  const tipo = esImagen ? 'image' : 'raw';
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${tipo}/upload`, { method: 'POST', body: form });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Cloudinary: ${d.error?.message ?? r.status}`);
  return d.secure_url as string;
}

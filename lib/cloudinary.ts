// ⚠️  SERVER-SIDE ONLY — usar solo en API Routes o Server Actions
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

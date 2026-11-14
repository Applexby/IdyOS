import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" genera un servidor Node autónomo (.next/standalone) que el
  // .exe de IdyOS lleva dentro y arranca en local. Sigue funcionando en Vercel.
  output: 'standalone',
  // Caché de lecturas de Notion persistente en la carpeta del usuario (ver cache-handler.js)
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0, // la memoria la gestiona cache-handler.js
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;

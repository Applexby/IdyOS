// scripts/after-pack.js
// electron-builder descarta carpetas "node_modules" y ".next" dentro de
// extraResources, y el servidor standalone de Next las necesita. Por eso lo
// copiamos completo aquí, justo después de empaquetar y antes de crear el
// instalador.
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const origen = path.join(context.packager.projectDir, '.next', 'standalone');
  const recursos = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const destino = path.join(recursos, 'app-server');

  if (!fs.existsSync(path.join(origen, 'server.js'))) {
    throw new Error('Falta .next/standalone. Ejecuta "npm run build:server" antes de empaquetar.');
  }
  fs.rmSync(destino, { recursive: true, force: true });
  fs.cpSync(origen, destino, { recursive: true, dereference: true });
  console.log(`  • servidor IdyOS copiado a ${path.relative(context.packager.projectDir, destino)}`);
};

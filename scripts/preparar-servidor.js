// scripts/preparar-servidor.js
// Tras `next build`, completa .next/standalone para que funcione dentro del .exe:
//   • copia .next/static y public (Next no los incluye en standalone),
//   • borra cualquier .env (las credenciales NUNCA van dentro del programa;
//     se configuran en la ventana "Conexión y usuarios" de cada PC).
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const standalone = path.join(raiz, '.next', 'standalone');

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.error('✗ No existe .next/standalone/server.js. ¿Falta output: "standalone" en next.config.mjs?');
  process.exit(1);
}

fs.cpSync(path.join(raiz, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });
fs.cpSync(path.join(raiz, 'public'), path.join(standalone, 'public'), { recursive: true });

for (const f of fs.readdirSync(standalone)) {
  if (f.startsWith('.env')) {
    fs.rmSync(path.join(standalone, f));
    console.log(`  · eliminado ${f} del paquete`);
  }
}
// La caché generada durante el build no sirve en el programa instalado
fs.rmSync(path.join(standalone, '.next', 'cache'), { recursive: true, force: true });

console.log('✓ Servidor listo en .next/standalone');

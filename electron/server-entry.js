// electron/server-entry.js
// Envoltorio del servidor local: si el programa principal se cierra (incluso
// de golpe), el servidor se apaga también y no deja el puerto ocupado.
//   node server-entry.js <script> [...args]
const path = require('path');

process.on('disconnect', () => process.exit(0));

const script = path.resolve(process.argv[2]);
process.argv = [process.argv[0], script, ...process.argv.slice(3)];
require(script);

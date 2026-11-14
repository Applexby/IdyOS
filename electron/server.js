// electron/server.js
// Arranca el servidor de IdyOS (Next.js: páginas + API de Notion/Cloudinary)
// en 127.0.0.1, solo accesible desde este PC.
//
// • Programa instalado: usa el servidor "standalone" que va dentro del .exe
//   (resources/app-server/server.js).
// • Desarrollo (npm run desktop): lanza `next dev` sobre el código fuente.

const { app } = require('electron');
const { fork } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const http = require('http');

const PUERTO_PREFERIDO = 47821; // fijo: así el tema, borradores y sesión (por origen) se conservan

let proceso = null;
let urlActual = null;

function puertoLibre(puerto) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(puerto, '127.0.0.1');
  });
}

async function elegirPuerto() {
  for (let p = PUERTO_PREFERIDO; p < PUERTO_PREFERIDO + 20; p++) {
    if (await puertoLibre(p)) return p;
  }
  throw new Error('No hay un puerto libre para el servidor local de IdyOS.');
}

function esperarListo(url, ms = 90_000) {
  const limite = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const intentar = () => {
      if (!proceso) return reject(new Error('El servidor local se cerró al arrancar. Revisa el registro (Ajustes del programa → Abrir registros).'));
      const req = http.get(`${url.replace("localhost", "127.0.0.1")}/api/auth/csrf`, res => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        reintentar();
      });
      req.on('error', reintentar);
      req.setTimeout(5000, () => req.destroy());
    };
    const reintentar = () => {
      if (Date.now() > limite) return reject(new Error('El servidor local tardó demasiado en arrancar.'));
      setTimeout(intentar, 300);
    };
    intentar();
  });
}

function rutaLogs() {
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rutaCache() {
  return path.join(app.getPath('userData'), 'cache');
}

/**
 * @param {Record<string,string>} envExtra credenciales y usuarios (config.entornoServidor())
 * @returns {Promise<string>} URL del servidor
 */
async function iniciar(envExtra) {
  await detener();
  const puerto = await elegirPuerto();
  // "localhost" (no 127.0.0.1): Next usa ese nombre en sus redirecciones y la
  // cookie de sesión debe ser del mismo host.
  const url = `http://localhost:${puerto}`;

  const log = fs.createWriteStream(path.join(rutaLogs(), 'servidor.log'), { flags: 'a' });
  log.write(`\n──── ${new Date().toISOString()} · IdyOS ${app.getVersion()} · ${url}\n`);

  const env = {
    ...process.env,
    ...envExtra,
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(puerto),
    HOSTNAME: '127.0.0.1',
    NEXTAUTH_URL: url,
    NEXT_PUBLIC_APP_URL: url,
    IDYOS_DESKTOP: '1',
    IDYOS_CACHE_DIR: rutaCache(),
    NEXT_TELEMETRY_DISABLED: '1',
  };

  let script, args, cwd;
  if (app.isPackaged) {
    cwd = path.join(process.resourcesPath, 'app-server');
    script = path.join(cwd, 'server.js');
    args = [];
    env.NODE_ENV = 'production';
  } else {
    cwd = path.join(__dirname, '..');
    script = require.resolve('next/dist/bin/next', { paths: [cwd] });
    args = ['dev', '-p', String(puerto), '-H', '127.0.0.1'];
    env.NODE_ENV = 'development';
  }

  proceso = fork(path.join(__dirname, 'server-entry.js'), [script, ...args], {
    cwd, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  proceso.stdout.pipe(log);
  proceso.stderr.pipe(log);
  const este = proceso;
  este.once('exit', code => {
    log.write(`[servidor terminado: ${code}]\n`);
    if (proceso === este) { proceso = null; urlActual = null; }
  });

  await esperarListo(url);
  urlActual = url;
  return url;
}

function detener() {
  return new Promise(resolve => {
    if (!proceso) return resolve();
    const p = proceso;
    proceso = null;
    urlActual = null;
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch {} resolve(); }, 4000);
    p.once('exit', () => { clearTimeout(t); resolve(); });
    try { p.kill(); } catch { clearTimeout(t); resolve(); }
  });
}

function limpiarCache() {
  fs.rmSync(rutaCache(), { recursive: true, force: true });
}

module.exports = { iniciar, detener, limpiarCache, rutaLogs, getUrl: () => urlActual };

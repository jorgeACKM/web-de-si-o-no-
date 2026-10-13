#!/usr/bin/env node
/* Servidor de ContaPY: varios usuarios trabajando sobre la misma base, con respaldos automáticos.
 * Sin dependencias (Node.js 18 o superior).
 *
 *   node server/server.js                          inicia en http://localhost:3000
 *   node server/server.js usuario-agregar ana clave123 editor     roles: admin | editor | lectura
 *   node server/server.js usuario-eliminar ana
 *   node server/server.js usuarios
 *
 * Variables de entorno: PORT (3000), DATOS (carpeta de datos, por defecto server/datos),
 * RESPALDOS_MAX (cantidad de respaldos a conservar, 200), RESPALDO_MINUTOS (intervalo mínimo, 10).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 3000;
const RAIZ = path.resolve(__dirname, '..');
const DATOS = path.resolve(process.env.DATOS || path.join(__dirname, 'datos'));
const RESPALDOS = path.join(DATOS, 'respaldos');
const ARCH_DB = path.join(DATOS, 'db.json');
const ARCH_USR = path.join(DATOS, 'usuarios.json');
const ARCH_LOG = path.join(DATOS, 'auditoria.log');
const MAX_RESP = +process.env.RESPALDOS_MAX || 200;
const MIN_RESP = (+process.env.RESPALDO_MINUTOS || 10) * 60000;
const DURACION_SESION = 12 * 3600 * 1000;

fs.mkdirSync(RESPALDOS, { recursive: true });

/* ---------- usuarios ---------- */
const leerJSON = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } };
const escribirJSON = (f, v) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, f); };
const usuarios = () => leerJSON(ARCH_USR, []);
const hash = (clave, sal) => crypto.scryptSync(String(clave), sal, 64).toString('hex');
function agregarUsuario(usuario, clave, rol) {
  if (!usuario || !clave) throw new Error('Uso: usuario-agregar <usuario> <clave> [admin|editor|lectura]');
  rol = rol || 'editor';
  if (!['admin', 'editor', 'lectura'].includes(rol)) throw new Error('Rol inválido: use admin, editor o lectura');
  const sal = crypto.randomBytes(16).toString('hex');
  const lista = usuarios().filter(u => u.usuario !== usuario);
  lista.push({ usuario, sal, hash: hash(clave, sal), rol });
  escribirJSON(ARCH_USR, lista);
}
function verificar(usuario, clave) {
  const u = usuarios().find(x => x.usuario === usuario);
  if (!u) return null;
  const a = Buffer.from(hash(clave, u.sal), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? u : null;
}

/* ---------- línea de comandos ---------- */
const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'usuario-agregar') { agregarUsuario(args[0], args[1], args[2]); console.log(`Usuario "${args[0]}" guardado (${args[2] || 'editor'}).`); process.exit(0); }
if (cmd === 'usuario-eliminar') { escribirJSON(ARCH_USR, usuarios().filter(u => u.usuario !== args[0])); console.log('Usuario eliminado.'); process.exit(0); }
if (cmd === 'usuarios') { usuarios().forEach(u => console.log(`${u.usuario}\t${u.rol}`)); process.exit(0); }
if (cmd) { console.error('Comando desconocido. Use: usuario-agregar | usuario-eliminar | usuarios'); process.exit(1); }

if (!usuarios().length) {
  const clave = crypto.randomBytes(6).toString('base64url');
  agregarUsuario('admin', clave, 'admin');
  console.log(`\n  Primer inicio: se creó el usuario "admin" con la contraseña: ${clave}\n  Cámbiela con: node server/server.js usuario-agregar admin <nueva-clave> admin\n`);
}

/* ---------- base de datos y respaldos ---------- */
let estado = leerJSON(ARCH_DB, null) || { version: 0, db: { version: 1, clientes: [], activo: null, data: {} } };
let ultimoRespaldo = 0;
function respaldar(forzar) {
  const ahora = Date.now();
  if (!forzar && ahora - ultimoRespaldo < MIN_RESP) return;
  ultimoRespaldo = ahora;
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  fs.copyFileSync(ARCH_DB, path.join(RESPALDOS, `db-${sello}-v${estado.version}.json`));
  const lista = fs.readdirSync(RESPALDOS).filter(f => f.endsWith('.json')).sort();
  lista.slice(0, Math.max(0, lista.length - MAX_RESP)).forEach(f => fs.unlinkSync(path.join(RESPALDOS, f)));
}
function auditar(usuario, accion) { fs.appendFileSync(ARCH_LOG, `${new Date().toISOString()}\t${usuario}\t${accion}\n`); }
setInterval(() => { if (fs.existsSync(ARCH_DB)) respaldar(true); }, 24 * 3600 * 1000).unref();

/* ---------- sesiones ---------- */
const sesiones = new Map();
function sesion(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  const s = sesiones.get(t);
  if (!s || s.vence < Date.now()) { sesiones.delete(t); return null; }
  s.vence = Date.now() + DURACION_SESION;
  return s;
}
const intentos = new Map(); // protección simple contra fuerza bruta: 10 intentos por IP cada 15 min

/* ---------- HTTP ---------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const responder = (res, cod, obj) => { res.writeHead(cod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
function leerCuerpo(req, limite) {
  return new Promise((ok, mal) => {
    let n = 0; const partes = [];
    req.on('data', c => { n += c.length; if (n > limite) { mal(new Error('Cuerpo demasiado grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch (e) { mal(new Error('JSON inválido')); } });
    req.on('error', mal);
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ruta = decodeURIComponent(url.pathname);
  try {
    if (ruta === '/api/ping') return responder(res, 200, { app: 'contapy', ok: true });
    if (ruta === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress, it = intentos.get(ip) || { n: 0, desde: Date.now() };
      if (Date.now() - it.desde > 15 * 60000) { it.n = 0; it.desde = Date.now(); }
      if (it.n >= 10) return responder(res, 429, { error: 'Demasiados intentos. Espere 15 minutos.' });
      const { usuario, clave } = await leerCuerpo(req, 10000);
      const u = verificar(usuario, clave);
      if (!u) { it.n++; intentos.set(ip, it); return responder(res, 401, { error: 'Usuario o contraseña incorrectos' }); }
      intentos.delete(ip);
      const token = crypto.randomBytes(24).toString('hex');
      sesiones.set(token, { usuario: u.usuario, rol: u.rol, vence: Date.now() + DURACION_SESION });
      auditar(u.usuario, 'ingreso');
      return responder(res, 200, { token, usuario: u.usuario, rol: u.rol });
    }
    if (ruta.startsWith('/api/')) {
      const s = sesion(req);
      if (!s) return responder(res, 401, { error: 'Sesión no válida' });
      if (ruta === '/api/yo') return responder(res, 200, { usuario: s.usuario, rol: s.rol });
      if (ruta === '/api/logout') { sesiones.delete((req.headers.authorization || '').replace(/^Bearer /, '')); return responder(res, 200, { ok: true }); }
      if (ruta === '/api/version') return responder(res, 200, { version: estado.version });
      if (ruta === '/api/db' && req.method === 'GET') return responder(res, 200, estado);
      if (ruta === '/api/db' && req.method === 'PUT') {
        if (s.rol === 'lectura') return responder(res, 403, { error: 'Usuario de solo lectura' });
        const cuerpo = await leerCuerpo(req, 200 * 1024 * 1024);
        if (cuerpo.version !== estado.version) return responder(res, 409, Object.assign({ error: 'Conflicto de versión' }, estado));
        if (!cuerpo.db || !Array.isArray(cuerpo.db.clientes)) return responder(res, 400, { error: 'Datos inválidos' });
        estado = { version: estado.version + 1, db: cuerpo.db, modificado: new Date().toISOString(), por: s.usuario };
        escribirJSON(ARCH_DB, estado);
        respaldar(false);
        auditar(s.usuario, `guardó versión ${estado.version}`);
        return responder(res, 200, { version: estado.version });
      }
      if (ruta === '/api/respaldos' && s.rol === 'admin') {
        return responder(res, 200, fs.readdirSync(RESPALDOS).filter(f => f.endsWith('.json')).sort().reverse().map(nombre => ({ nombre, bytes: fs.statSync(path.join(RESPALDOS, nombre)).size })));
      }
      if (ruta.startsWith('/api/respaldos/') && s.rol === 'admin') {
        const nombre = path.basename(ruta.slice('/api/respaldos/'.length));
        const f = path.join(RESPALDOS, nombre);
        if (!/^db-[\w-]+\.json$/.test(nombre) || !fs.existsSync(f)) return responder(res, 404, { error: 'No existe' });
        const contenido = JSON.parse(fs.readFileSync(f, 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${nombre}"` });
        return res.end(JSON.stringify(contenido.db || contenido, null, 1));
      }
      return responder(res, 404, { error: 'No encontrado' });
    }
    // Archivos estáticos de la aplicación (nunca la carpeta del servidor)
    let rel = ruta === '/' ? '/index.html' : ruta;
    const f = path.resolve(RAIZ, '.' + rel);
    if (!f.startsWith(RAIZ + path.sep) || f.startsWith(path.join(RAIZ, 'server') + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    responder(res, 500, { error: e.message });
  }
});

servidor.listen(PORT, () => {
  const ips = Object.values(require('os').networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\n  ContaPY funcionando.\n  En esta PC:          http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  Desde otras PCs:     http://${ip}:${PORT}`));
  console.log(`  Datos y respaldos:   ${DATOS}\n`);
});

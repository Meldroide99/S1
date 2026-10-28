#!/usr/bin/env node
/* Servidor de la página IIBPAC (para la Raspberry o cualquier equipo con Node.js 18+).
 *
 * - Sirve la página (los mismos archivos que GitHub Pages).
 * - Guarda el programa de Moral y Bienestar en la carpeta de datos (fuera del repositorio).
 * - Usuarios con contraseña: lector (solo ver y apuntarse), editor (edita sus clubs) y maestro (todo).
 * - Inscripciones a actividades («Me apunto»).
 *
 * Sin dependencias: no hace falta npm install. Arranque:  node servidor/servidor.js
 * Variables (opcionales): PUERTO=8080  HOST=127.0.0.1  IIBPAC_DATOS=/ruta/datos  HTTPS=1 (si va detrás de Cloudflare)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('./almacen');

const RAIZ = path.resolve(__dirname, '..');
const PUERTO = +process.env.PUERTO || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const DIAS_SESION = 30;
const COOKIE = 'iibpac_s';

// ===================================================================== estado en memoria (se guarda en disco en cada cambio)
let M = A.leerJSON('moral.json', null) || A.moralVacio();
M.participaciones = M.participaciones || {}; M.borrados = M.borrados || {}; M.rev = M.rev || 1;
let USU = A.leerJSON('usuarios.json', []);
let SES = A.leerJSON('sesiones.json', {}); // hash del token -> { usuario, caduca }

// si se cambian los archivos desde fuera (admin.js con el servidor en marcha), se vuelven a leer
const mt = n => { try { return fs.statSync(path.join(A.DATOS, n)).mtimeMs; } catch (e) { return 0; } };
let mtM = mt('moral.json'), mtU = mt('usuarios.json');
function recargar() {
  if (mt('usuarios.json') !== mtU) { USU = A.leerJSON('usuarios.json', []); mtU = mt('usuarios.json'); }
  if (mt('moral.json') !== mtM) { const n = A.leerJSON('moral.json', null); if (n) { M = n; M.participaciones = M.participaciones || {}; } mtM = mt('moral.json'); }
}
function guardarMoral() { M.rev++; M.guardado = new Date().toISOString(); A.escribirJSON('moral.json', M); mtM = mt('moral.json'); try { A.copiaDiaria(M); } catch (e) { console.error('copia diaria:', e.message); } }
function guardarUsuarios() { A.escribirJSON('usuarios.json', USU); mtU = mt('usuarios.json'); }
let tSes = null;
function guardarSesiones() { clearTimeout(tSes); tSes = setTimeout(() => A.escribirJSON('sesiones.json', SES), 500); }

// ===================================================================== utilidades http
const CABECERAS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
function enviar(res, codigo, obj, extra) {
  const cuerpo = JSON.stringify(obj);
  res.writeHead(codigo, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CABECERAS, extra || {}));
  res.end(cuerpo);
}
const error = (res, codigo, txt) => enviar(res, codigo, { error: txt });
function leerCuerpo(req, max) {
  return new Promise((ok, mal) => {
    let n = 0; const trozos = [];
    req.on('data', c => { n += c.length; if (n > max) { mal(Object.assign(new Error('Demasiado grande'), { codigo: 413 })); req.destroy(); } else trozos.push(c); });
    req.on('end', () => { try { ok(trozos.length ? JSON.parse(Buffer.concat(trozos).toString('utf8')) : {}); } catch (e) { mal(Object.assign(new Error('JSON no válido'), { codigo: 400 })); } });
    req.on('error', mal);
  });
}
function ipDe(req) {
  return String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
}
function cookies(req) {
  const o = {}; for (const p of String(req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return o;
}
const segura = req => process.env.HTTPS === '1' || req.headers['x-forwarded-proto'] === 'https';
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

// ===================================================================== sesiones y permisos
function sesion(req) {
  const t = cookies(req)[COOKIE]; if (!t) return null;
  const k = sha(t); const s = SES[k];
  if (!s || s.caduca < Date.now()) { if (s) { delete SES[k]; guardarSesiones(); } return null; }
  const u = USU.find(x => x.usuario === s.usuario); if (!u) return null;
  // la sesión se alarga mientras se use
  if (s.caduca - Date.now() < (DIAS_SESION - 1) * 864e5) { s.caduca = Date.now() + DIAS_SESION * 864e5; guardarSesiones(); }
  return { k, u };
}
const publico = u => ({ usuario: u.usuario, rol: u.rol, clubs: u.rol === 'editor' ? u.clubs || [] : [], nombre: u.nombre || '' });
const esMaestro = u => u.rol === 'maestro';
const misClubs = u => new Set(u.rol === 'editor' ? u.clubs || [] : []);

/** ¿Puede este usuario dejar la actividad «viejo» como «nuevo»? (nuevo = null para borrarla) */
function puedeEvento(u, viejo, nuevo) {
  if (esMaestro(u)) return true;
  if (u.rol !== 'editor') return false;
  const mis = misClubs(u);
  if (viejo && !viejo.apartados.some(a => mis.has(a))) return false; // no es de ninguno de sus clubs
  if (!nuevo) return !!viejo && viejo.apartados.length > 0 && viejo.apartados.every(a => mis.has(a)); // borrar: solo si es solo suya
  if (!nuevo.apartados.some(a => mis.has(a))) return false; // tiene que seguir en uno de sus clubs
  const antes = new Set(viejo ? viejo.apartados : []);
  return nuevo.apartados.every(a => mis.has(a) || antes.has(a)); // no puede meterla en clubs ajenos
}
const puedeApartado = (u, a, existe) => esMaestro(u) || (u.rol === 'editor' && existe && misClubs(u).has(a.id));

// límite de intentos de acceso: 8 fallos en 15 minutos por IP
const FALLOS = new Map();
function bloqueado(ip) { const f = FALLOS.get(ip); if (!f) return false; if (Date.now() - f.desde > 15 * 60e3) { FALLOS.delete(ip); return false; } return f.n >= 8; }
function fallo(ip) { const f = FALLOS.get(ip); if (!f || Date.now() - f.desde > 15 * 60e3) FALLOS.set(ip, { n: 1, desde: Date.now() }); else f.n++; }

// ===================================================================== lo que ve cada uno
function vista(req) {
  const disp = String(req.headers['x-dispositivo'] || '').slice(0, 64);
  const part = {};
  for (const [k, l] of Object.entries(M.participaciones)) {
    part[k] = l.map(p => ({ id: p.id, nombre: p.nombre, empleo: p.empleo, nota: p.nota, fecha: p.fecha, reserva: !!p.reserva, mio: !!disp && p.dispositivo === disp }));
  }
  return { formato: 'iibpac-moral', version: 2, rev: M.rev, titulo: M.titulo, subtitulo: M.subtitulo, modTitulo: M.modTitulo, apartados: M.apartados, eventos: M.eventos, borrados: {}, participaciones: part };
}
/** Vuelve a calcular quién queda en reserva (por orden de inscripción). */
function recolocar(ev) {
  const l = M.participaciones[ev.id] || []; const plazas = (ev.inscripcion && ev.inscripcion.plazas) || 0;
  l.sort((a, b) => a.fecha.localeCompare(b.fecha));
  l.forEach((p, i) => { p.reserva = !!plazas && i >= plazas; });
}

// ===================================================================== API
async function api(req, res, url) {
  const m = req.method; const ruta = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  // contra peticiones desde otras webs: toda escritura lleva esta cabecera (otra web no puede ponerla)
  if (m !== 'GET' && req.headers['x-iibpac'] !== '1') return error(res, 403, 'Petición no permitida.');
  recargar();
  const s = sesion(req);

  if (ruta === 'yo' && m === 'GET') return enviar(res, 200, { modo: 'servidor', usuario: s ? publico(s.u) : null, hayUsuarios: USU.length > 0 });

  if (ruta === 'login' && m === 'POST') {
    const ip = ipDe(req);
    if (bloqueado(ip)) return error(res, 429, 'Demasiados intentos. Espera 15 minutos.');
    const b = await leerCuerpo(req, 4096);
    const u = USU.find(x => x.usuario === String(b.usuario || '').trim().toLowerCase());
    if (!u || !A.comprobarClave(b.clave || '', u)) { fallo(ip); return error(res, 401, 'Usuario o contraseña incorrectos.'); }
    FALLOS.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    SES[sha(token)] = { usuario: u.usuario, caduca: Date.now() + DIAS_SESION * 864e5, ip, creada: new Date().toISOString() };
    for (const [k, v] of Object.entries(SES)) if (v.caduca < Date.now()) delete SES[k];
    guardarSesiones();
    return enviar(res, 200, { usuario: publico(u) }, { 'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DIAS_SESION * 86400}${segura(req) ? '; Secure' : ''}` });
  }
  if (ruta === 'logout' && m === 'POST') {
    if (s) { delete SES[s.k]; guardarSesiones(); }
    return enviar(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
  }

  if (!s) return error(res, 401, 'Tienes que iniciar sesión.');
  const u = s.u;

  // --- leer el programa (si no ha cambiado desde «rev», no se manda entero)
  if (ruta === 'estado' && m === 'GET') {
    if (url.searchParams.get('rev') === String(M.rev)) return enviar(res, 200, { rev: M.rev, igual: true });
    return enviar(res, 200, { rev: M.rev, datos: vista(req) });
  }

  // --- guardar cambios del calendario y los apartados (todo o nada)
  if (ruta === 'cambios' && m === 'POST') {
    if (u.rol === 'lector') return error(res, 403, 'Tu usuario es solo de lectura.');
    const b = await leerCuerpo(req, 12e6);
    const evs = (Array.isArray(b.eventos) ? b.eventos : []).map(A.limpiarEvento).filter(Boolean);
    const aps = (Array.isArray(b.apartados) ? b.apartados : []).map(A.limpiarApartado).filter(Boolean);
    const borrar = (Array.isArray(b.borrar) ? b.borrar : []).map(A.id).filter(Boolean);
    // 1) comprobar permisos de todo antes de tocar nada
    for (const a of aps) if (!puedeApartado(u, a, M.apartados.some(x => x.id === a.id))) return error(res, 403, `No puedes modificar el apartado «${a.nombre}».`);
    for (const e of evs) { const v = M.eventos.find(x => x.id === e.id); if (!puedeEvento(u, v, e)) return error(res, 403, `No puedes ${v ? 'modificar' : 'crear'} «${e.titulo || 'esa actividad'}» en ese apartado.`); }
    for (const k of borrar) {
      const v = M.eventos.find(x => x.id === k); if (v && !puedeEvento(u, v, null)) return error(res, 403, `No puedes eliminar «${v.titulo}» (es también de otro club).`);
      if (M.apartados.some(x => x.id === k) && !esMaestro(u)) return error(res, 403, 'Solo el usuario maestro puede eliminar apartados.');
    }
    if (b.titulo && !esMaestro(u)) return error(res, 403, 'Solo el usuario maestro puede cambiar el nombre del programa.');
    // 2) aplicar
    for (const a of aps) { const i = M.apartados.findIndex(x => x.id === a.id); if (i >= 0) M.apartados[i] = a; else M.apartados.push(a); }
    for (const e of evs) {
      const i = M.eventos.findIndex(x => x.id === e.id);
      if (i >= 0) M.eventos[i] = e; else M.eventos.push(e);
      if (M.participaciones[e.id]) recolocar(e);
    }
    for (const k of borrar) {
      M.eventos = M.eventos.filter(x => x.id !== k); M.apartados = M.apartados.filter(x => x.id !== k);
      delete M.participaciones[k];
    }
    if (b.titulo) { M.titulo = A.txt(b.titulo.titulo, 200) || 'Programa de Moral y Bienestar'; M.subtitulo = A.txt(b.titulo.subtitulo, 200); M.modTitulo = new Date().toISOString(); }
    const base = +b.base || 0;
    guardarMoral();
    console.log(`${new Date().toISOString()} ${u.usuario}: ${evs.length} act., ${aps.length} apart., ${borrar.length} borradas`);
    return enviar(res, 200, { rev: M.rev, otros: base + 1 !== M.rev });
  }

  // --- inscripciones
  if (ruta === 'apuntarse' && m === 'POST') {
    const b = await leerCuerpo(req, 8192);
    const ev = M.eventos.find(x => x.id === b.evento); if (!ev) return error(res, 404, 'Esa actividad ya no existe.');
    const ins = ev.inscripcion || {};
    if (!ins.abierta) return error(res, 409, 'La inscripción de esta actividad está cerrada.');
    const hoy = new Date().toISOString().slice(0, 10);
    if (ins.cierre && ins.cierre < hoy) return error(res, 409, 'El plazo de inscripción ya ha terminado.');
    const nombre = A.txt(b.nombre, 120).trim(), empleo = A.txt(b.empleo, 40).trim();
    if (nombre.length < 3) return error(res, 400, 'Escribe tu nombre y apellidos.');
    const l = M.participaciones[ev.id] = M.participaciones[ev.id] || [];
    const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (l.some(p => norm(p.nombre) === norm(nombre))) return error(res, 409, `${nombre} ya está apuntado.`);
    if (l.length >= 500) return error(res, 409, 'No caben más inscripciones.');
    l.push({ id: 'p' + crypto.randomBytes(6).toString('hex'), nombre, empleo, nota: A.txt(b.nota, 200).trim(), fecha: new Date().toISOString(), dispositivo: String(req.headers['x-dispositivo'] || '').slice(0, 64), usuario: u.usuario });
    recolocar(ev); guardarMoral();
    return enviar(res, 200, { rev: M.rev, datos: vista(req) });
  }
  if (ruta === 'desapuntarse' && m === 'POST') {
    const b = await leerCuerpo(req, 4096);
    const ev = M.eventos.find(x => x.id === b.evento); const l = M.participaciones[b.evento] || [];
    const p = l.find(x => x.id === b.id); if (!p) return error(res, 404, 'Esa inscripción ya no existe.');
    const disp = String(req.headers['x-dispositivo'] || '');
    const suyo = disp && p.dispositivo === disp;
    const gestor = esMaestro(u) || (ev && u.rol === 'editor' && ev.apartados.some(a => misClubs(u).has(a)));
    if (!suyo && !gestor) return error(res, 403, 'Solo puedes quitar tu propia inscripción (desde el mismo ordenador o móvil con el que te apuntaste).');
    M.participaciones[b.evento] = l.filter(x => x !== p);
    if (ev) recolocar(ev);
    guardarMoral();
    return enviar(res, 200, { rev: M.rev, datos: vista(req) });
  }

  // --- solo el maestro
  if (!esMaestro(u)) return error(res, 403, 'Solo el usuario maestro puede hacer esto.');

  if (ruta === 'usuarios' && m === 'GET') return enviar(res, 200, { usuarios: USU.map(x => Object.assign(publico(x), { creado: x.creado || '' })) });
  if (ruta === 'usuarios' && m === 'POST') {
    const b = await leerCuerpo(req, 8192);
    const nombre = String(b.usuario || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,32}$/.test(nombre)) return error(res, 400, 'Usuario: de 2 a 32 letras sin acentos, números, punto o guion.');
    if (!['lector', 'editor', 'maestro'].includes(b.rol)) return error(res, 400, 'Rol no válido.');
    let x = USU.find(y => y.usuario === nombre);
    if (!x && !b.clave) return error(res, 400, 'Pon una contraseña.');
    if (b.clave && String(b.clave).length < 8) return error(res, 400, 'La contraseña tiene que tener al menos 8 caracteres.');
    if (x && x.rol === 'maestro' && b.rol !== 'maestro' && USU.filter(y => y.rol === 'maestro').length === 1) return error(res, 400, 'Tiene que quedar al menos un usuario maestro.');
    if (!x) { x = { usuario: nombre, creado: new Date().toISOString() }; USU.push(x); }
    x.rol = b.rol; x.clubs = b.rol === 'editor' ? (Array.isArray(b.clubs) ? b.clubs.map(A.id).filter(Boolean) : []) : [];
    x.nombre = A.txt(b.nombre, 80);
    if (b.clave) {
      Object.assign(x, A.hashClave(b.clave));
      // al cambiar la contraseña se cierran las sesiones abiertas de ese usuario (menos la tuya)
      for (const [k, v] of Object.entries(SES)) if (v.usuario === nombre && k !== s.k) delete SES[k];
      guardarSesiones();
    }
    guardarUsuarios();
    return enviar(res, 200, { usuarios: USU.map(publico) });
  }
  if (ruta === 'usuarios/borrar' && m === 'POST') {
    const b = await leerCuerpo(req, 4096);
    if (b.usuario === u.usuario) return error(res, 400, 'No puedes borrar tu propio usuario.');
    USU = USU.filter(x => x.usuario !== b.usuario);
    for (const [k, v] of Object.entries(SES)) if (v.usuario === b.usuario) delete SES[k];
    guardarUsuarios(); guardarSesiones();
    return enviar(res, 200, { usuarios: USU.map(publico) });
  }
  if (ruta === 'exportar' && m === 'GET') {
    const copia = JSON.parse(JSON.stringify(M));
    return enviar(res, 200, copia, { 'Content-Disposition': `attachment; filename="moral-bienestar-${new Date().toISOString().slice(0, 10)}.json"` });
  }
  if (ruta === 'importar' && m === 'POST') {
    const b = await leerCuerpo(req, 30e6);
    try { M = A.importar(b, M); } catch (e) { return error(res, 400, e.message); }
    M.rev--; guardarMoral();
    console.log(`${new Date().toISOString()} ${u.usuario}: importado (${M.eventos.length} actividades, ${M.apartados.length} apartados)`);
    return enviar(res, 200, { rev: M.rev, datos: vista(req) });
  }
  return error(res, 404, 'No existe.');
}

// ===================================================================== archivos de la página
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.webmanifest': 'application/manifest+json',
};
const PROHIBIDO = new Set(['servidor', 'tools', 'node_modules']);
function estatico(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, CABECERAS); return res.end(); }
  let rel; try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400, CABECERAS); return res.end(); }
  const partes = rel.split('/').filter(Boolean);
  // nada de archivos ocultos (.git…), ni el código del servidor, ni datos
  if (partes.some(p => p.startsWith('.') || p.includes('\0')) || PROHIBIDO.has(partes[0]) || /\.(json|ics|md|py|sh)$/i.test(rel) && !/manifest/.test(rel)) { res.writeHead(404, CABECERAS); return res.end('No existe'); }
  let f = path.join(RAIZ, ...partes);
  if (!f.startsWith(RAIZ)) { res.writeHead(404, CABECERAS); return res.end(); }
  fs.stat(f, (err, st) => {
    if (!err && st.isDirectory()) { f = path.join(f, 'index.html'); }
    fs.stat(f, (err2, st2) => {
      if (err2 || !st2.isFile()) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CABECERAS)); return res.end('No existe'); }
      const tipo = TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream';
      const cache = /\.html$/.test(f) ? 'no-cache' : url.search.includes('v=') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
      res.writeHead(200, Object.assign({ 'Content-Type': tipo, 'Content-Length': st2.size, 'Cache-Control': cache }, CABECERAS));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(f).pipe(res);
    });
  });
}

// ===================================================================== arranque
const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await api(req, res, url);
    return estatico(req, res, url);
  } catch (e) {
    if (e.codigo) return error(res, e.codigo, e.message);
    console.error(e); if (!res.headersSent) error(res, 500, 'Error del servidor.');
  }
});
servidor.listen(PUERTO, HOST, () => {
  console.log(`IIBPAC en http://${HOST}:${PUERTO}  ·  datos en ${A.DATOS}`);
  if (!USU.length) console.log('Aún no hay usuarios. Crea el maestro con:  node servidor/admin.js maestro <usuario>');
});
// guardar las sesiones pendientes al apagar
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { A.escribirJSON('sesiones.json', SES); } catch (e) { /* nada */ } process.exit(0); });

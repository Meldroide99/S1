#!/usr/bin/env node
/* Servidor de la página IIBPAC (para la Raspberry o cualquier equipo con Node.js 18+).
 *
 * - Sirve la página (los mismos archivos que GitHub Pages).
 * - Cuentas personales: cada uno se registra con el código de la unidad, confirma su correo y
 *   el maestro (o quien tenga permiso) aprueba la cuenta. Nadie entra sin aprobación.
 * - Permisos por catálogo y roles editables (roles.json), no fijos en el código.
 * - Programa de Moral y Bienestar, inscripciones, convocatorias y avisos por correo
 *   (convocatoria, cambios, salida de reserva y recordatorio el día anterior).
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
const CORREO = require('./correo');

const RAIZ = path.resolve(__dirname, '..');
const PUERTO = +process.env.PUERTO || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const DIAS_SESION = 90;
const COOKIE = 'iibpac_s';

// ===================================================================== estado (en memoria y en disco)
let M, USU, SES, CFG, ROLES, TOK;
function leerTodo() {
  M = A.leerJSON('moral.json', null) || A.moralVacio();
  M.participaciones = M.participaciones || {}; M.borrados = M.borrados || {}; M.rev = M.rev || 1; M.avisos = M.avisos || {};
  USU = A.leerJSON('usuarios.json', []).map(A.normalizarUsuario);
  SES = A.leerJSON('sesiones.json', {});
  CFG = Object.assign({ codigoRegistro: '', url: '', correo: { proveedor: 'registro' }, recordatorios: true, horaRecordatorio: '18:00' }, A.leerJSON('config.json', {}));
  ROLES = A.leerRoles();
  TOK = A.leerJSON('tokens.json', {});
}
leerTodo();
CORREO.configurar(() => CFG);

// si se cambian los archivos desde fuera (admin.js con el servidor en marcha), se vuelven a leer
const mt = n => { try { return fs.statSync(path.join(A.DATOS, n)).mtimeMs; } catch (e) { return 0; } };
const MT = {};
for (const n of ['moral.json', 'usuarios.json', 'roles.json', 'config.json']) MT[n] = mt(n);
function recargar() {
  if (mt('usuarios.json') !== MT['usuarios.json']) { USU = A.leerJSON('usuarios.json', []).map(A.normalizarUsuario); MT['usuarios.json'] = mt('usuarios.json'); }
  if (mt('roles.json') !== MT['roles.json']) { ROLES = A.leerRoles(); MT['roles.json'] = mt('roles.json'); }
  if (mt('moral.json') !== MT['moral.json']) { const n = A.leerJSON('moral.json', null); if (n) { M = n; M.participaciones = M.participaciones || {}; M.avisos = M.avisos || {}; } MT['moral.json'] = mt('moral.json'); }
}
const guardar = (n, obj) => { A.escribirJSON(n, obj); MT[n] = mt(n); };
function guardarMoral() { M.rev++; M.guardado = new Date().toISOString(); guardar('moral.json', M); try { A.copiaDiaria(M); } catch (e) { console.error('copia diaria:', e.message); } }
const guardarUsuarios = () => guardar('usuarios.json', USU);
const guardarCfg = () => guardar('config.json', CFG);
let tSes = null;
function guardarSesiones() { clearTimeout(tSes); tSes = setTimeout(() => A.escribirJSON('sesiones.json', SES), 500); }
const guardarTokens = () => A.escribirJSON('tokens.json', TOK);

// ===================================================================== utilidades http
const CABECERAS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
function enviar(res, codigo, obj, extra) {
  res.writeHead(codigo, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CABECERAS, extra || {}));
  res.end(JSON.stringify(obj));
}
const error = (res, codigo, txt, cod) => enviar(res, codigo, { error: txt, codigo: cod || undefined });
function leerCuerpo(req, max) {
  return new Promise((ok, mal) => {
    let n = 0; const trozos = [];
    req.on('data', c => { n += c.length; if (n > max) { mal(Object.assign(new Error('Demasiado grande'), { codigo: 413 })); req.destroy(); } else trozos.push(c); });
    req.on('end', () => { try { ok(trozos.length ? JSON.parse(Buffer.concat(trozos).toString('utf8')) : {}); } catch (e) { mal(Object.assign(new Error('JSON no válido'), { codigo: 400 })); } });
    req.on('error', mal);
  });
}
const ipDe = req => String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
function cookies(req) {
  const o = {}; for (const p of String(req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return o;
}
const segura = req => process.env.HTTPS === '1' || req.headers['x-forwarded-proto'] === 'https';
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const igualSeguro = (a, b) => { const x = Buffer.from(sha(String(a))), y = Buffer.from(sha(String(b))); return crypto.timingSafeEqual(x, y); };
let ultimoOrigen = '';
const base = () => (CFG.url || ultimoOrigen || `http://localhost:${PUERTO}`).replace(/\/+$/, '');
const RE_CORREO = /^[^\s@<>"]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$/;
const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// límites de intentos (acceso, registro, correos): n intentos por ventana
const LIM = new Map();
function limite(clave, max, ventanaMs) {
  const ahora = Date.now(); const l = (LIM.get(clave) || []).filter(t => ahora - t < ventanaMs);
  if (l.length >= max) { LIM.set(clave, l); return false; }
  l.push(ahora); LIM.set(clave, l); return true;
}
const limpiarLimite = clave => LIM.delete(clave);

// ===================================================================== usuarios, sesiones y permisos
const permisosDe = u => (ROLES[u.rol] ? ROLES[u.rol].permisos : []);
const tiene = (u, p) => !!u && permisosDe(u).includes(p);
const misClubs = u => new Set(u.clubs || []);
const nombreDe = u => [u.empleo, u.nombre].filter(Boolean).join(' ') || u.usuario;
const publico = u => ({
  id: u.id, usuario: u.usuario, empleo: u.empleo, nombre: u.nombre, correo: u.correo, correoOk: u.correoOk,
  rol: u.rol, rolNombre: (ROLES[u.rol] || {}).nombre || u.rol, clubs: u.clubs, permisos: permisosDe(u), avisos: u.avisos,
});
const paraGestor = u => Object.assign(publico(u), { estado: u.estado, creado: u.creado || '', ultimoAcceso: u.ultimoAcceso || '', origen: u.origen || '' });
const buscarLogin = t => { const x = norm(t); return USU.find(u => u.usuario === x || (u.correo && u.correo.toLowerCase() === x)); };

function sesion(req) {
  const t = cookies(req)[COOKIE]; if (!t) return null;
  const k = sha(t); const s = SES[k];
  if (!s || s.caduca < Date.now()) { if (s) { delete SES[k]; guardarSesiones(); } return null; }
  const u = USU.find(x => x.id === s.uid || x.usuario === s.usuario);
  if (!u || u.estado !== 'activo') return null;
  if (s.caduca - Date.now() < (DIAS_SESION - 1) * 864e5) { s.caduca = Date.now() + DIAS_SESION * 864e5; guardarSesiones(); } // se alarga mientras se use
  return { k, u };
}
function cerrarSesiones(uid, salvo) { for (const [k, v] of Object.entries(SES)) if ((v.uid === uid) && k !== salvo) delete SES[k]; guardarSesiones(); }

/** ¿Puede este usuario dejar la actividad «viejo» como «nuevo»? (nuevo = null para borrarla) */
function puedeEvento(u, viejo, nuevo) {
  if (tiene(u, 'moral.editar_todo')) return true;
  if (!tiene(u, 'moral.editar_clubs')) return false;
  const mis = misClubs(u);
  if (viejo && !viejo.apartados.some(a => mis.has(a))) return false;
  if (!nuevo) return !!viejo && viejo.apartados.length > 0 && viejo.apartados.every(a => mis.has(a));
  if (!nuevo.apartados.some(a => mis.has(a))) return false;
  const antes = new Set(viejo ? viejo.apartados : []);
  return nuevo.apartados.every(a => mis.has(a) || antes.has(a));
}
const puedeApartado = (u, a, existe) => tiene(u, 'moral.editar_todo') || (tiene(u, 'moral.editar_clubs') && existe && misClubs(u).has(a.id));
const gestorEv = (u, ev) => !!ev && tiene(u, 'moral.convocar') && (tiene(u, 'moral.editar_todo') || ev.apartados.some(a => misClubs(u).has(a)));

// tokens de un solo uso (confirmar correo, contraseña olvidada)
function nuevoToken(tipo, uid, horas) {
  const t = crypto.randomBytes(24).toString('base64url');
  for (const [k, v] of Object.entries(TOK)) if (v.caduca < Date.now() || (v.uid === uid && v.tipo === tipo)) delete TOK[k];
  TOK[sha(t)] = { tipo, uid, caduca: Date.now() + horas * 3600e3 };
  guardarTokens(); return t;
}
function usarToken(t, tipo) {
  const k = sha(String(t || '')); const v = TOK[k];
  if (!v || v.tipo !== tipo || v.caduca < Date.now()) return null;
  delete TOK[k]; guardarTokens(); return v;
}

// ===================================================================== correos
function correoConfirmar(u) {
  const t = nuevoToken('verificar', u.id, 72);
  return CORREO.enviar({ para: u.correo, nombre: nombreDe(u), asunto: 'Confirma tu correo · IIBPAC',
    titulo: 'Confirma tu correo', parrafos: [`Hola, ${CORREO.escH(nombreDe(u))}.`, 'Pulsa el botón para confirmar que este correo es tuyo. El enlace vale 3 días.',
      u.estado === 'pendiente' ? 'Después, el responsable revisará tu solicitud y te avisaremos cuando puedas entrar.' : ''].filter(Boolean),
    boton: { texto: 'Confirmar mi correo', url: `${base()}/?verificar=${t}#/moral` } });
}
const aprobadores = () => USU.filter(u => u.estado === 'activo' && u.correo && u.correoOk && tiene(u, 'usuarios.aprobar') && u.avisos.correo !== false);
/** Aviso a una persona (si tiene correo confirmado y no ha quitado los avisos). Canal preparado para móvil más adelante. */
function avisar(uid, m) {
  const u = USU.find(x => x.id === uid);
  if (!u || u.estado !== 'activo' || !u.correo || !u.correoOk || u.avisos.correo === false) return;
  CORREO.enviar(Object.assign({ para: u.correo, nombre: nombreDe(u), pie: 'Puedes quitar estos avisos en «Mi cuenta».' }, m));
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function cuando(e) {
  if (!e.inicio) return 'sin fecha todavía';
  const d = t => { const [a, m, dd] = t.split('-').map(Number); const x = new Date(a, m - 1, dd); return `${DIAS[x.getDay()]} ${dd} de ${MESES[m - 1]}`; };
  return (e.fin && e.fin !== e.inicio ? `del ${d(e.inicio)} al ${d(e.fin)}` : `el ${d(e.inicio)}`) + (e.hora ? ` a las ${e.hora}${e.horaFin ? ' (hasta las ' + e.horaFin + ')' : ''}` : '');
}
const detalles = e => [`<b>${CORREO.escH(e.titulo)}</b>, ${CORREO.escH(cuando(e))}.`, e.lugar ? `Lugar: ${CORREO.escH(e.lugar)}.` : '', e.responsable ? `Responsable: ${CORREO.escH(e.responsable)}.` : ''].filter(Boolean);
const enlaceEv = () => ({ texto: 'Ver en el calendario', url: `${base()}/#/moral` });

// ===================================================================== lo que ve cada uno
function vista(u) {
  const part = {};
  for (const [k, l] of Object.entries(M.participaciones)) {
    part[k] = l.map(p => { const x = p.uid ? USU.find(y => y.id === p.uid) : null;
      return { id: p.id, empleo: x ? x.empleo : p.empleo, nombre: x ? (x.nombre || x.usuario) : p.nombre, nota: p.nota, fecha: p.fecha, reserva: !!p.reserva, tipo: p.tipo || 'apuntado', sinCuenta: !p.uid, mio: !!p.uid && p.uid === u.id }; });
  }
  return { formato: 'iibpac-moral', version: 2, rev: M.rev, titulo: M.titulo, subtitulo: M.subtitulo, modTitulo: M.modTitulo, apartados: M.apartados, eventos: M.eventos, borrados: {}, participaciones: part };
}
/** Coloca a la gente por orden: primero los convocados, luego los apuntados por orden de llegada; los que no caben, en reserva. */
function recolocar(ev, avisarSubida) {
  const l = M.participaciones[ev.id] || []; const plazas = (ev.inscripcion && ev.inscripcion.plazas) || 0;
  const antes = new Map(l.map(p => [p.id, !!p.reserva]));
  l.sort((a, b) => ((a.tipo === 'convocado' ? 0 : 1) - (b.tipo === 'convocado' ? 0 : 1)) || a.fecha.localeCompare(b.fecha));
  l.forEach((p, i) => { p.reserva = !!plazas && i >= plazas; });
  if (avisarSubida) for (const p of l) if (p.uid && antes.get(p.id) && !p.reserva) avisar(p.uid, { asunto: `Ya tienes plaza: ${ev.titulo}`, titulo: 'Ya tienes plaza', parrafos: ['Ha quedado una plaza libre y has pasado de la reserva a la lista.', ...detalles(ev)], boton: enlaceEv() });
}

// ===================================================================== recordatorios del día anterior
function recordatorios() {
  if (!CFG.recordatorios) return;
  const ahora = new Date(); const [h, m] = String(CFG.horaRecordatorio || '18:00').split(':').map(Number);
  if (ahora.getHours() * 60 + ahora.getMinutes() < h * 60 + (m || 0)) return;
  const man = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  const t = `${man.getFullYear()}-${String(man.getMonth() + 1).padStart(2, '0')}-${String(man.getDate()).padStart(2, '0')}`;
  let cambios = false;
  for (const ev of M.eventos) {
    if (ev.inicio !== t || ev.estado === 'cancelado') continue;
    for (const p of M.participaciones[ev.id] || []) {
      if (!p.uid || p.reserva) continue;
      const k = `${ev.id}|${t}|${p.uid}`; if (M.avisos[k]) continue;
      M.avisos[k] = Date.now(); cambios = true;
      avisar(p.uid, { asunto: `Mañana: ${ev.titulo}`, titulo: 'Recordatorio para mañana', parrafos: [`Estás ${p.tipo === 'convocado' ? 'convocado' : 'apuntado'} a:`, ...detalles(ev)], boton: enlaceEv() });
    }
  }
  if (cambios) {
    for (const [k, v] of Object.entries(M.avisos)) if (Date.now() - v > 60 * 864e5) delete M.avisos[k];
    guardar('moral.json', M); // sin cambiar rev: no afecta a lo que ve la gente
  }
}
setInterval(() => { try { recargar(); recordatorios(); } catch (e) { console.error('recordatorios:', e); } }, 5 * 60e3);
setTimeout(() => { try { recordatorios(); } catch (e) { console.error(e); } }, 5000);

// ===================================================================== API
async function api(req, res, url) {
  const m = req.method; const ruta = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  // contra peticiones desde otras webs: toda escritura lleva esta cabecera (otra web no puede ponerla)
  if (m !== 'GET' && req.headers['x-iibpac'] !== '1') return error(res, 403, 'Petición no permitida.');
  recargar();
  if (req.headers.host && !CFG.url) ultimoOrigen = `${segura(req) ? 'https' : 'http'}://${req.headers.host}`;
  const ip = ipDe(req);
  const s = sesion(req);
  const POST = (r) => ruta === r && m === 'POST';

  // ---------------------------------------------------- sin sesión
  if (ruta === 'yo' && m === 'GET') {
    if (s) { s.u.ultimoAcceso = new Date().toISOString().slice(0, 10); }
    return enviar(res, 200, { modo: 'servidor', usuario: s ? publico(s.u) : null, hayUsuarios: USU.length > 0, registroAbierto: !!CFG.codigoRegistro });
  }
  if (POST('login')) {
    if (!limite('login|' + ip, 8, 15 * 60e3)) return error(res, 429, 'Demasiados intentos. Espera 15 minutos.');
    const b = await leerCuerpo(req, 4096);
    const u = buscarLogin(b.usuario);
    if (!u || !A.comprobarClave(b.clave || '', u)) return error(res, 401, 'Usuario o contraseña incorrectos.');
    if (u.estado === 'bloqueado') return error(res, 403, 'Tu cuenta está bloqueada. Habla con el responsable.', 'bloqueado');
    if (u.origen === 'registro' && !u.correoOk) return error(res, 403, 'Antes de entrar, confirma tu correo con el enlace que te enviamos.', 'verificar');
    if (u.estado === 'pendiente') return error(res, 403, 'Tu solicitud aún no está aprobada. Te avisaremos por correo cuando lo esté.', 'pendiente');
    limpiarLimite('login|' + ip);
    const token = crypto.randomBytes(32).toString('base64url');
    SES[sha(token)] = { uid: u.id, usuario: u.usuario, caduca: Date.now() + DIAS_SESION * 864e5, ip, creada: new Date().toISOString(), navegador: String(req.headers['user-agent'] || '').slice(0, 120) };
    for (const [k, v] of Object.entries(SES)) if (v.caduca < Date.now()) delete SES[k];
    u.ultimoAcceso = new Date().toISOString().slice(0, 10); guardarUsuarios(); guardarSesiones();
    return enviar(res, 200, { usuario: publico(u) }, { 'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DIAS_SESION * 86400}${segura(req) ? '; Secure' : ''}` });
  }
  if (POST('logout')) {
    if (s) { delete SES[s.k]; guardarSesiones(); }
    return enviar(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
  }
  if (POST('registro')) {
    if (!CFG.codigoRegistro) return error(res, 403, 'El registro está cerrado. Pide la cuenta al responsable.');
    if (!limite('registro|' + ip, 6, 3600e3)) return error(res, 429, 'Demasiados intentos. Prueba dentro de una hora.');
    const b = await leerCuerpo(req, 8192);
    if (!igualSeguro(String(b.codigo || '').trim().toUpperCase(), String(CFG.codigoRegistro).toUpperCase())) return error(res, 400, 'El código de la unidad no es correcto.');
    const usuario = norm(b.usuario), correo = String(b.correo || '').trim().toLowerCase();
    const nombre = A.txt(b.nombre, 120).trim(), empleo = A.txt(b.empleo, 40).trim();
    if (nombre.length < 5) return error(res, 400, 'Escribe tu nombre y apellidos.');
    if (!/^[a-z0-9._-]{3,32}$/.test(usuario)) return error(res, 400, 'Usuario: de 3 a 32 letras sin acentos, números, punto o guion.');
    if (!RE_CORREO.test(correo)) return error(res, 400, 'Ese correo no parece válido.');
    if (String(b.clave || '').length < 8) return error(res, 400, 'La contraseña tiene que tener al menos 8 caracteres.');
    if (USU.some(x => x.usuario === usuario)) return error(res, 409, 'Ese usuario ya existe. Elige otro.');
    if (USU.some(x => x.correo && x.correo.toLowerCase() === correo)) return error(res, 409, 'Ya hay una cuenta con ese correo. Si es tuya, usa «He olvidado mi contraseña».');
    if (USU.filter(x => x.estado === 'pendiente').length >= 300) return error(res, 429, 'Hay demasiadas solicitudes pendientes. Habla con el responsable.');
    const u = A.normalizarUsuario(Object.assign({ usuario, correo, nombre, empleo, rol: 'lector', estado: 'pendiente', origen: 'registro', creado: new Date().toISOString() }, A.hashClave(b.clave)));
    USU.push(u); guardarUsuarios();
    correoConfirmar(u);
    for (const a of aprobadores()) avisar(a.id, { asunto: `Solicitud de cuenta: ${nombreDe(u)}`, titulo: 'Nueva solicitud de cuenta', parrafos: [`<b>${CORREO.escH(nombreDe(u))}</b> (${CORREO.escH(u.correo)}) ha pedido una cuenta con el usuario «${CORREO.escH(u.usuario)}».`, 'Apruébala o recházala en Moral y Bienestar → Usuarios.'], boton: { texto: 'Revisar solicitudes', url: `${base()}/#/moral` } });
    console.log(`${new Date().toISOString()} registro: ${u.usuario} <${u.correo}>`);
    return enviar(res, 200, { ok: true });
  }
  if (POST('verificar')) {
    const b = await leerCuerpo(req, 2048);
    const t = usarToken(b.token, 'verificar'); if (!t) return error(res, 400, 'El enlace no vale o ha caducado. Entra y pide otro.');
    const u = USU.find(x => x.id === t.uid); if (!u) return error(res, 404, 'Esa cuenta ya no existe.');
    u.correoOk = true; guardarUsuarios();
    return enviar(res, 200, { ok: true, pendiente: u.estado === 'pendiente' });
  }
  if (POST('reenviar')) {
    const b = await leerCuerpo(req, 2048);
    if (limite('reenviar|' + ip, 4, 3600e3)) { const u = buscarLogin(b.usuario); if (u && u.correo && !u.correoOk) correoConfirmar(u); }
    return enviar(res, 200, { ok: true }); // misma respuesta siempre: no revela si la cuenta existe
  }
  if (POST('olvide')) {
    const b = await leerCuerpo(req, 2048);
    if (limite('olvide|' + ip, 5, 3600e3)) {
      const u = buscarLogin(b.correo);
      if (u && u.estado === 'activo' && u.correo && u.correoOk) {
        const t = nuevoToken('restablecer', u.id, 1);
        CORREO.enviar({ para: u.correo, nombre: nombreDe(u), asunto: 'Cambiar tu contraseña · IIBPAC', titulo: 'Cambiar tu contraseña',
          parrafos: ['Alguien (seguramente tú) ha pedido cambiar la contraseña de tu cuenta.', 'El enlace vale 1 hora. Si no lo has pedido tú, ignora este correo.'],
          boton: { texto: 'Poner una contraseña nueva', url: `${base()}/?restablecer=${t}#/moral` } });
      }
    }
    return enviar(res, 200, { ok: true });
  }
  if (POST('restablecer')) {
    const b = await leerCuerpo(req, 2048);
    if (String(b.clave || '').length < 8) return error(res, 400, 'La contraseña tiene que tener al menos 8 caracteres.');
    const t = usarToken(b.token, 'restablecer'); if (!t) return error(res, 400, 'El enlace no vale o ha caducado. Pide otro.');
    const u = USU.find(x => x.id === t.uid); if (!u) return error(res, 404, 'Esa cuenta ya no existe.');
    Object.assign(u, A.hashClave(b.clave)); u.correoOk = true; guardarUsuarios(); cerrarSesiones(u.id);
    return enviar(res, 200, { ok: true });
  }

  if (!s) return error(res, 401, 'Tienes que iniciar sesión.');
  const u = s.u;
  if (!tiene(u, 'moral.ver')) return error(res, 403, 'Tu cuenta no tiene acceso.');

  // ---------------------------------------------------- programa
  if (ruta === 'estado' && m === 'GET') {
    const pend = tiene(u, 'usuarios.aprobar') ? USU.filter(x => x.estado === 'pendiente').length : 0;
    if (url.searchParams.get('rev') === String(M.rev)) return enviar(res, 200, { rev: M.rev, igual: true, solicitudes: pend });
    return enviar(res, 200, { rev: M.rev, datos: vista(u), solicitudes: pend });
  }
  if (POST('cambios')) {
    if (!tiene(u, 'moral.editar_clubs') && !tiene(u, 'moral.editar_todo')) return error(res, 403, 'Tu cuenta es solo de lectura.');
    const b = await leerCuerpo(req, 12e6);
    const evs = (Array.isArray(b.eventos) ? b.eventos : []).map(A.limpiarEvento).filter(Boolean);
    const aps = (Array.isArray(b.apartados) ? b.apartados : []).map(A.limpiarApartado).filter(Boolean);
    const borrar = (Array.isArray(b.borrar) ? b.borrar : []).map(A.id).filter(Boolean);
    // 1) comprobar permisos de todo antes de tocar nada
    for (const a of aps) {
      const existe = M.apartados.some(x => x.id === a.id);
      if (!existe && !tiene(u, 'moral.apartados')) return error(res, 403, 'No puedes crear apartados.');
      if (!puedeApartado(u, a, existe) && !(!existe && tiene(u, 'moral.apartados'))) return error(res, 403, `No puedes modificar el apartado «${a.nombre}».`);
    }
    for (const e of evs) { const v = M.eventos.find(x => x.id === e.id); if (!puedeEvento(u, v, e)) return error(res, 403, `No puedes ${v ? 'modificar' : 'crear'} «${e.titulo || 'esa actividad'}» en ese apartado.`); }
    for (const k of borrar) {
      const v = M.eventos.find(x => x.id === k); if (v && !puedeEvento(u, v, null)) return error(res, 403, `No puedes eliminar «${v.titulo}» (es también de otro club).`);
      if (M.apartados.some(x => x.id === k) && !tiene(u, 'moral.apartados')) return error(res, 403, 'No puedes eliminar apartados.');
    }
    if (b.titulo && !tiene(u, 'moral.apartados')) return error(res, 403, 'No puedes cambiar el nombre del programa.');
    // 2) aplicar (y avisar a los apuntados de cambios importantes)
    for (const a of aps) { const i = M.apartados.findIndex(x => x.id === a.id); if (i >= 0) M.apartados[i] = a; else M.apartados.push(a); }
    for (const e of evs) {
      const i = M.eventos.findIndex(x => x.id === e.id); const v = i >= 0 ? M.eventos[i] : null;
      if (i >= 0) M.eventos[i] = e; else M.eventos.push(e);
      if (M.participaciones[e.id]) {
        recolocar(e, true);
        if (v) {
          const cancelada = e.estado === 'cancelado' && v.estado !== 'cancelado';
          const cambio = v.inicio !== e.inicio || v.fin !== e.fin || v.hora !== e.hora || v.lugar !== e.lugar;
          if (cancelada || cambio) for (const p of M.participaciones[e.id]) if (p.uid && p.uid !== u.id) avisar(p.uid, cancelada
            ? { asunto: `Cancelada: ${e.titulo}`, titulo: 'Actividad cancelada', parrafos: [`Se ha cancelado <b>${CORREO.escH(e.titulo)}</b>, prevista ${CORREO.escH(cuando(v))}.`], boton: enlaceEv() }
            : { asunto: `Cambio en ${e.titulo}`, titulo: 'Ha cambiado una actividad en la que estás', parrafos: ['Así queda ahora:', ...detalles(e)], boton: enlaceEv() });
        }
      }
    }
    for (const k of borrar) {
      const v = M.eventos.find(x => x.id === k);
      if (v && v.estado !== 'cancelado' && v.inicio && v.inicio >= new Date().toISOString().slice(0, 10)) for (const p of M.participaciones[k] || []) if (p.uid && p.uid !== u.id) avisar(p.uid, { asunto: `Anulada: ${v.titulo}`, titulo: 'Actividad anulada', parrafos: [`Se ha quitado del calendario <b>${CORREO.escH(v.titulo)}</b>, prevista ${CORREO.escH(cuando(v))}.`] });
      M.eventos = M.eventos.filter(x => x.id !== k); M.apartados = M.apartados.filter(x => x.id !== k);
      delete M.participaciones[k];
    }
    if (b.titulo) { M.titulo = A.txt(b.titulo.titulo, 200) || 'Programa de Moral y Bienestar'; M.subtitulo = A.txt(b.titulo.subtitulo, 200); M.modTitulo = new Date().toISOString(); }
    const baseRev = +b.base || 0;
    guardarMoral();
    console.log(`${new Date().toISOString()} ${u.usuario}: ${evs.length} act., ${aps.length} apart., ${borrar.length} borradas`);
    return enviar(res, 200, { rev: M.rev, otros: baseRev + 1 !== M.rev });
  }

  // ---------------------------------------------------- inscripciones y convocatorias
  if (POST('apuntarse')) {
    if (!tiene(u, 'moral.apuntarse')) return error(res, 403, 'Tu cuenta no puede apuntarse a actividades.');
    const b = await leerCuerpo(req, 4096);
    const ev = M.eventos.find(x => x.id === b.evento); if (!ev) return error(res, 404, 'Esa actividad ya no existe.');
    const ins = ev.inscripcion || {};
    if (!ins.abierta) return error(res, 409, 'La inscripción de esta actividad está cerrada.');
    if (ins.cierre && ins.cierre < new Date().toISOString().slice(0, 10)) return error(res, 409, 'El plazo de inscripción ya ha terminado.');
    const l = M.participaciones[ev.id] = M.participaciones[ev.id] || [];
    if (l.some(p => p.uid === u.id)) return error(res, 409, 'Ya estás en esta actividad.');
    if (l.length >= 1000) return error(res, 409, 'No caben más inscripciones.');
    l.push({ id: 'p' + crypto.randomBytes(6).toString('hex'), uid: u.id, tipo: 'apuntado', nota: A.txt(b.nota, 200).trim(), fecha: new Date().toISOString() });
    recolocar(ev); guardarMoral();
    return enviar(res, 200, { rev: M.rev, datos: vista(u) });
  }
  if (POST('desapuntarse')) {
    const b = await leerCuerpo(req, 4096);
    const ev = M.eventos.find(x => x.id === b.evento); const l = M.participaciones[b.evento] || [];
    const p = l.find(x => x.id === b.id); if (!p) return error(res, 404, 'Esa inscripción ya no existe.');
    if (p.uid !== u.id && !gestorEv(u, ev)) return error(res, 403, 'Solo puedes quitar tu propia inscripción.');
    M.participaciones[b.evento] = l.filter(x => x !== p);
    if (ev) {
      recolocar(ev, true);
      if (p.uid && p.uid !== u.id) avisar(p.uid, { asunto: `Ya no estás en: ${ev.titulo}`, titulo: 'Te han quitado de una actividad', parrafos: [`${CORREO.escH(nombreDe(u))} te ha quitado de <b>${CORREO.escH(ev.titulo)}</b> (${CORREO.escH(cuando(ev))}).`] });
    }
    guardarMoral();
    return enviar(res, 200, { rev: M.rev, datos: vista(u) });
  }
  if (POST('convocar')) {
    const b = await leerCuerpo(req, 65536);
    const ev = M.eventos.find(x => x.id === b.evento); if (!ev) return error(res, 404, 'Esa actividad ya no existe.');
    if (!gestorEv(u, ev)) return error(res, 403, 'No puedes convocar en esta actividad.');
    const l = M.participaciones[ev.id] = M.participaciones[ev.id] || [];
    let n = 0;
    for (const id of (Array.isArray(b.usuarios) ? b.usuarios : []).slice(0, 500)) {
      const x = USU.find(y => y.id === id && y.estado === 'activo'); if (!x) continue;
      const ya = l.find(p => p.uid === x.id);
      if (ya) { if (ya.tipo !== 'convocado') { ya.tipo = 'convocado'; n++; } continue; }
      l.push({ id: 'p' + crypto.randomBytes(6).toString('hex'), uid: x.id, tipo: 'convocado', nota: '', fecha: new Date().toISOString(), por: u.id }); n++;
      if (x.id !== u.id) avisar(x.id, { asunto: `Convocatoria: ${ev.titulo}`, titulo: 'Estás convocado', parrafos: [`${CORREO.escH(nombreDe(u))} te ha convocado a:`, ...detalles(ev)], boton: enlaceEv() });
    }
    for (const x of (Array.isArray(b.externos) ? b.externos : []).slice(0, 100)) { // personas sin cuenta
      const nombre = A.txt(x.nombre, 120).trim(); if (nombre.length < 3) continue;
      if (l.some(p => !p.uid && norm(p.nombre) === norm(nombre))) continue;
      l.push({ id: 'p' + crypto.randomBytes(6).toString('hex'), uid: null, nombre, empleo: A.txt(x.empleo, 40).trim(), tipo: 'convocado', nota: A.txt(x.nota, 200), fecha: new Date().toISOString(), por: u.id }); n++;
    }
    recolocar(ev); guardarMoral();
    return enviar(res, 200, { rev: M.rev, datos: vista(u), n });
  }
  if (ruta === 'personas' && m === 'GET') {
    if (!tiene(u, 'moral.convocar')) return error(res, 403, 'No puedes ver la lista de personal.');
    return enviar(res, 200, { personas: USU.filter(x => x.estado === 'activo').map(x => ({ id: x.id, empleo: x.empleo, nombre: x.nombre || x.usuario })) });
  }

  // ---------------------------------------------------- mi cuenta
  if (POST('cuenta')) {
    const b = await leerCuerpo(req, 8192);
    if (b.claveNueva) {
      if (!A.comprobarClave(b.claveActual || '', u)) return error(res, 400, 'La contraseña actual no es correcta.');
      if (String(b.claveNueva).length < 8) return error(res, 400, 'La contraseña nueva tiene que tener al menos 8 caracteres.');
      Object.assign(u, A.hashClave(b.claveNueva)); cerrarSesiones(u.id, s.k);
    }
    if (b.nombre !== undefined) { const n = A.txt(b.nombre, 120).trim(); if (n.length < 3) return error(res, 400, 'Escribe tu nombre y apellidos.'); u.nombre = n; }
    if (b.empleo !== undefined) u.empleo = A.txt(b.empleo, 40).trim();
    if (b.avisos) u.avisos = { correo: !!b.avisos.correo };
    let reenviado = false;
    if (b.correo !== undefined) {
      const c = String(b.correo || '').trim().toLowerCase();
      if (c && !RE_CORREO.test(c)) return error(res, 400, 'Ese correo no parece válido.');
      if (c && USU.some(x => x !== u && x.correo && x.correo.toLowerCase() === c)) return error(res, 409, 'Ese correo ya lo usa otra cuenta.');
      if (c !== u.correo) { u.correo = c; u.correoOk = false; if (c) { correoConfirmar(u); reenviado = true; } }
    }
    if (b.reenviar && u.correo && !u.correoOk && limite('reenviar|' + u.id, 4, 3600e3)) { correoConfirmar(u); reenviado = true; }
    guardarUsuarios();
    return enviar(res, 200, { usuario: publico(u), reenviado });
  }

  // ---------------------------------------------------- usuarios
  const puedeGestionar = tiene(u, 'usuarios.gestionar'), puedeAprobar = tiene(u, 'usuarios.aprobar') || puedeGestionar;
  const listaUsuarios = () => ({ usuarios: USU.map(paraGestor), roles: Object.entries(ROLES).map(([k, r]) => ({ k, nombre: r.nombre, descripcion: r.descripcion || '', permisos: r.permisos })), codigoRegistro: puedeGestionar ? CFG.codigoRegistro : undefined });
  if (ruta === 'usuarios' && m === 'GET') { if (!puedeAprobar) return error(res, 403, 'No tienes permiso.'); return enviar(res, 200, listaUsuarios()); }
  if (POST('usuarios/aprobar')) {
    if (!puedeAprobar) return error(res, 403, 'No tienes permiso para aprobar cuentas.');
    const b = await leerCuerpo(req, 8192);
    const x = USU.find(y => y.id === b.id && y.estado === 'pendiente'); if (!x) return error(res, 404, 'Esa solicitud ya no existe.');
    const rol = puedeGestionar && ROLES[b.rol] ? b.rol : 'lector';
    if (rol === 'maestro' && !tiene(u, 'sistema.ajustes')) return error(res, 403, 'No puedes dar ese rol.');
    x.estado = 'activo'; x.rol = rol; x.clubs = puedeGestionar && Array.isArray(b.clubs) ? b.clubs.map(A.id).filter(Boolean) : []; x.aprobadoPor = u.id; x.aprobado = new Date().toISOString();
    guardarUsuarios();
    if (x.correo) CORREO.enviar({ para: x.correo, nombre: nombreDe(x), asunto: 'Tu cuenta está aprobada · IIBPAC', titulo: 'Ya puedes entrar', parrafos: [`Hola, ${CORREO.escH(nombreDe(x))}. Tu cuenta «${CORREO.escH(x.usuario)}» está aprobada.`, x.correoOk ? 'Ya puedes entrar con tu usuario y contraseña.' : 'Antes de entrar, confirma tu correo con el enlace que te enviamos al registrarte.'], boton: { texto: 'Entrar', url: `${base()}/#/moral` } });
    return enviar(res, 200, listaUsuarios());
  }
  if (POST('usuarios/rechazar')) {
    if (!puedeAprobar) return error(res, 403, 'No tienes permiso para rechazar cuentas.');
    const b = await leerCuerpo(req, 4096);
    const x = USU.find(y => y.id === b.id && y.estado === 'pendiente'); if (!x) return error(res, 404, 'Esa solicitud ya no existe.');
    USU = USU.filter(y => y !== x); guardarUsuarios();
    return enviar(res, 200, listaUsuarios());
  }
  if (!puedeGestionar && /^usuarios(\/|$)/.test(ruta)) return error(res, 403, 'No tienes permiso para gestionar usuarios.');
  if (POST('usuarios')) {
    const b = await leerCuerpo(req, 8192);
    let x = b.id ? USU.find(y => y.id === b.id) : null;
    const usuario = norm(b.usuario);
    if (!x && !/^[a-z0-9._-]{2,32}$/.test(usuario)) return error(res, 400, 'Usuario: de 2 a 32 letras sin acentos, números, punto o guion.');
    if (!x && USU.some(y => y.usuario === usuario)) return error(res, 409, 'Ese usuario ya existe.');
    if (!ROLES[b.rol]) return error(res, 400, 'Rol no válido.');
    if ((b.rol === 'maestro' || (x && x.rol === 'maestro')) && !tiene(u, 'sistema.ajustes')) return error(res, 403, 'No puedes dar ni quitar el rol de maestro.');
    if (!x && !b.clave) return error(res, 400, 'Pon una contraseña inicial.');
    if (b.clave && String(b.clave).length < 8) return error(res, 400, 'La contraseña tiene que tener al menos 8 caracteres.');
    if (x && x.rol === 'maestro' && b.rol !== 'maestro' && USU.filter(y => y.rol === 'maestro' && y.estado === 'activo').length === 1) return error(res, 400, 'Tiene que quedar al menos un usuario maestro.');
    const correo = String(b.correo || '').trim().toLowerCase();
    if (correo && !RE_CORREO.test(correo)) return error(res, 400, 'Ese correo no parece válido.');
    if (correo && USU.some(y => y !== x && y.correo && y.correo.toLowerCase() === correo)) return error(res, 409, 'Ese correo ya lo usa otra cuenta.');
    if (!x) { x = A.normalizarUsuario({ usuario, creado: new Date().toISOString(), origen: 'gestor', estado: 'activo' }); USU.push(x); }
    x.rol = b.rol; x.clubs = Array.isArray(b.clubs) ? b.clubs.map(A.id).filter(Boolean) : [];
    x.nombre = A.txt(b.nombre, 120).trim(); x.empleo = A.txt(b.empleo, 40).trim();
    if (correo !== x.correo) { x.correo = correo; x.correoOk = false; if (correo) correoConfirmar(x); }
    if (b.clave) { Object.assign(x, A.hashClave(b.clave)); cerrarSesiones(x.id, s.k); }
    guardarUsuarios();
    return enviar(res, 200, listaUsuarios());
  }
  if (POST('usuarios/bloquear')) {
    const b = await leerCuerpo(req, 4096);
    const x = USU.find(y => y.id === b.id); if (!x) return error(res, 404, 'Ese usuario no existe.');
    if (x.id === u.id) return error(res, 400, 'No puedes bloquearte a ti mismo.');
    if (x.rol === 'maestro' && !tiene(u, 'sistema.ajustes')) return error(res, 403, 'No puedes bloquear a un maestro.');
    x.estado = b.bloqueado ? 'bloqueado' : 'activo'; if (b.bloqueado) cerrarSesiones(x.id);
    guardarUsuarios(); return enviar(res, 200, listaUsuarios());
  }
  if (POST('usuarios/borrar')) {
    const b = await leerCuerpo(req, 4096);
    const x = USU.find(y => y.id === b.id); if (!x) return error(res, 404, 'Ese usuario no existe.');
    if (x.id === u.id) return error(res, 400, 'No puedes borrar tu propio usuario.');
    if (x.rol === 'maestro' && !tiene(u, 'sistema.ajustes')) return error(res, 403, 'No puedes borrar a un maestro.');
    USU = USU.filter(y => y !== x); cerrarSesiones(x.id);
    // sus inscripciones quedan con su nombre, sin cuenta
    for (const l of Object.values(M.participaciones)) for (const p of l) if (p.uid === x.id) { p.uid = null; p.nombre = x.nombre || x.usuario; p.empleo = x.empleo; }
    guardarUsuarios(); guardarMoral(); return enviar(res, 200, listaUsuarios());
  }
  if (POST('usuarios/codigo')) {
    const b = await leerCuerpo(req, 1024);
    CFG.codigoRegistro = b.nuevo ? crypto.randomBytes(4).toString('hex').toUpperCase().replace(/(.{4})/, '$1-') : '';
    guardarCfg(); return enviar(res, 200, listaUsuarios());
  }

  // ---------------------------------------------------- sistema
  if (!tiene(u, 'sistema.ajustes')) return error(res, 403, 'No tienes permiso para esto.');
  if (ruta === 'ajustes' && m === 'GET') {
    const c = CFG.correo || {};
    return enviar(res, 200, { url: CFG.url, urlDetectada: ultimoOrigen, recordatorios: CFG.recordatorios, horaRecordatorio: CFG.horaRecordatorio, correo: { proveedor: c.proveedor || 'registro', remitente: c.remitente || '', nombre: c.nombre || '', clavePuesta: !!c.clave }, roles: ROLES, permisos: A.PERMISOS });
  }
  if (POST('ajustes')) {
    const b = await leerCuerpo(req, 8192);
    if (b.url !== undefined) { const v = String(b.url || '').trim().replace(/\/+$/, ''); if (v && !/^https?:\/\/[^\s/]+$/.test(v)) return error(res, 400, 'La dirección tiene que ser del tipo https://tudominio.es'); CFG.url = v; }
    if (b.recordatorios !== undefined) CFG.recordatorios = !!b.recordatorios;
    if (b.horaRecordatorio !== undefined) { if (!/^\d\d:\d\d$/.test(b.horaRecordatorio)) return error(res, 400, 'Hora no válida.'); CFG.horaRecordatorio = b.horaRecordatorio; }
    if (b.correo) {
      const c = CFG.correo = CFG.correo || {};
      if (!['registro', 'brevo', 'resend'].includes(b.correo.proveedor)) return error(res, 400, 'Servicio de correo no válido.');
      c.proveedor = b.correo.proveedor; c.remitente = String(b.correo.remitente || '').trim(); c.nombre = A.txt(b.correo.nombre, 80);
      if (c.remitente && !RE_CORREO.test(c.remitente)) return error(res, 400, 'El remitente no parece un correo válido.');
      if (b.correo.clave) c.clave = String(b.correo.clave).trim();
      if (b.correo.borrarClave) delete c.clave;
    }
    guardarCfg();
    return enviar(res, 200, { ok: true });
  }
  if (POST('ajustes/prueba')) {
    if (!u.correo) return error(res, 400, 'Pon tu correo en «Mi cuenta» para recibir la prueba.');
    try {
      await CORREO.enviar({ para: u.correo, nombre: nombreDe(u), asunto: 'Prueba de correo · IIBPAC', titulo: 'El correo funciona', parrafos: ['Si lees esto, los avisos y recordatorios llegarán bien.'], esperar: true });
      return enviar(res, 200, { ok: true, proveedor: (CFG.correo || {}).proveedor || 'registro' });
    } catch (e) { return error(res, 502, 'No se pudo enviar: ' + e.message); }
  }
  if (ruta === 'exportar' && m === 'GET') {
    const copia = JSON.parse(JSON.stringify(M)); delete copia.avisos;
    return enviar(res, 200, copia, { 'Content-Disposition': `attachment; filename="moral-bienestar-${new Date().toISOString().slice(0, 10)}.json"` });
  }
  if (POST('importar')) {
    const b = await leerCuerpo(req, 30e6);
    const avisos = M.avisos;
    try { M = A.importar(b, M); } catch (e) { return error(res, 400, e.message); }
    M.avisos = avisos; M.rev--; guardarMoral();
    console.log(`${new Date().toISOString()} ${u.usuario}: importado (${M.eventos.length} actividades, ${M.apartados.length} apartados)`);
    return enviar(res, 200, { rev: M.rev, datos: vista(u) });
  }
  return error(res, 404, 'No existe.');
}

// ===================================================================== archivos de la página
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const PROHIBIDO = new Set(['servidor', 'tools', 'node_modules', 'iibpac-datos']);
function estatico(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, CABECERAS); return res.end(); }
  let rel; try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400, CABECERAS); return res.end(); }
  const partes = rel.split('/').filter(Boolean);
  // nada de archivos ocultos (.git…), ni el código del servidor, ni datos
  if (partes.some(p => p.startsWith('.') || p.includes('\0')) || PROHIBIDO.has(partes[0]) || /\.(json|ics|md|py|sh|log)$/i.test(rel)) { res.writeHead(404, CABECERAS); return res.end('No existe'); }
  let f = path.join(RAIZ, ...partes);
  if (!f.startsWith(RAIZ)) { res.writeHead(404, CABECERAS); return res.end(); }
  fs.stat(f, (err, st) => {
    if (!err && st.isDirectory()) f = path.join(f, 'index.html');
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
  // usuarios de versiones anteriores: se guardan ya con id y estado
  if (USU.length && A.leerJSON('usuarios.json', []).some(x => !x.id)) guardarUsuarios();
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { A.escribirJSON('sesiones.json', SES); } catch (e) { /* nada */ } process.exit(0); });
process.on('unhandledRejection', e => console.error('Promesa sin atender:', e));

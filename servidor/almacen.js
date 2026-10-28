/* Almacén del servidor: datos de Moral y Bienestar, usuarios y sesiones.
 *
 * Todo se guarda en archivos JSON dentro de la carpeta de datos (por defecto ~/iibpac-datos),
 * FUERA del repositorio, que es público. Nunca subas esa carpeta a GitHub.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DATOS = path.resolve(process.env.IIBPAC_DATOS || path.join(os.homedir(), 'iibpac-datos'));
const F = n => path.join(DATOS, n);

function leerJSON(n, def) {
  try { return JSON.parse(fs.readFileSync(F(n), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return def; throw e; }
}
/** Escritura segura: primero a un temporal y luego se renombra (no deja el archivo a medias). */
function escribirJSON(n, obj) {
  fs.mkdirSync(DATOS, { recursive: true, mode: 0o700 });
  const tmp = F(n) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, F(n));
}
/** Una copia al día de los datos (se guardan las 60 últimas). */
function copiaDiaria(obj) {
  const dir = F('copias'); const hoy = new Date().toISOString().slice(0, 10);
  const f = path.join(dir, `moral-${hoy}.json`);
  if (fs.existsSync(f)) return;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(f, JSON.stringify(obj), { mode: 0o600 });
  const viejas = fs.readdirSync(dir).filter(x => /^moral-\d{4}-\d\d-\d\d\.json$/.test(x)).sort();
  for (const v of viejas.slice(0, Math.max(0, viejas.length - 60))) fs.unlinkSync(path.join(dir, v));
}

// ===================================================================== contraseñas
function hashClave(clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  return { sal, hash: crypto.scryptSync(String(clave), sal, 64).toString('hex') };
}
function comprobarClave(clave, u) {
  if (!u || !u.sal || !u.hash) return false;
  const h = crypto.scryptSync(String(clave), u.sal, 64);
  const b = Buffer.from(u.hash, 'hex');
  return b.length === h.length && crypto.timingSafeEqual(h, b);
}

// ===================================================================== limpieza de datos
/* Lo que llega del navegador se limpia campo a campo: así nadie puede colar HTML, estilos
 * o datos enormes, aunque manipule la página. */
const RE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const RE_FECHA = /^\d{4}-\d\d-\d\d$/;
const RE_MES = /^\d{4}-\d\d$/;
const RE_HORA = /^\d\d:\d\d$/;
const COLORES = ['tomate', 'flamenco', 'mandarina', 'platano', 'salvia', 'albahaca', 'pavo', 'arandano', 'lavanda', 'uva', 'grafito', 'oro'];
const ESTADOS = ['idea', 'encaminado', 'confirmado', 'hecho', 'cancelado'];
const PRIORIDADES = ['', 'Normal', 'Destacada', 'Máxima'];
const txt = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
const id = v => (RE_ID.test(String(v || '')) ? String(v) : null);
const fecha = v => (RE_FECHA.test(String(v || '')) ? String(v) : '');
const sello = v => (/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(String(v || '')) ? String(v) : new Date().toISOString());

function limpiarEvento(e) {
  if (!e || typeof e !== 'object' || !id(e.id)) return null;
  const r = {
    id: e.id, titulo: txt(e.titulo, 200),
    apartados: [...new Set((Array.isArray(e.apartados) ? e.apartados : []).map(id).filter(Boolean))].slice(0, 30),
    inicio: fecha(e.inicio), fin: fecha(e.fin),
    hora: RE_HORA.test(e.hora || '') ? e.hora : '', horaFin: RE_HORA.test(e.horaFin || '') ? e.horaFin : '',
    color: COLORES.includes(e.color) ? e.color : '',
    estado: ESTADOS.includes(e.estado) ? e.estado : 'confirmado',
    prioridad: PRIORIDADES.includes(e.prioridad) ? e.prioridad : '',
    lugar: txt(e.lugar, 300), responsable: txt(e.responsable, 200), notas: txt(e.notas, 8000),
    mes: RE_MES.test(e.mes || '') ? e.mes : '', serie: id(e.serie) || '', mod: sello(e.mod),
  };
  if (r.inicio && (!r.fin || r.fin < r.inicio)) r.fin = r.inicio;
  if (!r.inicio) { r.fin = ''; r.hora = ''; r.horaFin = ''; }
  const i = e.inscripcion || {};
  r.inscripcion = {
    abierta: !!i.abierta,
    plazas: Math.max(0, Math.min(9999, parseInt(i.plazas, 10) || 0)),
    cierre: fecha(i.cierre),
  };
  return r;
}
function limpiarApartado(a) {
  if (!a || typeof a !== 'object' || !id(a.id)) return null;
  const foto = String(a.foto || '');
  const j = a.jefe || {};
  return {
    id: a.id, nombre: txt(a.nombre, 120) || 'Apartado', grupo: txt(a.grupo, 80) || 'Otros',
    icono: /^[a-z]{1,20}$/.test(a.icono || '') ? a.icono : 'circulo',
    color: COLORES.includes(a.color) ? a.color : 'grafito',
    // solo una de las fotos de la página o una imagen subida (JPEG/PNG/WebP en base64)
    foto: /^foto-[a-z0-9-]{1,40}$/.test(foto) || (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto) && foto.length < 3e6) ? foto : 'foto-sierra',
    resumen: txt(a.resumen, 600), notas: txt(a.notas, 20000),
    jefe: { empleo: txt(j.empleo, 40), nombre: txt(j.nombre, 120), contacto: txt(j.contacto, 200) },
    mod: sello(a.mod),
  };
}
function moralVacio() {
  return { formato: 'iibpac-moral', version: 2, rev: 1, titulo: 'Programa de Moral y Bienestar', subtitulo: '', modTitulo: '', apartados: [], eventos: [], borrados: {}, participaciones: {} };
}
/** Pasa un archivo .json de Moral (el de la carpeta compartida) al formato del servidor. */
function importar(d, previo) {
  if (!d || d.formato !== 'iibpac-moral') throw new Error('Ese archivo no es de Moral y Bienestar.');
  const m = moralVacio();
  m.rev = ((previo && previo.rev) || 0) + 1;
  m.titulo = txt(d.titulo, 200) || m.titulo; m.subtitulo = txt(d.subtitulo, 200); m.modTitulo = d.modTitulo ? sello(d.modTitulo) : '';
  m.apartados = (d.apartados || []).map(limpiarApartado).filter(Boolean);
  m.eventos = (d.eventos || []).map(limpiarEvento).filter(Boolean);
  // se conservan las inscripciones de las actividades que siguen existiendo
  const ids = new Set(m.eventos.map(e => e.id));
  const part = (previo && previo.participaciones) || d.participaciones || {};
  for (const k of Object.keys(part)) if (ids.has(k) && Array.isArray(part[k])) m.participaciones[k] = part[k];
  return m;
}

module.exports = {
  DATOS, leerJSON, escribirJSON, copiaDiaria, hashClave, comprobarClave,
  limpiarEvento, limpiarApartado, moralVacio, importar, txt, id, fecha, RE_FECHA,
};

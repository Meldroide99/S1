/* Moral y Bienestar — calendario y apartados.
 *
 * Los datos NO están en la página (que es pública): viven en un archivo .json que se guarda
 * en la carpeta compartida de la unidad. En Edge/Chrome la página escribe directamente en
 * ese archivo cada vez que se cambia algo; si otra persona lo cambia a la vez, se juntan los
 * cambios (gana lo último que se tocó de cada actividad). En otros navegadores se descarga
 * una copia. Solo se guarda en el navegador el «enlace» al archivo (para reabrirlo con un clic)
 * y, mientras la pestaña esté abierta, una copia de seguridad.
 */
(function () {
  'use strict';
  const C = window.Comun;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = C.esc;
  let U = null; // utilidades de la página (pintar, toast, animarEntrada…), se reciben en vista()

  // ===================================================================== catálogos
  const COLORES = [
    { k: 'tomate', n: 'Tomate', v: '#D50000' }, { k: 'flamenco', n: 'Flamenco', v: '#E67C73' },
    { k: 'mandarina', n: 'Mandarina', v: '#F4511E' }, { k: 'platano', n: 'Plátano', v: '#F6BF26' },
    { k: 'salvia', n: 'Salvia', v: '#33B679' }, { k: 'albahaca', n: 'Albahaca', v: '#0B8043' },
    { k: 'pavo', n: 'Pavo real', v: '#039BE5' }, { k: 'arandano', n: 'Arándano', v: '#3F51B5' },
    { k: 'lavanda', n: 'Lavanda', v: '#7986CB' }, { k: 'uva', n: 'Uva', v: '#8E24AA' },
    { k: 'grafito', n: 'Grafito', v: '#616161' }, { k: 'oro', n: 'Oro', v: '#9A7642' },
  ];
  const colorDe = k => (COLORES.find(c => c.k === k) || COLORES[COLORES.length - 1]).v;
  const textoSobre = hex => { const n = parseInt(hex.slice(1), 16); const l = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)); return l > 168 ? '#1D1D1D' : '#fff'; };
  const ESTADOS = [
    { k: 'idea', n: 'Idea' }, { k: 'encaminado', n: 'Encaminado' }, { k: 'confirmado', n: 'Confirmado' },
    { k: 'hecho', n: 'Hecho' }, { k: 'cancelado', n: 'Cancelado' },
  ];
  const nombreEstado = k => (ESTADOS.find(e => e.k === k) || ESTADOS[2]).n;
  const PRIORIDADES = ['', 'Normal', 'Destacada', 'Máxima'];
  const FOTOS = [
    { k: 'foto-sierra', n: 'Sierra' }, { k: 'foto-c295', n: 'C-295' }, { k: 'foto-puerta', n: 'Puerta' },
    { k: 'foto-a400m-salto', n: 'A400M' }, { k: 'foto-lanzamiento-masivo', n: 'Lanzamiento' },
  ];
  const urlFoto = f => (!f ? 'assets/img/foto-sierra.jpg' : /^data:/.test(f) ? f : `assets/img/${f}.jpg`);
  const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONOS = {
    balon: P('<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M21 10.5l-5-.5M18 19l-3.5-4.5M6 19l3.5-4.5M3 10.5l5-.5"/>'),
    carrera: P('<path d="M13 4a2 2 0 1 0 0-.01"/><path d="m7 21 3-6 3 2v4M6 12l3-4 4 1 3 3 3 1M10 15l-1-4"/>'),
    montana: P('<path d="m3 20 6.5-11 4 6.5L16 12l5 8z"/><path d="m8 11.5 1.5 1.5 1.5-1.5"/>'),
    pasos: P('<path d="M7 4c1.7 0 2.5 1.6 2.5 3.5S8.7 12 7 12s-2.5-2.6-2.5-4.5S5.3 4 7 4zM5 14h4v2.5a2 2 0 0 1-4 0zM17 8c1.7 0 2.5 1.6 2.5 3.5S18.7 16 17 16s-2.5-2.6-2.5-4.5S15.3 8 17 8zM15 18h4v.5a2 2 0 0 1-4 0z"/>'),
    libro: P('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>'),
    cine: P('<rect x="3" y="8" width="18" height="12" rx="1.5"/><path d="m3 8 2.5-4.5L20 3l1 5M8 3.5 10 8M13.5 3.2 15.5 8"/>'),
    ajedrez: P('<path d="M7 21h10M8 18h8l-1-7H9zM9 11V6h1.5V4h1v2h1V4h1v2H15v5"/>'),
    trofeo: P('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 21h8M9.5 17h5"/>'),
    estrella: P('<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>'),
    cruz: P('<path d="M10.5 3h3v5h5v3h-5v10h-3V11h-5V8h5z"/>'),
    vela: P('<path d="M9 10h6v11H9zM12 10V7"/><path d="M12 7c-1.5-1.3-1.5-3 0-4.5 1.5 1.5 1.5 3.2 0 4.5z"/>'),
    corazon: P('<path d="M12 20s-7.5-4.6-9-9.3C2 7.5 4 4.5 7.2 4.5c2 0 3.5 1.2 4.8 3 1.3-1.8 2.8-3 4.8-3C20 4.5 22 7.5 21 10.7 19.5 15.4 12 20 12 20z"/>'),
    birrete: P('<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c2.5 2.5 9.5 2.5 12 0v-5M22 9v6"/>'),
    galon: P('<path d="m4 9 8-5 8 5M4 14l8-5 8 5M4 19l8-5 8 5"/>'),
    autobus: P('<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M7 18v3M17 18v3M7.5 14.5h.01M16.5 14.5h.01"/>'),
    castillo: P('<path d="M4 21V8h3V5h2v3h2V5h2v3h2V5h2v3h3v13zM10 21v-5h4v5"/>'),
    casa: P('<path d="m3 11 9-7 9 7"/><path d="M5 9.5V21h14V9.5M10 21v-6h4v6"/>'),
    fiesta: P('<path d="M4 20 9 7l8 8z"/><path d="M14 4v2M19 9h2M17.5 5.5 19 4M13 9c1-1 1.5-2.5 1-4M15 11c1-1 2.5-1.5 4-1"/>'),
    camiseta: P('<path d="M8 3 3 6l2 4 2.5-1V21h9V9l2.5 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/>'),
    avion: P('<path d="M21 15.5 13.5 11V5a1.5 1.5 0 0 0-3 0v6L3 15.5V17l7.5-2v4l-2 1.5V22l3.5-1 3.5 1v-1.5l-2-1.5v-4l7.5 2z"/>'),
    circulo: P('<circle cx="12" cy="12" r="8"/>'),
  };
  const icono = k => ICONOS[k] || ICONOS.circulo;
  const SVG = {
    mas: P('<path d="M12 5v14M5 12h14"/>'), izq: P('<path d="m15 18-6-6 6-6"/>'), der: P('<path d="m9 18 6-6-6-6"/>'),
    lapiz: P('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>'), papelera: P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    copiar: P('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    cerrar: P('<path d="M6 6l12 12M18 6 6 18"/>'), reloj: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    lugar: P('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    persona: P('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'), nota: P('<path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/>'),
    archivo: P('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
    abajo: P('<path d="M12 4v12M6 11l6 6 6-6M5 21h14"/>'), puntos: P('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    imprimir: P('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'),
    cal: P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'), foto: P('<rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/>'),
    ajustes: P('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    check: P('<path d="m5 12 4.5 4.5L19 7"/>'), bandera: P('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'), buscar: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  };

  // ===================================================================== fechas (texto AAAA-MM-DD)
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIAS_CORTOS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
  const pad = n => String(n).padStart(2, '0');
  const aTxt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const deTxt = t => { const [a, m, d] = t.split('-').map(Number); return new Date(a, m - 1, d); };
  const hoyTxt = () => aTxt(new Date());
  const sumar = (t, n) => { const d = deTxt(t); d.setDate(d.getDate() + n); return aTxt(d); };
  const entre = (a, b) => Math.round((deTxt(b) - deTxt(a)) / 864e5);
  const lunesDe = t => { const d = deTxt(t); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return aTxt(d); };
  const mesTxt = t => t.slice(0, 7);
  const nombreMes = m => { const [a, mm] = m.split('-').map(Number); return `${MESES[mm - 1]} ${a}`; };
  const mesMas = (m, n) => { const [a, mm] = m.split('-').map(Number); const d = new Date(a, mm - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const fechaLarga = t => { const d = deTxt(t); return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' de ' + d.getFullYear() : ''}`; };
  const fechaCorta = t => { const d = deTxt(t); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
  const may = s => s.charAt(0).toUpperCase() + s.slice(1);
  function textoFechas(e) {
    if (!e.inicio) return e.mes ? `Por programar · ${nombreMes(e.mes)}` : 'Por programar';
    const h = e.hora ? ` · ${e.hora}${e.horaFin ? '–' + e.horaFin : ''}` : ' · Todo el día';
    if (e.fin && e.fin !== e.inicio) return `${may(fechaLarga(e.inicio))} – ${fechaLarga(e.fin)}${e.hora ? h : ''}`;
    return may(fechaLarga(e.inicio)) + h;
  }

  // ===================================================================== datos y guardado
  const E = {
    datos: null, archivo: null, nombre: '', ultimaMod: 0, sucio: false, guardando: false, guardadoEn: 0, error: '',
    mes: mesTxt(hoyTxt()), vista: innerWidth < 720 ? 'agenda' : 'mes', ocultos: new Set(), buscar: '', pasadas: false,
  };
  const COPIA = 'iibpac.moral.copia'; // sessionStorage: se borra al cerrar la pestaña
  const nuevoId = p => p + Math.random().toString(36).slice(2, 10);
  const ahora = () => new Date().toISOString();

  function normalizar(d) {
    if (!d || d.formato !== 'iibpac-moral') throw new Error('Este archivo no es de Moral y Bienestar.');
    d.apartados = (d.apartados || []).map(a => Object.assign({ id: nuevoId('a_'), nombre: 'Apartado', grupo: 'Otros', icono: 'circulo', color: 'grafito', foto: 'foto-sierra', resumen: '', notas: '', mod: ahora() }, a, { jefe: Object.assign({ empleo: '', nombre: '', contacto: '' }, a.jefe || {}) }));
    d.eventos = (d.eventos || []).map(e => Object.assign({ id: nuevoId('e'), titulo: '', apartados: [], inicio: '', fin: '', hora: '', horaFin: '', color: '', estado: 'confirmado', prioridad: '', lugar: '', responsable: '', notas: '', mes: '', mod: ahora() }, e));
    for (const e of d.eventos) { if (e.inicio && (!e.fin || e.fin < e.inicio)) e.fin = e.inicio; if (!e.inicio) e.fin = ''; }
    d.borrados = d.borrados || {};
    d.titulo = d.titulo || 'Programa de Moral y Bienestar'; d.subtitulo = d.subtitulo || '';
    return d;
  }
  function vacio() { return normalizar({ formato: 'iibpac-moral', version: 1, titulo: 'Programa de Moral y Bienestar', subtitulo: '', apartados: [], eventos: [], borrados: {} }); }

  /** Junta dos versiones: de cada apartado/actividad gana la que se tocó más tarde; lo borrado se queda borrado. */
  function fusionar(a, b) {
    const r = Object.assign({}, a);
    r.borrados = Object.assign({}, b.borrados, a.borrados);
    for (const k in b.borrados) if (!a.borrados[k] || a.borrados[k] < b.borrados[k]) r.borrados[k] = b.borrados[k];
    for (const lista of ['apartados', 'eventos']) {
      const m = new Map();
      for (const x of [...b[lista], ...a[lista]]) { const y = m.get(x.id); if (!y || (x.mod || '') >= (y.mod || '')) m.set(x.id, x); }
      r[lista] = [...m.values()].filter(x => !(r.borrados[x.id] && r.borrados[x.id] >= (x.mod || '')));
    }
    if ((b.modTitulo || '') > (a.modTitulo || '')) { r.titulo = b.titulo; r.subtitulo = b.subtitulo; r.modTitulo = b.modTitulo; }
    return r;
  }

  // enlace al archivo en IndexedDB (solo Edge/Chrome); así se reabre con un clic
  function idb(modo, valor) {
    return new Promise(res => {
      try {
        const rq = indexedDB.open('iibpac-moral', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('k');
        rq.onerror = () => res(null);
        rq.onsuccess = () => {
          try {
            const tx = rq.result.transaction('k', modo === 'leer' ? 'readonly' : 'readwrite'); const st = tx.objectStore('k');
            const op = modo === 'leer' ? st.get('archivo') : modo === 'borrar' ? st.delete('archivo') : st.put(valor, 'archivo');
            op.onsuccess = () => res(op.result || null); op.onerror = () => res(null);
          } catch (e) { res(null); }
        };
      } catch (e) { res(null); }
    });
  }
  // En ordenadores corporativos el acceso directo a archivos suele estar bloqueado por directiva:
  // entonces se usa el «modo clásico» (el mismo explorador que el botón del Excel + descargar copia).
  const CLASICO = 'iibpac.moral.clasico';
  let clasico = (() => { try { return sessionStorage.getItem(CLASICO) === '1' || localStorage.getItem(CLASICO) === '1'; } catch (e) { return false; } })();
  function pasarAClasico() {
    clasico = true;
    try { sessionStorage.setItem(CLASICO, '1'); localStorage.setItem(CLASICO, '1'); } catch (e) { /* nada */ }
    const b = $('[data-mb="guardar-como"]'); if (b) b.remove();
  }
  const puedeEscribir = () => !clasico && 'showOpenFilePicker' in window;
  /** ¿El selector ha fallado por bloqueo (no porque la persona haya cancelado)? */
  const bloqueado = (e, t0) => e && (e.name !== 'AbortError' || Date.now() - t0 < 400);
  function explorador() { const i = $('#mb-archivo-input'); if (i) i.click(); }

  async function permiso(h, pedir) {
    try {
      const o = { mode: 'readwrite' };
      if ((await h.queryPermission(o)) === 'granted') return true;
      return pedir ? (await h.requestPermission(o)) === 'granted' : false;
    } catch (e) { return false; }
  }
  async function leerArchivo(h) {
    const f = await h.getFile();
    return { datos: normalizar(JSON.parse(await f.text())), mod: f.lastModified, nombre: f.name };
  }
  async function usarArchivo(h) {
    const r = await leerArchivo(h);
    Object.assign(E, { datos: r.datos, archivo: h, nombre: r.nombre, ultimaMod: r.mod, sucio: false, error: '', guardadoEn: Date.now() });
    await permiso(h, true);
    idb('poner', h);
    copiaSesion(); repintar(true);
    U.toast(`Abierto «${r.nombre}». Los cambios se guardan solos en ese archivo.`);
  }
  async function abrir() {
    if (!puedeEscribir()) { explorador(); return; }
    const t0 = Date.now(); let h;
    try {
      [h] = await window.showOpenFilePicker({ id: 'iibpac-moral', types: [{ description: 'Moral y Bienestar (.json)', accept: { 'application/json': ['.json'] } }] });
    } catch (e) {
      if (!bloqueado(e, t0)) return; // la persona ha cancelado
      console.warn('Selector de archivos bloqueado, paso al modo clásico:', e);
      pasarAClasico();
      explorador();
      U.toast('Este ordenador no deja el acceso directo a archivos: uso el explorador normal. Al terminar, pulsa «Descargar copia». Si no se abre, pulsa otra vez «Abrir archivo».');
      return;
    }
    try { await usarArchivo(h); } catch (e) { U.toast(e.message || 'No se pudo abrir el archivo.', 'error'); }
  }
  async function reabrir() {
    const h = await idb('leer'); if (!h) return abrir();
    try { await permiso(h, true); await usarArchivo(h); } catch (e) { idb('borrar'); U.toast('No encuentro el archivo de la última vez (¿se ha movido?). Ábrelo otra vez.', 'error'); abrir(); }
  }
  /** Abrir sin poder escribir en él (Firefox o archivo soltado): se trabaja y se descarga la copia. */
  async function abrirLectura(file) {
    try {
      const d = normalizar(JSON.parse(await file.text()));
      Object.assign(E, { datos: d, archivo: null, nombre: file.name, sucio: false, error: '', guardadoEn: 0 });
      copiaSesion(); repintar(true);
      U.toast(puedeEscribir() ? `Abierto «${file.name}». Para que se guarde solo, ábrelo con «Abrir archivo».` : `Abierto «${file.name}». Al terminar, pulsa «Descargar copia».`);
    } catch (e) { U.toast(e.message || 'No se pudo leer el archivo.', 'error'); }
  }
  async function guardarComo() {
    if (clasico || !('showSaveFilePicker' in window)) return descargar();
    const t0 = Date.now(); let h;
    try {
      h = await window.showSaveFilePicker({ id: 'iibpac-moral', suggestedName: E.nombre || 'moral-bienestar.json', types: [{ description: 'Moral y Bienestar (.json)', accept: { 'application/json': ['.json'] } }] });
    } catch (e) {
      if (!bloqueado(e, t0)) return;
      console.warn('Guardar como bloqueado, paso al modo clásico:', e);
      pasarAClasico();
      return descargar();
    }
    try {
      E.archivo = h; E.ultimaMod = 0; E.nombre = h.name; idb('poner', h);
      await escribir(true);
    } catch (e) { U.toast(e.message || 'No se pudo guardar.', 'error'); }
  }
  function descargar() {
    E.datos.guardado = ahora();
    U.descargar(new Blob([JSON.stringify(E.datos, null, 1)], { type: 'application/json' }), E.nombre || 'moral-bienestar.json');
    if (!E.archivo) { E.sucio = false; E.guardadoEn = Date.now(); pintarEstado(); }
    U.toast('Copia descargada. Guárdala en la carpeta compartida (sustituye a la anterior).');
  }
  function copiaSesion() { try { sessionStorage.setItem(COPIA, JSON.stringify({ d: E.datos, nombre: E.nombre })); } catch (e) { /* lleno o privado */ } }

  let tGuardar = null;
  /** Llamar tras cualquier cambio. */
  function cambio(opts) {
    E.sucio = true; copiaSesion();
    clearTimeout(tGuardar); tGuardar = setTimeout(() => escribir(false), 700);
    pintarEstado();
    if (!opts || opts.repintar !== false) repintar();
  }
  async function escribir(pedir) {
    if (!E.archivo || E.guardando) { pintarEstado(); return; }
    if (!(await permiso(E.archivo, pedir))) { E.error = 'permiso'; pintarEstado(); return; }
    E.guardando = true; pintarEstado();
    try {
      // si otra persona lo ha guardado mientras, se juntan los cambios antes de escribir
      if (E.ultimaMod) {
        const f = await E.archivo.getFile();
        if (f.lastModified !== E.ultimaMod) {
          const otro = normalizar(JSON.parse(await f.text()));
          E.datos = fusionar(E.datos, otro);
          U.toast('Alguien más había guardado cambios: se han juntado con los tuyos.');
          repintar();
        }
      }
      E.datos.guardado = ahora();
      const w = await E.archivo.createWritable();
      await w.write(JSON.stringify(E.datos, null, 1)); await w.close();
      E.ultimaMod = (await E.archivo.getFile()).lastModified;
      E.sucio = false; E.error = ''; E.guardadoEn = Date.now();
    } catch (e) { console.error(e); E.error = e.message || 'error'; }
    E.guardando = false; pintarEstado();
  }
  // mirar cada 20 s si alguien ha cambiado el archivo compartido
  setInterval(async () => {
    if (!E.archivo || E.guardando || E.sucio || document.hidden || $('.mb-modal, .mb-pop')) return;
    if (!location.hash.startsWith('#/moral')) return;
    try {
      if (!(await permiso(E.archivo, false))) return;
      const f = await E.archivo.getFile();
      if (f.lastModified !== E.ultimaMod) {
        E.datos = fusionar(normalizar(JSON.parse(await f.text())), E.datos); E.ultimaMod = f.lastModified;
        copiaSesion(); repintar(); U.toast('Calendario actualizado con cambios de otra persona.');
      }
    } catch (e) { /* red caída: ya se reintentará */ }
  }, 20000);
  window.addEventListener('beforeunload', e => { if (E.datos && E.sucio && !E.archivo) { e.preventDefault(); e.returnValue = ''; } });
  // tras recargar la pestaña, se recupera lo que había
  try { const c = JSON.parse(sessionStorage.getItem(COPIA) || 'null'); if (c && c.d) { E.datos = normalizar(c.d); E.nombre = c.nombre || ''; } } catch (e) { /* nada */ }

  // ===================================================================== consultas
  const apartado = id => E.datos.apartados.find(a => a.id === id);
  const apPrincipal = e => e.apartados.map(apartado).find(Boolean);
  const colorEv = e => e.color ? colorDe(e.color) : (apPrincipal(e) ? colorDe(apPrincipal(e).color) : colorDe('grafito'));
  function visibles(filtro) {
    const q = C.norm(E.buscar);
    return E.datos.eventos.filter(e => {
      if (filtro) { if (!e.apartados.includes(filtro)) return false; }
      else if (e.apartados.length ? e.apartados.every(id => E.ocultos.has(id)) : E.ocultos.has('_sin')) return false;
      if (q && !C.norm([e.titulo, e.lugar, e.notas, ...e.apartados.map(id => apartado(id)?.nombre || '')].join(' ')).includes(q)) return false;
      return true;
    });
  }
  const ordenar = l => l.sort((a, b) => (a.inicio || '9') .localeCompare(b.inicio || '9') || (a.hora || '').localeCompare(b.hora || '') || (b.fin || '').localeCompare(a.fin || '') || a.titulo.localeCompare(b.titulo, 'es'));
  const jefeTxt = a => [a.jefe.empleo, a.jefe.nombre].filter(Boolean).join(' ');
  function grupos() {
    const g = []; for (const a of E.datos.apartados) if (!g.includes(a.grupo || 'Otros')) g.push(a.grupo || 'Otros');
    return g;
  }

  // ===================================================================== mutaciones
  function guardarEvento(e) {
    e.mod = ahora();
    const i = E.datos.eventos.findIndex(x => x.id === e.id);
    if (i >= 0) E.datos.eventos[i] = e; else E.datos.eventos.push(e);
    delete E.datos.borrados[e.id];
    cambio();
  }
  function borrarEvento(id, sinDeshacer) {
    const i = E.datos.eventos.findIndex(x => x.id === id); if (i < 0) return;
    const [e] = E.datos.eventos.splice(i, 1); E.datos.borrados[id] = ahora();
    cambio();
    if (!sinDeshacer) avisoDeshacer(`«${e.titulo || 'Sin título'}» eliminado.`, () => { delete E.datos.borrados[id]; guardarEvento(e); });
  }
  function guardarApartado(a) { a.mod = ahora(); delete E.datos.borrados[a.id]; if (!apartado(a.id)) E.datos.apartados.push(a); cambio(); }

  // ===================================================================== interfaz común
  function avisoDeshacer(txt, fn) {
    const t = document.createElement('div'); t.className = 'toast mb-toast';
    t.innerHTML = `<span>${esc(txt)}</span><button type="button">Deshacer</button>`;
    $('button', t).onclick = () => { fn(); t.remove(); };
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), 7000);
  }
  function cerrarFlotantes() { $$('.mb-pop').forEach(p => p.remove()); }
  /** Ventanita flotante junto a un elemento (como en Google Calendar). */
  function popover(ancla, html, clase) {
    const r = ancla.getBoundingClientRect ? ancla.getBoundingClientRect() : ancla; // antes de cerrar (el ancla puede estar en otra ventanita)
    cerrarFlotantes();
    const p = document.createElement('div'); p.className = 'mb-pop ' + (clase || ''); p.innerHTML = html;
    p.setAttribute('role', 'dialog');
    document.body.appendChild(p);
    const w = p.offsetWidth, h = p.offsetHeight, m = 10;
    let x = r.right + m; if (x + w > innerWidth - m) x = r.left - w - m; if (x < m) x = Math.max(m, Math.min(innerWidth - w - m, r.left));
    let y = r.top; if (y + h > innerHeight - m) y = innerHeight - h - m; if (y < m + 64) y = Math.min(innerHeight - h - m, Math.max(m + 64, r.bottom + m));
    p.style.left = x + 'px'; p.style.top = y + 'px';
    setTimeout(() => { const f = $('[autofocus]', p); if (f) f.focus(); }, 30);
    return p;
  }
  document.addEventListener('mousedown', e => { if ($('.mb-pop') && !e.target.closest('.mb-pop') && !e.target.closest('.mb-modal')) cerrarFlotantes(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('.mb-pop')) { cerrarFlotantes(); return; }
    const m = $('.mb-modal'); if (m) m.remove();
  });
  function modal(html, clase) {
    cerrarFlotantes(); $$('.mb-modal').forEach(m => m.remove());
    const m = document.createElement('div'); m.className = 'mb-modal';
    m.innerHTML = `<div class="mb-modal-caja ${clase || ''}" role="dialog" aria-modal="true">${html}</div>`;
    m.addEventListener('mousedown', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    setTimeout(() => { const f = $('[autofocus]', m); if (f) { f.focus(); if (f.select) f.select(); } }, 30);
    return m;
  }
  const chipAp = a => `<span class="mb-chip-ap" style="--c:${colorDe(a.color)}"><i></i>${esc(a.nombre)}</span>`;
  const chipEstado = k => `<span class="mb-estado mb-est-${k}">${k === 'hecho' ? SVG.check : ''}${esc(nombreEstado(k))}</span>`;

  // ===================================================================== barra del archivo
  function htmlBarraArchivo() {
    return `<div class="mb-barra" id="mb-barra"><div class="contenedor mb-barra-in">
      <span class="mb-estado-archivo" id="mb-estado-archivo"></span>
      <span class="mb-barra-acc">
        <button class="btn suave peq" type="button" data-mb="abrir">${SVG.archivo}Abrir archivo</button>
        ${E.datos && !clasico && 'showSaveFilePicker' in window ? `<button class="btn suave peq" type="button" data-mb="guardar-como">Guardar como…</button>` : ''}
        ${E.datos ? `<button class="btn suave peq" type="button" data-mb="descargar">${SVG.abajo}Descargar copia</button>` : ''}
      </span></div></div>`;
  }
  function pintarEstado() {
    const el = $('#mb-estado-archivo'); if (!el) return;
    let cls = 'gris', txt = '';
    if (!E.datos) txt = 'Sin archivo abierto';
    else if (E.error === 'permiso') { cls = 'aviso'; txt = `<b>${esc(E.nombre)}</b> · falta permiso para guardar <button class="enlace" type="button" data-mb="permiso">Permitir</button>`; }
    else if (E.error) { cls = 'error'; txt = `No se pudo guardar en <b>${esc(E.nombre)}</b> (${esc(E.error)}). <button class="enlace" type="button" data-mb="reintentar">Reintentar</button> · <button class="enlace" type="button" data-mb="descargar">Descargar copia</button>`; }
    else if (E.archivo) { cls = E.sucio || E.guardando ? 'aviso' : 'ok'; txt = `<b>${esc(E.nombre)}</b> · ${E.guardando ? 'guardando…' : E.sucio ? 'cambios pendientes…' : 'guardado ' + haceCuanto(E.guardadoEn)}`; }
    else { cls = E.sucio ? 'aviso' : 'gris'; txt = `<b>${esc(E.nombre || 'Sin archivo')}</b> · ${E.sucio ? 'cambios sin guardar: pulsa «Descargar copia» antes de cerrar' : 'sin cambios'}`; }
    el.className = 'mb-estado-archivo ' + cls; el.innerHTML = `<i></i><span>${txt}</span>`;
  }
  const haceCuanto = t => { const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'ahora mismo' : s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : 'a las ' + new Date(t).toTimeString().slice(0, 5); };
  setInterval(pintarEstado, 15000);

  // ===================================================================== calendario
  /* Componente: barra lateral (crear, minimes, apartados, por programar) + mes o agenda.
   * filtro = id de apartado (dentro de un apartado) o null (calendario principal). */
  function htmlCalendario(filtro) {
    return `<div class="mb-cal ${filtro ? 'mb-cal-ap' : ''}" data-filtro="${filtro || ''}">
      ${filtro ? '' : `<aside class="mb-lateral">
        <button class="mb-crear" type="button" data-mb="crear">${SVG.mas}<span>Crear</span></button>
        <div class="mb-minimes" id="mb-minimes"></div>
        <div class="mb-lat-bloque"><h4>Por programar <small>arrástralas a un día</small></h4><div id="mb-sinfecha" class="mb-sinfecha"></div></div>
        <details class="mb-lat-bloque mb-lat-filtros" open><summary><h4>Apartados</h4></summary><div id="mb-filtros"></div></details>
      </aside>`}
      <div class="mb-cal-main">
        <div class="mb-cal-barra">
          <button class="btn suave peq" type="button" data-cal="hoy">Hoy</button>
          <span class="mb-flechas"><button type="button" data-cal="-1" aria-label="Mes anterior">${SVG.izq}</button><button type="button" data-cal="1" aria-label="Mes siguiente">${SVG.der}</button></span>
          <h3 class="mb-cal-titulo" id="mb-cal-titulo"></h3>
          <span class="mb-cal-der">
            ${filtro ? `<button class="btn oro peq" type="button" data-mb="crear">${SVG.mas}Añadir fecha</button>` : `<label class="mb-buscar">${SVG.buscar}<input type="search" id="mb-buscar" placeholder="Buscar" value="${esc(E.buscar)}" aria-label="Buscar actividad"></label>`}
            <span class="mb-vistas" role="group" aria-label="Vista"><button type="button" data-vista="mes">Mes</button><button type="button" data-vista="agenda">Agenda</button></span>
            ${filtro ? '' : `<button class="mb-icono" type="button" data-mb="menu" aria-label="Más opciones" title="Más opciones">${SVG.puntos}</button>`}
          </span>
        </div>
        <div class="mb-cal-cuerpo" id="mb-cal-cuerpo"></div>
      </div>
    </div>`;
  }
  function pintarCalendario(raiz) {
    const cal = $('.mb-cal', raiz); if (!cal) return;
    const filtro = cal.dataset.filtro || null;
    $('#mb-cal-titulo', cal).textContent = may(nombreMes(E.mes));
    $$('[data-vista]', cal).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vista === E.vista)));
    const cuerpo = $('#mb-cal-cuerpo', cal);
    cuerpo.innerHTML = E.vista === 'agenda' ? htmlAgenda(filtro) : htmlMes(filtro);
    if (E.vista === 'mes') colocarBarras(cuerpo, filtro);
    if (!filtro) { pintarMinimes(); pintarFiltros(); pintarSinFecha(); }
  }

  function semanasDelMes(mes) {
    const ini = lunesDe(mes + '-01');
    const ult = sumar(mesMas(mes, 1) + '-01', -1);
    const n = Math.ceil((entre(ini, ult) + 1) / 7);
    return Array.from({ length: n }, (_, i) => sumar(ini, i * 7));
  }
  function htmlMes(filtro) {
    const hoy = hoyTxt();
    const sem = semanasDelMes(E.mes);
    return `<div class="mb-mes" style="--semanas:${sem.length}">
      <div class="mb-mes-cab">${DIAS_CORTOS.map(d => `<span>${d}</span>`).join('')}</div>
      ${sem.map(w => `<div class="mb-semana" data-semana="${w}">
        <div class="mb-dias">${Array.from({ length: 7 }, (_, i) => { const t = sumar(w, i); const d = deTxt(t);
          return `<div class="mb-dia${mesTxt(t) !== E.mes ? ' fuera' : ''}${t === hoy ? ' hoy' : ''}${i >= 5 ? ' finde' : ''}" data-dia="${t}"><span class="mb-num">${d.getDate() === 1 ? `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}` : d.getDate()}</span></div>`; }).join('')}</div>
        <div class="mb-barras"></div>
      </div>`).join('')}
    </div>`;
  }
  /* Coloca las actividades de cada semana en carriles (las de varios días en una barra). */
  function colocarBarras(cuerpo, filtro) {
    const eventos = ordenar(visibles(filtro).filter(e => e.inicio));
    for (const fila of $$('.mb-semana', cuerpo)) {
      const w = fila.dataset.semana, fin = sumar(w, 6);
      const alto = $('.mb-dia', fila).clientHeight || 110;
      const max = Math.max(1, Math.floor((alto - 30) / 23) - 1);
      const carriles = []; const ocultas = Array(7).fill(0); let html = '';
      const evs = eventos.filter(e => e.inicio <= fin && (e.fin || e.inicio) >= w)
        .sort((a, b) => (a.inicio < w ? w : a.inicio).localeCompare(b.inicio < w ? w : b.inicio) || entre(b.inicio, b.fin) - entre(a.inicio, a.fin) || (a.hora || '').localeCompare(b.hora || ''));
      for (const e of evs) {
        const s = Math.max(0, entre(w, e.inicio)), f = Math.min(6, entre(w, e.fin || e.inicio));
        let c = 0; while (carriles[c] && carriles[c].some(x => x >= s && x <= f)) c++;
        (carriles[c] = carriles[c] || []).push(...Array.from({ length: f - s + 1 }, (_, i) => s + i));
        if (c >= max) { for (let i = s; i <= f; i++) ocultas[i]++; continue; }
        const col = colorEv(e), varios = f > s || e.fin !== e.inicio, sinHora = !e.hora;
        const corteIzq = e.inicio < w, corteDer = (e.fin || e.inicio) > fin;
        const clases = ['mb-ev', varios || sinHora ? 'lleno' : 'punto', 'est-' + e.estado, corteIzq ? 'corte-izq' : '', corteDer ? 'corte-der' : ''].join(' ');
        html += `<div role="button" tabindex="0" class="${clases}" draggable="true" data-ev="${e.id}" style="--c:${col};--t:${textoSobre(col)};left:calc(${s} * 100% / 7 + 3px);width:calc(${f - s + 1} * 100% / 7 - 6px);top:${28 + c * 23}px" title="${esc(e.titulo)}">
          ${!varios && !sinHora ? `<i class="mb-ev-punto"></i><span class="mb-ev-hora">${esc(e.hora)}</span>` : ''}${e.prioridad === 'Máxima' ? '<b class="mb-ev-max">●</b>' : ''}<span class="mb-ev-tit">${esc(e.titulo || '(Sin título)')}</span></div>`;
      }
      ocultas.forEach((n, i) => { if (n) html += `<button type="button" class="mb-mas" data-masdia="${sumar(w, i)}" style="left:calc(${i} * 100% / 7 + 3px);width:calc(100% / 7 - 6px);top:${28 + max * 23}px">+${n}<span class="mb-mas-txt"> más</span></button>`; });
      $('.mb-barras', fila).innerHTML = html;
    }
  }
  function htmlAgenda(filtro) {
    const hoy = hoyTxt();
    const desde = E.pasadas ? '0000' : (E.mes + '-01' < hoy ? E.mes + '-01' : hoy);
    const l = ordenar(visibles(filtro).filter(e => e.inicio && (e.fin || e.inicio) >= desde));
    if (!l.length) return `<div class="mb-vacio">${filtro ? 'Este apartado aún no tiene fechas.' : 'No hay actividades con fecha desde aquí.'}<br><button class="btn oro peq" type="button" data-mb="crear">${SVG.mas}Añadir una</button></div>`;
    let html = '', mesAnt = '';
    const porDia = {};
    for (const e of l) { const k = e.inicio < desde ? desde : e.inicio; (porDia[k] = porDia[k] || []).push(e); }
    for (const dia of Object.keys(porDia).sort()) {
      const m = mesTxt(dia);
      if (m !== mesAnt) { html += `<h4 class="mb-ag-mes">${may(nombreMes(m))}</h4>`; mesAnt = m; }
      const d = deTxt(dia);
      html += `<div class="mb-ag-dia${dia === hoy ? ' hoy' : ''}"><div class="mb-ag-fecha"><b>${d.getDate()}</b><span>${DIAS[d.getDay()].slice(0, 3)}</span></div><div class="mb-ag-lista">${porDia[dia].map(e => {
        const a = apPrincipal(e);
        return `<button type="button" class="mb-ag-ev est-${e.estado}" data-ev="${e.id}" style="--c:${colorEv(e)}"><i></i>
          <span class="mb-ag-hora">${e.fin !== e.inicio ? fechaCorta(e.inicio) + ' – ' + fechaCorta(e.fin) : e.hora ? esc(e.hora + (e.horaFin ? '–' + e.horaFin : '')) : 'Todo el día'}</span>
          <span class="mb-ag-tit">${esc(e.titulo || '(Sin título)')}${e.prioridad === 'Máxima' ? ' <b class="mb-ev-max">●</b>' : ''}</span>
          <span class="mb-ag-meta">${a && !filtro ? `<span class="mb-ag-ap">${esc(a.nombre)}${jefeTxt(a) ? ' · ' + esc(jefeTxt(a)) : ''}</span>` : ''}${e.estado !== 'confirmado' ? chipEstado(e.estado) : ''}</span></button>`;
      }).join('')}</div></div>`;
    }
    return `<div class="mb-agenda">${html}<p class="mb-ag-pie"><button class="enlace" type="button" data-mb="pasadas">${E.pasadas ? 'Ocultar las pasadas' : 'Ver también las pasadas'}</button></p></div>`;
  }
  function pintarMinimes() {
    const el = $('#mb-minimes'); if (!el) return;
    const hoy = hoyTxt(); const con = new Set();
    for (const e of visibles(null)) if (e.inicio) for (let t = e.inicio; t <= e.fin && entre(e.inicio, t) < 60; t = sumar(t, 1)) con.add(t);
    el.innerHTML = `<div class="mb-mm-cab"><b>${may(nombreMes(E.mes))}</b><span><button type="button" data-cal="-1" aria-label="Mes anterior">${SVG.izq}</button><button type="button" data-cal="1" aria-label="Mes siguiente">${SVG.der}</button></span></div>
      <div class="mb-mm-rejilla">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => `<span class="mb-mm-d">${x}</span>`).join('')}
      ${semanasDelMes(E.mes).flatMap(w => Array.from({ length: 7 }, (_, i) => sumar(w, i))).map(t => `<button type="button" class="mb-mm-n${mesTxt(t) !== E.mes ? ' fuera' : ''}${t === hoy ? ' hoy' : ''}${con.has(t) ? ' con' : ''}" data-irdia="${t}">${deTxt(t).getDate()}</button>`).join('')}</div>`;
  }
  function pintarFiltros() {
    const el = $('#mb-filtros'); if (!el) return;
    el.innerHTML = E.datos.apartados.map(a => `<label class="mb-filtro" style="--c:${colorDe(a.color)}"><input type="checkbox" data-filtro="${a.id}" ${E.ocultos.has(a.id) ? '' : 'checked'}><i>${SVG.check}</i><span>${esc(a.nombre)}</span></label>`).join('')
      + `<label class="mb-filtro" style="--c:${colorDe('grafito')}"><input type="checkbox" data-filtro="_sin" ${E.ocultos.has('_sin') ? '' : 'checked'}><i>${SVG.check}</i><span>Sin apartado</span></label>`
      + `<div class="mb-filtro-pie"><button class="enlace" type="button" data-mb="todos">Todos</button> · <button class="enlace" type="button" data-mb="ninguno">Ninguno</button></div>`;
  }
  function htmlSinFecha(lista, conAp) {
    if (!lista.length) return '<p class="mb-nada">Nada pendiente.</p>';
    const porMes = {}; for (const e of lista) (porMes[e.mes || ''] = porMes[e.mes || ''] || []).push(e);
    return Object.keys(porMes).sort((a, b) => (a || '9').localeCompare(b || '9')).map(m => `<div class="mb-sf-grupo"><h5>${m ? may(nombreMes(m)) : 'Sin mes'}</h5>${porMes[m].map(e => {
      const a = apPrincipal(e);
      return `<div role="button" tabindex="0" class="mb-sf est-${e.estado}" draggable="true" data-ev="${e.id}" style="--c:${colorEv(e)}"><i></i><span><b>${esc(e.titulo || '(Sin título)')}</b>${conAp && a ? `<small>${esc(a.nombre)}</small>` : ''}</span>${e.estado !== 'idea' ? chipEstado(e.estado) : ''}</div>`;
    }).join('')}</div>`).join('');
  }
  function pintarSinFecha() {
    const el = $('#mb-sinfecha'); if (!el) return;
    el.innerHTML = htmlSinFecha(visibles(null).filter(e => !e.inicio && e.estado !== 'hecho' && e.estado !== 'cancelado'), true);
  }

  // ------------------------------------------------------------ crear / ver / editar actividades
  function plantillaEvento(campos) {
    return Object.assign({ id: nuevoId('e'), titulo: '', apartados: [], inicio: '', fin: '', hora: '', horaFin: '', color: '', estado: 'confirmado', prioridad: '', lugar: '', responsable: '', notas: '', mes: '' }, campos);
  }
  function crearRapido(ancla, inicio, fin, apId) {
    const aps = E.datos.apartados;
    const p = popover(ancla, `<form class="mb-rapido">
      <input class="mb-rap-tit" name="titulo" placeholder="Añade un título" autocomplete="off" autofocus>
      <p class="mb-rap-fecha">${SVG.reloj}<span>${esc(textoFechas({ inicio, fin, hora: '' }))}</span></p>
      <label class="mb-rap-ap">${SVG.bandera}<select name="ap"><option value="">Sin apartado</option>${aps.map(a => `<option value="${a.id}" ${a.id === apId ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select></label>
      <div class="mb-rap-pie"><button class="enlace" type="button" data-mas>Más opciones</button><button class="btn oro peq" type="submit">Guardar</button></div></form>`, 'mb-pop-rapido');
    const f = $('form', p);
    const datos = () => plantillaEvento({ titulo: f.titulo.value.trim(), inicio, fin: fin || inicio, apartados: f.ap.value ? [f.ap.value] : [] });
    f.onsubmit = ev => { ev.preventDefault(); const e = datos(); if (!e.titulo) { f.titulo.focus(); return; } cerrarFlotantes(); guardarEvento(e); U.toast('Actividad guardada.'); };
    $('[data-mas]', p).onclick = () => { const e = datos(); cerrarFlotantes(); editor(e, true); };
  }
  function verEvento(ancla, id) {
    const e = E.datos.eventos.find(x => x.id === id); if (!e) return;
    const aps = e.apartados.map(apartado).filter(Boolean);
    const p = popover(ancla, `<div class="mb-ver">
      <div class="mb-ver-acc">
        <button type="button" data-acc="editar" title="Editar" aria-label="Editar">${SVG.lapiz}</button>
        <button type="button" data-acc="duplicar" title="Duplicar" aria-label="Duplicar">${SVG.copiar}</button>
        <button type="button" data-acc="borrar" title="Eliminar" aria-label="Eliminar">${SVG.papelera}</button>
        <button type="button" data-acc="cerrar" title="Cerrar" aria-label="Cerrar">${SVG.cerrar}</button>
      </div>
      <div class="mb-ver-tit"><i style="background:${colorEv(e)}"></i><div><h3>${esc(e.titulo || '(Sin título)')}</h3><p>${esc(textoFechas(e))}</p></div></div>
      <div class="mb-ver-props">
        <div class="mb-ver-fila">${chipEstado(e.estado)}${e.prioridad ? `<span class="mb-prio p-${C.norm(e.prioridad).toLowerCase()}">${SVG.bandera}${esc(e.prioridad)}</span>` : ''}</div>
        ${aps.map(a => `<div class="mb-ver-fila">${SVG.bandera}<span><a href="#/moral/${a.id}" class="mb-ver-ap" style="--c:${colorDe(a.color)}"><i></i>${esc(a.nombre)}</a><small>${jefeTxt(a) ? 'Jefe: ' + esc(jefeTxt(a)) : 'Sin jefe asignado'}</small></span></div>`).join('')}
        ${e.lugar ? `<div class="mb-ver-fila">${SVG.lugar}<span>${esc(e.lugar)}</span></div>` : ''}
        ${e.responsable ? `<div class="mb-ver-fila">${SVG.persona}<span>${esc(e.responsable)}</span></div>` : ''}
        ${e.notas ? `<div class="mb-ver-fila">${SVG.nota}<span class="mb-ver-notas">${esc(e.notas)}</span></div>` : ''}
        ${!e.inicio ? `<div class="mb-ver-fila"><button class="btn oro peq" type="button" data-acc="fecha">${SVG.cal}Poner fecha</button></div>` : ''}
      </div></div>`, 'mb-pop-ver');
    p.addEventListener('click', ev => {
      const b = ev.target.closest('[data-acc]'); if (!b) return;
      const acc = b.dataset.acc; cerrarFlotantes();
      if (acc === 'editar' || acc === 'fecha') editor(JSON.parse(JSON.stringify(e)), false, acc === 'fecha');
      else if (acc === 'duplicar') { const c = Object.assign(JSON.parse(JSON.stringify(e)), { id: nuevoId('e'), titulo: e.titulo + ' (copia)' }); editor(c, true); }
      else if (acc === 'borrar') borrarEvento(e.id);
    });
  }
  /** Ventana completa de la actividad, con sus propiedades (estilo Notion). */
  function editor(e, nuevo, enfocarFecha) {
    const aps = E.datos.apartados;
    const sinFecha = !e.inicio;
    const m = modal(`<form class="mb-editor" novalidate>
      <div class="mb-ed-cab"><span class="mb-ed-color" style="background:${colorEv(e)}"></span>
        <input class="mb-ed-tit" name="titulo" value="${esc(e.titulo)}" placeholder="Añade un título" autocomplete="off" ${enfocarFecha ? '' : 'autofocus'}>
        <button class="mb-icono" type="button" data-cerrar aria-label="Cerrar">${SVG.cerrar}</button></div>
      <div class="mb-props">
        <div class="mb-prop"><span class="mb-prop-et">${SVG.cal}Fecha</span><div class="mb-prop-val">
          <label class="mb-check"><input type="checkbox" name="sinfecha" ${sinFecha ? 'checked' : ''}> Por programar (sin fecha aún)</label>
          <div class="mb-fechas ${sinFecha ? 'oculto' : ''}">
            <input type="date" name="inicio" value="${esc(e.inicio || '')}" ${enfocarFecha ? 'autofocus' : ''} aria-label="Desde"><span>→</span><input type="date" name="fin" value="${esc(e.fin || e.inicio || '')}" aria-label="Hasta">
            <label class="mb-check"><input type="checkbox" name="todo" ${e.hora ? '' : 'checked'}> Todo el día</label>
            <span class="mb-horas ${e.hora ? '' : 'oculto'}"><input type="time" name="hora" value="${esc(e.hora)}" aria-label="Hora de inicio"><span>–</span><input type="time" name="horaFin" value="${esc(e.horaFin)}" aria-label="Hora de fin"></span>
          </div>
          <div class="mb-mes-or ${sinFecha ? '' : 'oculto'}"><span>Mes orientativo</span><input type="month" name="mes" value="${esc(e.mes)}"></div>
          ${nuevo ? `<div class="mb-repetir ${sinFecha ? 'oculto' : ''}"><select name="repetir"><option value="">No se repite</option><option value="7">Cada semana</option><option value="14">Cada 2 semanas</option><option value="mes">Cada mes</option></select><span class="mb-hasta oculto">hasta <input type="date" name="hasta"></span></div>` : ''}
        </div></div>
        <div class="mb-prop"><span class="mb-prop-et">${SVG.bandera}Apartado</span><div class="mb-prop-val mb-sel-aps">${aps.map(a => `<button type="button" class="mb-tog-ap" data-ap="${a.id}" aria-pressed="${e.apartados.includes(a.id)}" style="--c:${colorDe(a.color)}"><i></i>${esc(a.nombre)}</button>`).join('') || '<span class="mb-nada">No hay apartados todavía.</span>'}
          <small class="mb-ayuda">Puede ir en varios. El primero que marques da el color.</small></div></div>
        <div class="mb-prop"><span class="mb-prop-et">${SVG.check}Estado</span><div class="mb-prop-val mb-segmento">${ESTADOS.map(s => `<button type="button" data-estado="${s.k}" aria-pressed="${e.estado === s.k}" class="mb-est-${s.k}">${esc(s.n)}</button>`).join('')}</div></div>
        <div class="mb-prop"><span class="mb-prop-et">${SVG.bandera}Prioridad</span><div class="mb-prop-val mb-segmento">${PRIORIDADES.map(s => `<button type="button" data-prio="${s}" aria-pressed="${e.prioridad === s}">${s || '—'}</button>`).join('')}</div></div>
        <div class="mb-prop"><span class="mb-prop-et">${SVG.foto}Color</span><div class="mb-prop-val mb-paleta"><button type="button" class="mb-color-ap" data-color="" aria-pressed="${!e.color}" title="El del apartado">Del apartado</button>${COLORES.map(c => `<button type="button" class="mb-color" data-color="${c.k}" aria-pressed="${e.color === c.k}" title="${c.n}" aria-label="${c.n}" style="background:${c.v}"></button>`).join('')}</div></div>
        <div class="mb-prop"><span class="mb-prop-et">${SVG.lugar}Lugar</span><div class="mb-prop-val"><input name="lugar" value="${esc(e.lugar)}" placeholder="Añadir lugar"></div></div>
        <div class="mb-prop"><span class="mb-prop-et">${SVG.persona}Responsable</span><div class="mb-prop-val"><input name="responsable" value="${esc(e.responsable)}" placeholder="Si no es el jefe del apartado"></div></div>
        <div class="mb-prop mb-prop-notas"><span class="mb-prop-et">${SVG.nota}Notas</span><div class="mb-prop-val"><textarea name="notas" rows="4" placeholder="Detalles, material, contactos…">${esc(e.notas)}</textarea></div></div>
      </div>
      <div class="mb-ed-pie">${nuevo ? '' : `<button class="btn suave peq mb-borrar" type="button" data-borrar>${SVG.papelera}Eliminar</button>`}<span></span>
        <button class="btn suave peq" type="button" data-cerrar>Cancelar</button><button class="btn oro" type="submit">Guardar</button></div>
    </form>`, 'mb-modal-editor');
    const f = $('form', m);
    const sel = { aps: [...e.apartados], estado: e.estado, prio: e.prioridad, color: e.color };
    const refrescarColor = () => { $('.mb-ed-color', m).style.background = sel.color ? colorDe(sel.color) : (apartado(sel.aps[0]) ? colorDe(apartado(sel.aps[0]).color) : colorDe('grafito')); };
    f.addEventListener('click', ev => {
      const t = ev.target.closest('button'); if (!t) return;
      if (t.dataset.cerrar !== undefined) { m.remove(); return; }
      if (t.dataset.borrar !== undefined) { m.remove(); borrarEvento(e.id); return; }
      if (t.dataset.ap) { const i = sel.aps.indexOf(t.dataset.ap); i >= 0 ? sel.aps.splice(i, 1) : sel.aps.push(t.dataset.ap); t.setAttribute('aria-pressed', String(i < 0)); refrescarColor(); }
      if (t.dataset.estado) { sel.estado = t.dataset.estado; $$('[data-estado]', m).forEach(b => b.setAttribute('aria-pressed', String(b === t))); }
      if (t.dataset.prio !== undefined) { sel.prio = t.dataset.prio; $$('[data-prio]', m).forEach(b => b.setAttribute('aria-pressed', String(b === t))); }
      if (t.dataset.color !== undefined) { sel.color = t.dataset.color; $$('[data-color]', m).forEach(b => b.setAttribute('aria-pressed', String(b === t))); refrescarColor(); }
    });
    f.addEventListener('change', ev => {
      const n = ev.target.name;
      if (n === 'sinfecha') { const s = ev.target.checked; $('.mb-fechas', m).classList.toggle('oculto', s); $('.mb-mes-or', m).classList.toggle('oculto', !s); const r = $('.mb-repetir', m); if (r) r.classList.toggle('oculto', s); if (!s && !f.inicio.value) { f.inicio.value = f.mes.value ? f.mes.value + '-01' : hoyTxt(); f.fin.value = f.inicio.value; } }
      if (n === 'todo') $('.mb-horas', m).classList.toggle('oculto', ev.target.checked);
      if (n === 'inicio' && (!f.fin.value || f.fin.value < f.inicio.value)) f.fin.value = f.inicio.value;
      if (n === 'repetir') $('.mb-hasta', m).classList.toggle('oculto', !ev.target.value);
    });
    f.addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) f.requestSubmit(); });
    f.onsubmit = ev => {
      ev.preventDefault();
      const sinF = f.sinfecha.checked;
      const r = Object.assign(e, {
        titulo: f.titulo.value.trim(), apartados: sel.aps, estado: sel.estado, prioridad: sel.prio, color: sel.color,
        inicio: sinF ? '' : f.inicio.value, fin: sinF ? '' : (f.fin.value && f.fin.value >= f.inicio.value ? f.fin.value : f.inicio.value),
        hora: sinF || f.todo.checked ? '' : f.hora.value, horaFin: sinF || f.todo.checked ? '' : f.horaFin.value,
        mes: sinF ? f.mes.value : '', lugar: f.lugar.value.trim(), responsable: f.responsable.value.trim(), notas: f.notas.value.trim(),
      });
      if (!r.titulo) { f.titulo.focus(); f.titulo.classList.add('falta'); return; }
      if (!sinF && !r.inicio) { f.inicio.focus(); return; }
      m.remove();
      const rep = f.repetir && f.repetir.value;
      if (nuevo && rep && r.inicio) {
        const hasta = f.hasta.value || sumar(r.inicio, 180); const dur = entre(r.inicio, r.fin); const serie = nuevoId('s');
        let t = r.inicio, n = 0;
        while (t <= hasta && n < 60) {
          E.datos.eventos.push(Object.assign({}, r, { id: nuevoId('e'), inicio: t, fin: sumar(t, dur), serie, mod: ahora() }));
          n++; t = rep === 'mes' ? (() => { const d = deTxt(r.inicio); d.setMonth(d.getMonth() + n); return aTxt(d); })() : sumar(t, +rep);
        }
        cambio(); U.toast(`${n} fechas creadas.`);
      } else { guardarEvento(r); U.toast(nuevo ? 'Actividad guardada.' : 'Cambios guardados.'); }
    };
  }

  // ------------------------------------------------------------ arrastrar
  let arrastrado = null;
  function moverA(id, dia) {
    const e = E.datos.eventos.find(x => x.id === id); if (!e || !dia) return;
    const dur = e.inicio ? entre(e.inicio, e.fin || e.inicio) : 0;
    if (e.inicio === dia) return;
    e.inicio = dia; e.fin = sumar(dia, dur); e.mes = '';
    if (e.estado === 'idea') e.estado = 'encaminado';
    guardarEvento(e);
    U.toast(`«${e.titulo}» → ${fechaLarga(dia)}.`);
  }

  // ------------------------------------------------------------ eventos del calendario (delegados en la raíz)
  let SEL = null; // selección de varios días arrastrando sobre el mes: { raiz, ini, fin }
  document.addEventListener('pointerup', () => {
    if (!SEL) return;
    const { raiz, ini, fin } = SEL; SEL = null;
    if (!document.body.contains(raiz)) return;
    const a = ini < fin ? ini : fin, b = ini < fin ? fin : ini;
    const celda = $(`.mb-dia[data-dia="${b}"]`, raiz);
    const filtro = ($('.mb-cal', raiz) || {}).dataset?.filtro || '';
    if (celda) crearRapido(celda, a, b, filtro);
    setTimeout(() => marcarSel(raiz, null), 0);
  });
  function enlazarCalendario(raiz) {
    raiz.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('div[data-ev]')) { ev.preventDefault(); ev.target.click(); } });
    raiz.addEventListener('click', ev => {
      const t = ev.target;
      const evb = t.closest('[data-ev]'); if (evb) { verEvento(evb, evb.dataset.ev); return; }
      const mas = t.closest('[data-masdia]'); if (mas) { verDia(mas, mas.dataset.masdia, raiz); return; }
      const nav = t.closest('[data-cal]');
      if (nav) { E.mes = nav.dataset.cal === 'hoy' ? mesTxt(hoyTxt()) : mesMas(E.mes, +nav.dataset.cal); pintarCalendario(raiz); return; }
      const v = t.closest('[data-vista]'); if (v) { E.vista = v.dataset.vista; pintarCalendario(raiz); return; }
      const ir = t.closest('[data-irdia]'); if (ir) { E.mes = mesTxt(ir.dataset.irdia); E.vista = 'mes'; pintarCalendario(raiz); const c = $(`.mb-dia[data-dia="${ir.dataset.irdia}"]`, raiz); if (c) { c.classList.add('destello'); setTimeout(() => c.classList.remove('destello'), 1200); } return; }
    });
    raiz.addEventListener('change', ev => {
      const f = ev.target.dataset.filtro; if (!f) return;
      ev.target.checked ? E.ocultos.delete(f) : E.ocultos.add(f); pintarCalendario(raiz);
    });
    raiz.addEventListener('input', ev => { if (ev.target.id === 'mb-buscar') { E.buscar = ev.target.value; const pos = ev.target.selectionStart; pintarCalendario(raiz); const b = $('#mb-buscar', raiz); if (b) { b.focus(); b.setSelectionRange(pos, pos); } } });
    // crear: pulsar en un día vacío o arrastrar sobre varios días
    raiz.addEventListener('pointerdown', ev => {
      const d = ev.target.closest('.mb-dia'); if (!d || ev.button !== 0 || ev.target.closest('[data-ev],[data-masdia]')) return;
      if ($('.mb-pop')) return; // el primer clic solo cierra la ventanita abierta
      SEL = { raiz, ini: d.dataset.dia, fin: d.dataset.dia }; marcarSel(raiz, SEL);
    });
    raiz.addEventListener('pointerover', ev => { if (!SEL || SEL.raiz !== raiz) return; const d = ev.target.closest('.mb-dia'); if (d) { SEL.fin = d.dataset.dia; marcarSel(raiz, SEL); } });
    raiz.addEventListener('dragstart', ev => { const b = ev.target.closest('[data-ev]'); if (!b) return; arrastrado = b.dataset.ev; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', arrastrado); b.classList.add('arrastrando'); cerrarFlotantes(); });
    raiz.addEventListener('dragend', () => { arrastrado = null; $$('.mb-dia.soltar', raiz).forEach(x => x.classList.remove('soltar')); $$('.arrastrando', raiz).forEach(x => x.classList.remove('arrastrando')); });
    raiz.addEventListener('dragover', ev => { const d = ev.target.closest('.mb-dia, .mb-semana'); if (!d || !arrastrado) return; ev.preventDefault(); const dia = diaBajo(ev, raiz); $$('.mb-dia.soltar', raiz).forEach(x => x.classList.toggle('soltar', x.dataset.dia === dia)); });
    raiz.addEventListener('drop', ev => { if (!arrastrado) return; const dia = diaBajo(ev, raiz); if (dia) { ev.preventDefault(); moverA(arrastrado, dia); } });
  }
  function diaBajo(ev, raiz) {
    const els = document.elementsFromPoint(ev.clientX, ev.clientY);
    const d = els.find(x => x.classList && x.classList.contains('mb-dia'));
    return d && raiz.contains(d) ? d.dataset.dia : null;
  }
  function marcarSel(raiz, sel) {
    $$('.mb-dia.sel', raiz).forEach(x => x.classList.remove('sel'));
    if (!sel) return;
    const a = sel.ini < sel.fin ? sel.ini : sel.fin, b = sel.ini < sel.fin ? sel.fin : sel.ini;
    $$('.mb-dia', raiz).forEach(x => { if (x.dataset.dia >= a && x.dataset.dia <= b) x.classList.add('sel'); });
  }
  function verDia(ancla, dia, raiz) {
    const filtro = ($('.mb-cal', raiz) || {}).dataset?.filtro || null;
    const l = ordenar(visibles(filtro).filter(e => e.inicio && e.inicio <= dia && e.fin >= dia));
    const p = popover(ancla, `<div class="mb-dia-pop"><div class="mb-dia-pop-cab"><span>${DIAS[deTxt(dia).getDay()].slice(0, 3).toUpperCase()}</span><b>${deTxt(dia).getDate()}</b></div>
      ${l.map(e => `<button type="button" class="mb-ev lleno est-${e.estado}" data-ev="${e.id}" style="--c:${colorEv(e)};--t:${textoSobre(colorEv(e))}"><span class="mb-ev-tit">${esc(e.titulo)}</span></button>`).join('')}</div>`, 'mb-pop-dia');
    p.addEventListener('click', ev => { const b = ev.target.closest('[data-ev]'); if (b) verEvento(b, b.dataset.ev); });
  }

  // ===================================================================== menú, exportar
  function menuMas(ancla) {
    const p = popover(ancla, `<div class="mb-menu">
      <button type="button" data-m="ics">${SVG.cal}Pasar a Outlook / Google (.ics)</button>
      <button type="button" data-m="imprimir">${SVG.imprimir}Imprimir el mes</button>
      <button type="button" data-m="jefes">${SVG.persona}Imprimir la lista de jefes</button>
      <button type="button" data-m="titulo">${SVG.lapiz}Nombre del programa</button>
      <hr><button type="button" data-m="descargar">${SVG.abajo}Descargar copia del archivo</button></div>`, 'mb-pop-menu');
    p.addEventListener('click', ev => {
      const b = ev.target.closest('[data-m]'); if (!b) return; cerrarFlotantes();
      ({ ics: exportarIcs, imprimir: () => imprimir('mes'), jefes: () => imprimir('jefes'), titulo: editarTitulo, descargar }[b.dataset.m])();
    });
  }
  function exportarIcs() {
    const l = E.datos.eventos.filter(e => e.inicio && e.estado !== 'cancelado');
    const f = t => t.replace(/-/g, ''); const escI = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
    const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IIBPAC//Moral y Bienestar//ES', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escI(E.datos.titulo)}`];
    for (const e of l) {
      const ap = e.apartados.map(apartado).filter(Boolean).map(a => a.nombre).join(', ');
      lineas.push('BEGIN:VEVENT', `UID:${e.id}@iibpac-moral`, `DTSTAMP:${sello}`);
      if (e.hora) { lineas.push(`DTSTART:${f(e.inicio)}T${e.hora.replace(':', '')}00`, `DTEND:${f(e.fin)}T${(e.horaFin || e.hora).replace(':', '')}00`); }
      else lineas.push(`DTSTART;VALUE=DATE:${f(e.inicio)}`, `DTEND;VALUE=DATE:${f(sumar(e.fin, 1))}`);
      lineas.push(`SUMMARY:${escI(e.titulo)}`);
      const desc = [ap && 'Apartado: ' + ap, 'Estado: ' + nombreEstado(e.estado), e.responsable && 'Responsable: ' + e.responsable, e.notas].filter(Boolean).join('\n');
      lineas.push(`DESCRIPTION:${escI(desc)}`); if (e.lugar) lineas.push(`LOCATION:${escI(e.lugar)}`);
      if (ap) lineas.push(`CATEGORIES:${escI(ap)}`);
      lineas.push('END:VEVENT');
    }
    lineas.push('END:VCALENDAR');
    U.descargar(new Blob([lineas.join('\r\n')], { type: 'text/calendar' }), C.nombreArchivo(E.datos.titulo || 'moral_bienestar') + '.ics');
    U.toast(`${l.length} actividades. Ábrelo con Outlook (doble clic) o impórtalo en Google Calendar.`);
  }
  function imprimir(que) {
    document.body.classList.add('mb-imprimir-' + que);
    if (que === 'jefes') {
      const t = document.createElement('div'); t.id = 'mb-impresion';
      t.innerHTML = `<h1>${esc(E.datos.titulo)}${E.datos.subtitulo ? ' · ' + esc(E.datos.subtitulo) : ''}</h1><h2>Jefes de apartado</h2><table><thead><tr><th>Apartado</th><th>Jefe</th><th>Contacto</th></tr></thead><tbody>${grupos().map(g => `<tr class="g"><td colspan="3">${esc(g)}</td></tr>` + E.datos.apartados.filter(a => (a.grupo || 'Otros') === g).map(a => `<tr><td>${esc(a.nombre)}</td><td>${esc(jefeTxt(a)) || '—'}</td><td>${esc(a.jefe.contacto) || ''}</td></tr>`).join('')).join('')}</tbody></table>`;
      document.body.appendChild(t);
    }
    const prev = E.vista; if (que === 'mes' && E.vista !== 'mes') { E.vista = 'mes'; repintar(); }
    setTimeout(() => {
      window.print();
      document.body.classList.remove('mb-imprimir-' + que); $('#mb-impresion')?.remove();
      if (prev !== E.vista) { E.vista = prev; repintar(); }
    }, 80);
  }
  function editarTitulo() {
    const m = modal(`<form class="mb-form-simple"><h3>Nombre del programa</h3>
      <label>Título<input name="t" value="${esc(E.datos.titulo)}" autofocus></label>
      <label>Contingente o subtítulo<input name="s" value="${esc(E.datos.subtitulo)}" placeholder="Ej.: SVK VII"></label>
      <div class="mb-ed-pie"><span></span><button class="btn suave peq" type="button" data-cerrar>Cancelar</button><button class="btn oro" type="submit">Guardar</button></div></form>`);
    const f = $('form', m); $('[data-cerrar]', m).onclick = () => m.remove();
    f.onsubmit = ev => { ev.preventDefault(); E.datos.titulo = f.t.value.trim() || 'Programa de Moral y Bienestar'; E.datos.subtitulo = f.s.value.trim(); E.datos.modTitulo = ahora(); m.remove(); cambio(); };
  }

  // ===================================================================== apartados
  function tarjetaAp(a) {
    const evs = E.datos.eventos.filter(e => e.apartados.includes(a.id));
    const prox = ordenar(evs.filter(e => e.inicio && e.fin >= hoyTxt()))[0];
    const pend = evs.filter(e => !e.inicio && e.estado !== 'hecho' && e.estado !== 'cancelado').length;
    return `<a class="mb-card" href="#/moral/${a.id}" style="--c:${colorDe(a.color)}">
      <span class="mb-card-foto" style="background-image:url('${urlFoto(a.foto)}')"></span><span class="mb-card-velo"></span>
      <span class="mb-card-icono">${icono(a.icono)}</span>
      <span class="mb-card-txt"><b>${esc(a.nombre)}</b>
        <span class="mb-card-jefe ${jefeTxt(a) ? '' : 'sin'}">${jefeTxt(a) ? `<small>Jefe</small>${esc(jefeTxt(a))}` : 'Sin jefe asignado'}</span>
        <span class="mb-card-meta">${prox ? `Próximo: ${esc(fechaCorta(prox.inicio))} · ${esc(prox.titulo)}` : 'Sin fechas próximas'}${pend ? ` · ${pend} por programar` : ''}</span></span></a>`;
  }
  function htmlApartados() {
    const g = grupos();
    return `<div class="mb-aps">${g.map(n => `<div class="mb-grupo"><h3>${esc(n)}</h3><div class="mb-aps-grid">${E.datos.apartados.filter(a => (a.grupo || 'Otros') === n).map(tarjetaAp).join('')}</div></div>`).join('')}
      <button class="mb-card mb-card-nuevo" type="button" data-mb="nuevo-ap">${SVG.mas}<span>Nuevo apartado</span></button></div>`;
  }
  function editarJefe(ancla, a) {
    const p = popover(ancla, `<form class="mb-form-simple mb-jefe-form"><h3>Jefe de «${esc(a.nombre)}»</h3>
      <div class="mb-dos"><label>Empleo<input name="empleo" value="${esc(a.jefe.empleo)}" list="mb-empleos" placeholder="Sgto." autofocus></label>
      <label>Nombre y apellidos<input name="nombre" value="${esc(a.jefe.nombre)}" placeholder="Nombre Apellido"></label></div>
      <label>Contacto (teléfono, correo…)<input name="contacto" value="${esc(a.jefe.contacto)}"></label>
      <datalist id="mb-empleos">${['Sdo.', 'Cbo.', 'Cbo. 1º', 'Cbo. My.', 'Sgto.', 'Sgto. 1º', 'Bg.', 'Stte.', 'Sbmy.', 'Alf.', 'Tte.', 'Cap.', 'Cte.', 'Tcol.', 'Col.', 'Pater'].map(x => `<option value="${x}">`).join('')}</datalist>
      <div class="mb-ed-pie">${jefeTxt(a) ? '<button class="enlace" type="button" data-quitar>Quitar jefe</button>' : ''}<span></span><button class="btn oro peq" type="submit">Guardar</button></div></form>`, 'mb-pop-jefe');
    const f = $('form', p);
    const fin = j => { a.jefe = j; cerrarFlotantes(); guardarApartado(a); U.toast(j.nombre ? `Jefe de ${a.nombre}: ${jefeTxt(a)}.` : 'Jefe quitado.'); };
    f.onsubmit = ev => { ev.preventDefault(); fin({ empleo: f.empleo.value.trim(), nombre: f.nombre.value.trim(), contacto: f.contacto.value.trim() }); };
    const q = $('[data-quitar]', p); if (q) q.onclick = () => fin({ empleo: '', nombre: '', contacto: '' });
  }
  function ajustesAp(a, nuevo) {
    const gs = grupos();
    const m = modal(`<form class="mb-form-simple mb-ajustes-ap"><h3>${nuevo ? 'Nuevo apartado' : 'Ajustes del apartado'}</h3>
      <label>Nombre<input name="nombre" value="${esc(a.nombre)}" autofocus></label>
      <label>Grupo<input name="grupo" value="${esc(a.grupo)}" list="mb-grupos"></label><datalist id="mb-grupos">${gs.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <label>Descripción<textarea name="resumen" rows="2">${esc(a.resumen)}</textarea></label>
      <div class="mb-campo"><span>Color</span><div class="mb-paleta">${COLORES.map(c => `<button type="button" class="mb-color" data-color="${c.k}" aria-pressed="${a.color === c.k}" title="${c.n}" aria-label="${c.n}" style="background:${c.v}"></button>`).join('')}</div></div>
      <div class="mb-campo"><span>Icono</span><div class="mb-iconos">${Object.keys(ICONOS).map(k => `<button type="button" data-icono="${k}" aria-pressed="${a.icono === k}" aria-label="${k}">${ICONOS[k]}</button>`).join('')}</div></div>
      <div class="mb-campo"><span>Foto de fondo</span><div class="mb-fotos">${FOTOS.map(f => `<button type="button" data-foto="${f.k}" aria-pressed="${a.foto === f.k}" style="background-image:url('${urlFoto(f.k)}')" title="${f.n}" aria-label="${f.n}"></button>`).join('')}
        ${/^data:/.test(a.foto) ? `<button type="button" data-foto="${esc(a.foto)}" aria-pressed="true" style="background-image:url('${a.foto}')" title="Foto propia"></button>` : ''}
        <label class="mb-subir">${SVG.foto}<span>Subir foto</span><input type="file" accept="image/*" hidden></label></div>
        <small class="mb-ayuda">La foto subida se guarda dentro del archivo (reducida), así la ve todo el mundo.</small></div>
      <div class="mb-ed-pie">${nuevo ? '' : `<button class="btn suave peq mb-borrar" type="button" data-borrar>${SVG.papelera}Eliminar apartado</button>`}<span></span>
        <button class="btn suave peq" type="button" data-cerrar>Cancelar</button><button class="btn oro" type="submit">Guardar</button></div></form>`);
    const f = $('form', m); const sel = { color: a.color, icono: a.icono, foto: a.foto };
    f.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.cerrar !== undefined) m.remove();
      if (b.dataset.color) { sel.color = b.dataset.color; $$('[data-color]', m).forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
      if (b.dataset.icono) { sel.icono = b.dataset.icono; $$('[data-icono]', m).forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
      if (b.dataset.foto) { sel.foto = b.dataset.foto; $$('[data-foto]', m).forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
      if (b.dataset.borrar !== undefined) {
        const n = E.datos.eventos.filter(e => e.apartados.includes(a.id)).length;
        if (!confirm(`¿Eliminar el apartado «${a.nombre}»?${n ? ` Sus ${n} actividades se quedan en el calendario, sin este apartado.` : ''}`)) return;
        E.datos.apartados = E.datos.apartados.filter(x => x.id !== a.id); E.datos.borrados[a.id] = ahora();
        for (const e of E.datos.eventos) if (e.apartados.includes(a.id)) { e.apartados = e.apartados.filter(x => x !== a.id); e.mod = ahora(); }
        m.remove(); location.hash = '#/moral'; cambio();
      }
    });
    $('input[type=file]', m).addEventListener('change', async ev => {
      const file = ev.target.files[0]; if (!file) return;
      try {
        sel.foto = await reducirFoto(file);
        const b = document.createElement('button'); b.type = 'button'; b.dataset.foto = sel.foto; b.style.backgroundImage = `url('${sel.foto}')`;
        $$('[data-foto]', m).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true');
        $('.mb-subir', m).before(b);
      } catch (e) { U.toast('No se pudo leer la foto.', 'error'); }
    });
    f.onsubmit = ev => {
      ev.preventDefault();
      if (!f.nombre.value.trim()) { f.nombre.focus(); return; }
      Object.assign(a, { nombre: f.nombre.value.trim(), grupo: f.grupo.value.trim() || 'Otros', resumen: f.resumen.value.trim() }, sel);
      m.remove(); guardarApartado(a);
      if (nuevo) location.hash = '#/moral/' + a.id;
    };
  }
  /** Reduce la foto a 1600 px de ancho y JPEG para que el archivo no pese demasiado. */
  function reducirFoto(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1600 / img.width); const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = rej; img.src = url;
    });
  }

  // ===================================================================== vistas
  let raizActual = null, rutaActual = '';
  function repintar(completo) {
    if (!raizActual || !document.body.contains(raizActual) || !location.hash.startsWith('#/moral')) return;
    if (completo) { vista(rutaActual); return; }
    pintarCalendario(raizActual);
    if (!rutaActual) { const ap = $('#mb-apartados', raizActual); if (ap) ap.innerHTML = htmlApartados(); pintarCabPortada(); }
    else pintarCabAp();
  }
  function htmlBienvenida() {
    return `<div class="mb-bienvenida">
      <span class="eyebrow">Para empezar</span>
      <h2>Abre el archivo de Moral y Bienestar</h2>
      <p>El calendario, los apartados y los jefes no están en la página (que es pública): están en un archivo <b>.json</b> que se guarda en la carpeta compartida de la unidad. Ábrelo y ${puedeEscribir() ? 'cada cambio se guardará solo en él' : 'al terminar descarga la copia y sustituye la anterior'}.</p>
      <div class="mb-bien-acc">
        <button class="btn oro" type="button" data-mb="abrir">${SVG.archivo}Abrir archivo</button>
        <button class="btn suave oculto" type="button" data-mb="reabrir" id="mb-reabrir"></button>
        <button class="enlace" type="button" data-mb="nuevo">o empezar uno en blanco</button>
      </div>
      <p class="mb-bien-pie">También puedes arrastrar el archivo a esta ventana.</p>
    </div>`;
  }
  function pintarCabPortada() {
    const t = $('#mb-cab-eyebrow'); if (t && E.datos) t.textContent = [E.datos.titulo, E.datos.subtitulo].filter(Boolean).join(' · ');
  }
  function vistaPortada() {
    const raiz = U.pintar(`<section class="cab-px cab-seccion mb-cab" data-px>
      <div class="cab-px-fondo" style="background-image:url('assets/img/foto-sierra.jpg')"></div><div class="cab-px-velo"></div>
      <div class="contenedor cab-px-texto">
        <div class="miga"><a href="#/">Inicio</a> / <span>Moral y Bienestar</span></div>
        <span class="eyebrow mb-cab-eyebrow" id="mb-cab-eyebrow">${E.datos ? esc([E.datos.titulo, E.datos.subtitulo].filter(Boolean).join(' · ')) : 'Programa del contingente'}</span>
        <h1 class="titular cab-titulo">Moral <i>y Bienestar</i></h1>
        <p class="cab-sub">Calendario, actividades y responsables de cada apartado, en un solo sitio.</p>
        <span class="cab-desliza" aria-hidden="true">Desliza<i></i></span>
      </div></section>
      ${htmlBarraArchivo()}
      <section class="pagina bloque-foto fondo-sec-mb"><div class="contenedor">
        ${E.datos ? `<div class="mb-bloque">${htmlCalendario(null)}</div>
          <div class="bloque-cab mb-aps-cab"><div><span class="eyebrow">Apartados</span><h2 class="subtitulo" style="margin-top:8px">Quién lleva cada cosa</h2></div></div>
          <div id="mb-apartados">${htmlApartados()}</div>` : htmlBienvenida()}
      </div></section>`);
    return raiz;
  }
  function pintarCabAp() {
    const a = apartado(rutaActual); const cab = $('#mb-cab-ap'); if (!a || !cab) return;
    cab.style.setProperty('--c', colorDe(a.color));
    $('.cab-px-fondo', cab).style.backgroundImage = `url('${urlFoto(a.foto)}')`;
    const fondo = $('#mb-fondo-ap'); if (fondo) fondo.style.setProperty('--foto', `url('${new URL(urlFoto(a.foto), location.href).href}')`);
    $('#mb-ap-icono').innerHTML = icono(a.icono);
    $('#mb-ap-nombre').textContent = a.nombre;
    $('#mb-ap-grupo').textContent = a.grupo;
    $('#mb-ap-resumen').textContent = a.resumen || '';
    const j = $('#mb-ap-jefe');
    j.className = 'mb-jefe' + (jefeTxt(a) ? '' : ' sin');
    j.innerHTML = `<span class="mb-jefe-et">Jefe del apartado</span><b>${jefeTxt(a) ? esc(jefeTxt(a)) : 'Sin asignar'}</b>${a.jefe.contacto ? `<small>${esc(a.jefe.contacto)}</small>` : ''}<span class="mb-jefe-editar">${SVG.lapiz}${jefeTxt(a) ? 'Cambiar' : 'Asignar jefe'}</span>`;
    const pend = $('#mb-ap-pend');
    if (pend) pend.innerHTML = htmlSinFecha(E.datos.eventos.filter(e => e.apartados.includes(a.id) && !e.inicio && e.estado !== 'cancelado'), false);
    const notas = $('#mb-ap-notas'); if (notas && document.activeElement !== notas) notas.value = a.notas || '';
  }
  function vistaApartado(id) {
    const a = apartado(id);
    if (!a) { location.replace('#/moral'); return null; }
    const raiz = U.pintar(`<section class="cab-px cab-seccion mb-cab mb-cab-ap" id="mb-cab-ap" data-px style="--c:${colorDe(a.color)}">
      <div class="cab-px-fondo" style="background-image:url('${urlFoto(a.foto)}')"></div><div class="cab-px-velo"></div><div class="mb-cab-tinte"></div>
      <div class="contenedor cab-px-texto">
        <div class="miga"><a href="#/">Inicio</a> / <a href="#/moral">Moral y Bienestar</a> / <span id="mb-ap-grupo"></span></div>
        <div class="mb-ap-titulo"><span class="mb-ap-icono" id="mb-ap-icono"></span><h1 class="titular cab-titulo" id="mb-ap-nombre"></h1></div>
        <p class="cab-sub" id="mb-ap-resumen"></p>
        <div class="mb-ap-acciones">
          <button type="button" class="mb-jefe" id="mb-ap-jefe" data-mb="jefe"></button>
          <button type="button" class="btn mb-btn-cristal" data-mb="ajustes-ap">${SVG.ajustes}Ajustes, color y foto</button>
        </div>
      </div></section>
      ${htmlBarraArchivo()}
      <section class="pagina bloque-foto mb-fondo-ap" id="mb-fondo-ap" style="--foto:url('${new URL(urlFoto(a.foto), location.href).href}')"><div class="contenedor mb-ap-cuerpo">
        <div class="mb-bloque mb-ap-cal">${htmlCalendario(a.id)}</div>
        <aside class="mb-ap-lado">
          <div class="mb-bloque"><div class="mb-bloque-cab"><h3>Por programar e ideas</h3><button class="btn suave peq" type="button" data-mb="idea">${SVG.mas}Añadir</button></div>
            <p class="mb-ayuda">Sin fecha todavía. Ábrela y ponle día, o cámbiale el estado.</p><div id="mb-ap-pend"></div></div>
          <div class="mb-bloque"><div class="mb-bloque-cab"><h3>Notas del apartado</h3></div>
            <textarea id="mb-ap-notas" class="mb-notas" rows="8" placeholder="Material, contactos, horarios, ideas…"></textarea></div>
        </aside>
      </div></section>`);
    return raiz;
  }

  /** Entrada desde el enrutador: ruta = '' (portada) o id de apartado. */
  function vista(ruta, utilidades) {
    if (utilidades) U = utilidades;
    rutaActual = ruta || '';
    cerrarFlotantes();
    const raiz = rutaActual && E.datos ? vistaApartado(rutaActual) : vistaPortada();
    if (!raiz) return;
    raizActual = raiz;
    if (E.datos) { if (rutaActual) pintarCabAp(); pintarCalendario(raiz); enlazarCalendario(raiz); }
    else if (puedeEscribir()) idb('leer').then(h => { const b = $('#mb-reabrir', raiz); if (h && b) { b.innerHTML = `Seguir con «${esc(h.name)}»`; b.classList.remove('oculto'); } });
    enlazarAcciones(raiz);
    pintarEstado();
    U.animarEntrada(raiz);
    document.title = (rutaActual && E.datos && apartado(rutaActual) ? apartado(rutaActual).nombre + ' · ' : '') + 'Moral y Bienestar · IIBPAC';
  }
  function enlazarAcciones(raiz) {
    raiz.addEventListener('click', ev => {
      const b = ev.target.closest('[data-mb]'); if (!b) return;
      const a = rutaActual ? apartado(rutaActual) : null;
      switch (b.dataset.mb) {
        case 'abrir': abrir(); break;
        case 'reabrir': reabrir(); break;
        case 'nuevo': E.datos = vacio(); E.nombre = 'moral-bienestar.json'; E.archivo = null; E.sucio = true; copiaSesion(); repintar(true); if (puedeEscribir()) setTimeout(() => U.toast('Pulsa «Guardar como…» para crear el archivo en la carpeta compartida.'), 600); break;
        case 'guardar-como': guardarComo(); break;
        case 'descargar': if (E.datos) descargar(); break;
        case 'permiso': escribir(true); break;
        case 'reintentar': escribir(true); break;
        case 'crear': editor(plantillaEvento({ inicio: E.mes === mesTxt(hoyTxt()) ? hoyTxt() : E.mes + '-01', fin: '', apartados: a ? [a.id] : [] }), true); break;
        case 'idea': editor(plantillaEvento({ estado: 'idea', apartados: a ? [a.id] : [] }), true); break;
        case 'menu': menuMas(b); break;
        case 'pasadas': E.pasadas = !E.pasadas; pintarCalendario(raiz); break;
        case 'todos': E.ocultos.clear(); pintarCalendario(raiz); break;
        case 'ninguno': E.datos.apartados.forEach(x => E.ocultos.add(x.id)); E.ocultos.add('_sin'); pintarCalendario(raiz); break;
        case 'nuevo-ap': ajustesAp({ id: nuevoId('a_'), nombre: '', grupo: 'Otros', icono: 'circulo', color: COLORES[E.datos.apartados.length % COLORES.length].k, foto: FOTOS[E.datos.apartados.length % FOTOS.length].k, resumen: '', notas: '', jefe: { empleo: '', nombre: '', contacto: '' } }, true); break;
        case 'jefe': if (a) editarJefe(b, a); break;
        case 'ajustes-ap': if (a) ajustesAp(a, false); break;
      }
    });
    const notas = $('#mb-ap-notas', raiz);
    if (notas) { let t; notas.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { const a = apartado(rutaActual); if (!a) return; a.notas = notas.value; a.mod = ahora(); cambio({ repintar: false }); }, 500); }); }
    // abrir sin escribir (navegadores sin acceso a archivos)
    let inp = $('#mb-archivo-input');
    if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.id = 'mb-archivo-input'; inp.hidden = true; document.body.appendChild(inp); inp.addEventListener('change', () => { if (inp.files[0]) abrirLectura(inp.files[0]); inp.value = ''; }); }
  }

  /** Un .json soltado en la ventana. */
  async function soltarArchivo(file) {
    if (!U) return;
    if (location.hash.indexOf('#/moral') !== 0) location.hash = '#/moral';
    // con Edge/Chrome, si el archivo soltado trae «manija», se puede escribir en él
    await abrirLectura(file);
  }

  window.Moral = { vista, soltarArchivo, _E: E, _fusionar: fusionar, _usarArchivo: usarArchivo };
})();

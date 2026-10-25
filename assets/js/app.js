/* Mesa de Documentación — interfaz.
 * Todo ocurre en este navegador: el Excel se lee en memoria y no se guarda en ningún sitio.
 * Lo único que se guarda en el equipo (localStorage) son los datos de la unidad,
 * el reconocimiento de columnas y las plantillas propias; nunca datos de personas.
 */
(function () {
  'use strict';
  const C = window.Comun, M = window.Motor;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = C.esc;
  const main = $('#principal');
  /** Pinta una página nueva dentro de <main> y devuelve su raíz (los escuchadores van en ella). */
  function pintar(html) { const r = document.createElement('div'); r.className = 'vista-pagina'; r.innerHTML = html; main.replaceChildren(r); return r; }
  /** Banda de cabecera con foto para las páginas interiores. */
  const banda = (miga, titulo, texto) => `<section class="banda"><div class="contenedor">
      <div class="miga">${miga}</div><h1 class="titular">${titulo}</h1>${texto ? `<p>${texto}</p>` : ''}</div></section>`;

  const SECCIONES = {
    s1: { n: 'S1', nombre: 'Personal', desc: 'Licencias, conciliación, bajas, hoja anual, destinos y distintivos.' },
    s2: { n: 'S2', nombre: 'Inteligencia', desc: 'Seguridad, acreditaciones y habilitaciones.' },
    s3: { n: 'S3', nombre: 'Operaciones', desc: 'Ejercicios, instrucción, órdenes y cursos.' },
    s4: { n: 'S4', nombre: 'Logística', desc: 'Material, vestuario, transportes y alimentación.' },
  };
  const CLAVE_MAPAS = 'mesa-doc.mapas.v1', CLAVE_PROPIAS = 'mesa-doc.propias.v1';

  const S = {
    ajustes: C.ajustes(),
    archivo: '', hojas: [], hoja: '', columnas: [], registros: [], mapa: {}, personas: [], ficticios: false,
    valores: {}, tablas: {}, personaDoc: {}, modo: {}, lote: {}, zoom: 'ajustar',
    version: 0, etiquetas: {}, ultimo: null,
  };

  // ======================================================================= utilidades UI
  function toast(txt, tipo) {
    const t = document.createElement('div'); t.className = 'toast' + (tipo ? ' ' + tipo : ''); t.textContent = txt;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), tipo === 'error' ? 7000 : 3800);
  }
  function descargar(blob, nombre) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  const ico = {
    buscar: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    flecha: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    word: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="m8 13 1.5 5 2.5-5 2.5 5L16 13"/></svg>',
    pdf: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M9 17v-5h1.5a1.5 1.5 0 0 1 0 3H9"/></svg>',
    imprimir: '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
    candado: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    zip: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M10 5h1M10 8h1M10 11h1M10 14h1v3h-1z"/></svg>',
  };

  // ======================================================================= documentos
  function propias() { return C.leerLocal(CLAVE_PROPIAS, []); }
  function prettify(t) { const s = t.replace(/_/g, ' ').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
  const CONOCIDAS = new Set(['trat', 'nombre', 'apellidos', 'apellido1', 'apellido2', 'apellidos_nombre', 'nombre_completo', 'empleo', 'empleo_abrev',
    'dni', 'escala', 'cia', 'compania', 'telefono', 'email', 'domicilio', ...C.AJUSTES_DEF.map(a => a.k)]);
  function defPropia(p) {
    const campos = [], vistos = new Set(['fecha_firma']);
    let firma = false;
    for (const t of p.etiquetas.campos) {
      const k = t.toLowerCase(); const base = k.replace(/_(larga|corta)$/, '');
      if (base === 'fecha_firma') { firma = true; continue; }
      if (CONOCIDAS.has(base) || vistos.has(base)) continue;
      vistos.add(base);
      const fecha = /^fecha|_(larga|corta)$/.test(k);
      campos.push({ id: base, et: prettify(base), tipo: fecha ? 'fecha' : 'texto' });
    }
    if (firma) campos.push({ id: 'fecha_firma', et: 'Fecha del escrito', tipo: 'fecha', def: () => C.iso(C.hoy()) });
    return {
      id: p.id, seccion: p.seccion, plantilla: p.id, titulo: p.titulo, grupo: 'Plantillas propias', propia: true,
      resumen: 'Plantilla propia cargada en este equipo.', norma: 'Plantilla propia', lote: true, campos,
      tablas: p.etiquetas.listas.map(l => ({ id: l.nombre.toLowerCase(), et: prettify(l.nombre), filas: 0, max: 40,
        columnas: l.columnas.map(c => ({ id: c.toLowerCase(), et: prettify(c), tipo: /^fecha/i.test(c) ? 'fecha' : 'texto' })) })),
    };
  }
  function todosDocs() {
    const pr = propias();
    for (const p of pr) window.PLANTILLAS[p.id] = p.b64;
    return [...(window.MESA_DOCS || []), ...pr.map(defPropia)];
  }
  const docPorId = id => todosDocs().find(d => d.id === id);
  async function etiquetasDe(def) {
    if (!S.etiquetas[def.plantilla]) {
      const e = await M.etiquetas(window.PLANTILLAS[def.plantilla]);
      S.etiquetas[def.plantilla] = new Set([...e.campos.map(x => x.toLowerCase()), ...e.listas.map(x => x.nombre.toLowerCase())]);
    }
    return S.etiquetas[def.plantilla];
  }

  // ======================================================================= Excel
  function firmaColumnas(cols) { return C.norm(cols.join('|')).slice(0, 400); }
  async function cargarExcel(file) {
    try {
      const hojas = await Excel.leerArchivo(file);
      const tablas = hojas.map(Excel.tabular).filter(t => t.registros.length);
      if (!tablas.length) throw new Error('No encuentro filas con datos. ¿La primera fila tiene los títulos de las columnas?');
      tablas.sort((a, b) => b.registros.length - a.registros.length);
      S.hojas = tablas; S.archivo = file.name; S.ficticios = false;
      usarHoja(tablas[0].hoja);
      toast(`${S.personas.length} personas cargadas de «${file.name}». Solo en este ordenador.`);
    } catch (e) { console.error(e); toast(e.message || 'No se pudo leer el archivo.', 'error'); }
  }
  function usarHoja(nombre) {
    const t = S.hojas.find(h => h.hoja === nombre) || S.hojas[0];
    S.hoja = t.hoja; S.columnas = t.columnas; S.registros = t.registros;
    const guardados = C.leerLocal(CLAVE_MAPAS, {});
    S.mapa = Object.assign(C.detectarMapa(S.columnas), guardados[firmaColumnas(S.columnas)] || {});
    rehacerPersonas();
  }
  function rehacerPersonas() {
    S.personas = S.registros.map(r => C.persona(r, S.mapa)).filter(p => p.nombre_completo || p.dni);
    S.personaDoc = {}; S.lote = {};
    pintarPildora(); router();
  }
  function olvidarDatos() {
    Object.assign(S, { archivo: '', hojas: [], hoja: '', columnas: [], registros: [], mapa: {}, personas: [], personaDoc: {}, lote: {}, valores: {}, tablas: {}, ficticios: false });
    pintarPildora(); router(); toast('Datos de personas borrados de la memoria.');
  }
  function datosFicticios() {
    const nombres = ['ALEJANDRO', 'LUCÍA', 'PABLO', 'MARÍA', 'JAVIER', 'ANDREA', 'DANIEL', 'SARA', 'ADRIÁN', 'CARMEN', 'SERGIO', 'IRENE', 'DAVID', 'PAULA', 'RUBÉN', 'ELENA', 'IVÁN', 'MARTA', 'JORGE', 'NURIA'];
    const apell = ['GARCÍA', 'MARTÍN', 'LÓPEZ', 'SÁNCHEZ', 'GÓMEZ', 'FERNÁNDEZ', 'RUIZ', 'DÍAZ', 'MORENO', 'MUÑOZ', 'ÁLVAREZ', 'ROMERO', 'NAVARRO', 'TORRES', 'DOMÍNGUEZ', 'GIL', 'VÁZQUEZ', 'SERRANO', 'RAMOS', 'BLANCO', 'MOLINA', 'ORTEGA', 'DELGADO', 'CASTRO'];
    const empleos = [['SOLDADO', 'MTM CGET ILG', 14], ['CABO', 'MTM CGET ILG', 5], ['CABO 1º', 'MTM CGET ILG', 2], ['SARGENTO', 'CGET ESB ILG', 3], ['SARGENTO 1º', 'CGET ESB ILG', 2], ['BRIGADA', 'CGET ESB ILG', 1], ['TENIENTE', 'CGET EOF INF', 2], ['CAPITÁN', 'CGET EOF INF', 1]];
    const bolsa = empleos.flatMap(e => Array(e[2]).fill(e));
    const L = 'TRWAGMYFPDXBNJZSQVHLCKE'; let semilla = 7;
    const r = n => { semilla = (semilla * 9301 + 49297) % 233280; return Math.floor(semilla / 233280 * n); };
    const regs = [];
    for (let i = 0; i < 40; i++) {
      const n = nombres[r(nombres.length)], e = bolsa[r(bolsa.length)], num = 10000000 + r(89999999);
      regs.push({ 'NOMBRE': n, '1º APELLIDO': apell[r(apell.length)], '2º APELLIDO': apell[r(apell.length)], 'EMPLEO': e[0], 'ESCALA': e[1],
        'NUMERO DNI': `${num}${L[num % 23]}`, 'SEXO': '',
        'CIA': ['10', '11', '12', 'PLMM'][r(4)], 'TELEFONO': `6${String(10000000 + r(89999999))}`, 'RESIDENCIA 1': `C/ Ejemplo ${1 + r(80)}, ${1 + r(5)}º ${'ABCD'[r(4)]}, 28860 Paracuellos de Jarama (Madrid)` });
    }
    for (const x of regs) x['SEXO'] = ['LUCÍA', 'MARÍA', 'ANDREA', 'SARA', 'CARMEN', 'IRENE', 'PAULA', 'ELENA', 'MARTA', 'NURIA'].includes(x['NOMBRE']) ? 'MUJER' : 'HOMBRE';
    const cols = Object.keys(regs[0]);
    S.hojas = [{ hoja: 'Ficticios', columnas: cols, registros: regs }]; S.archivo = 'Datos ficticios'; S.ficticios = true;
    usarHoja('Ficticios');
    toast('Cargadas 40 personas inventadas para probar.');
  }
  function pintarPildora() {
    const b = $('#pildora-datos'); const n = S.personas.length;
    b.classList.toggle('cargado', n > 0);
    $('#pildora-texto').textContent = n ? `${n} personas${S.ficticios ? ' (prueba)' : ''}` : 'Cargar Excel';
    b.title = n ? `${S.archivo} · hoja ${S.hoja}. Pulsa para ver columnas.` : 'Carga el Excel de personal';
  }

  // ======================================================================= arrastrar y soltar
  let profundidad = 0;
  window.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { profundidad++; $('#soltar').classList.add('activo'); } });
  window.addEventListener('dragleave', () => { profundidad = Math.max(0, profundidad - 1); if (!profundidad) $('#soltar').classList.remove('activo'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); profundidad = 0; $('#soltar').classList.remove('activo');
    const f = e.dataTransfer.files[0]; if (!f) return;
    if (/\.docx$/i.test(f.name)) cargarPlantillaPropia(f); else cargarExcel(f);
  });
  $('#archivo-excel').addEventListener('change', e => { const f = e.target.files[0]; if (f) cargarExcel(f); e.target.value = ''; });
  $('#archivo-plantilla').addEventListener('change', e => { const f = e.target.files[0]; if (f) cargarPlantillaPropia(f); e.target.value = ''; });
  $('#pildora-datos').addEventListener('click', () => { if (S.personas.length) location.hash = '#/datos'; else $('#archivo-excel').click(); });

  // ======================================================================= portada
  function bloqueCarga() {
    const n = S.personas.length;
    return `<div class="carga">
      <span class="eyebrow">Paso 1 · Base de datos</span>
      <h2>${n ? 'Excel cargado' : 'Carga el Excel de personal'}</h2>
      ${n ? `<div class="cargado-resumen"><strong>${n}</strong><div><b>${esc(S.archivo)}</b><br>Hoja «${esc(S.hoja)}» · ${S.columnas.length} columnas</div></div>
        <div class="acciones-carga"><a class="btn suave peq" href="#/datos">Ver columnas</a><button class="btn suave peq" data-acc="cambiar">Cambiar Excel</button><button class="btn suave peq" data-acc="olvidar">Borrar de la memoria</button></div>`
      : `<div class="zona-carga" data-acc="cargar" tabindex="0" role="button"><strong>Arrastra aquí el Excel o pulsa para elegirlo</strong><span>.xlsx o .csv · la primera fila con los títulos de columna</span></div>
        <div class="acciones-carga"><button class="enlace" data-acc="ficticios">Probar con datos inventados</button></div>`}
      <div class="candado">${ico.candado}<span>El archivo se lee en este navegador y desaparece al cerrar la pestaña. No se sube a internet ni se guarda en el equipo.</span></div>
    </div>`;
  }
  function tarjetaDoc(d) {
    const s = SECCIONES[d.seccion];
    return `<a class="doc-card" href="#/${d.seccion}/${d.id}"><span class="doc-mini" aria-hidden="true"></span><span>
      <h4>${esc(d.titulo)}</h4><p>${esc(d.resumen || '')}</p>
      <span class="meta"><span class="chip">${s.n}</span>${d.lote ? '<span class="chip oro">Varias personas</span>' : ''}</span></span></a>`;
  }
  function listaDocs(docs) {
    if (!docs.length) return '';
    const grupos = {}; for (const d of docs) (grupos[d.grupo || 'Otros'] = grupos[d.grupo || 'Otros'] || []).push(d);
    return Object.entries(grupos).map(([g, l]) => `<div class="grupo-docs"><h3>${esc(g)}</h3><div class="docs-grid">${l.map(tarjetaDoc).join('')}</div></div>`).join('');
  }
  function vistaInicio() {
    const docs = todosDocs();
    const total = docs.length;
    const raiz = pintar(`
    <section class="portada"><div class="contenedor portada-grid">
      <div>
        <div class="portada-marca"><img src="assets/img/escudo-bpac.png" alt="Escudo del BILPAC II «Roger de Lauria»" width="400" height="468">
          <div><span class="eyebrow">BILPAC II · «Roger de Lauria»</span><div class="portada-nombre">II<em>BPAC</em></div></div></div>
        <h1 class="titular titular-lauria">Lauria</h1>
        <p class="lead">Elige el modelo, escribe dos letras del apellido y el documento se rellena solo con los datos del Excel. Revisa la hoja tal como saldrá impresa y descárgala en Word o PDF.</p>
        <div class="cifras">
          <div class="cifra"><strong>${total}</strong><span>Modelos</span></div>
          <div class="cifra"><strong>${S.personas.length || '—'}</strong><span>Personas cargadas</span></div>
          <div class="cifra"><strong>0</strong><span>Datos enviados a internet</span></div>
        </div>
      </div>
      ${bloqueCarga()}
    </div></section>
    <section class="bloque"><div class="contenedor">
      <div class="bloque-cab"><div><span class="eyebrow">Paso 2 · Sección</span><h2 class="subtitulo" style="margin-top:8px">Cuatro carpetas de documentación</h2></div></div>
      <div class="secciones-grid">${Object.entries(SECCIONES).map(([k, s]) => {
        const n = docs.filter(d => d.seccion === k).length;
        return `<a class="sec-card ${n ? '' : 'vacia'}" href="#/${k}"><span class="flecha">${ico.flecha}</span><div class="num">S<i>${k.slice(1)}</i></div><h3>${s.nombre}</h3><p>${n ? n + ' modelos' : 'Pendiente de modelos'} · ${s.desc}</p></a>`;
      }).join('')}</div>
    </div></section>
    <section class="bloque" style="padding-top:0"><div class="contenedor">
      <div class="bloque-cab"><div><span class="eyebrow">Paso 3 · Modelo</span><h2 class="subtitulo" style="margin-top:8px">Todos los modelos</h2></div>
        <label class="buscador-docs">${ico.buscar}<input id="filtro-docs" type="search" placeholder="Buscar modelo… (pulsa /)" autocomplete="off"><span class="sr">Buscar modelo</span></label></div>
      <div id="lista-docs">${listaDocs(docs)}</div>
    </div></section>`);
    enlazarCarga(raiz);
    $('#filtro-docs').addEventListener('input', e => {
      const q = C.norm(e.target.value);
      $('#lista-docs').innerHTML = listaDocs(docs.filter(d => C.norm(d.titulo + ' ' + d.grupo + ' ' + (d.resumen || '') + ' ' + d.seccion).includes(q))) || '<div class="vacio"><strong>Nada con ese nombre</strong>Prueba con otra palabra.</div>';
    });
  }
  function enlazarCarga(raiz) {
    raiz.addEventListener('click', e => {
      const a = e.target.closest('[data-acc]'); if (!a) return;
      ({ cargar: () => $('#archivo-excel').click(), cambiar: () => $('#archivo-excel').click(), olvidar: olvidarDatos, ficticios: datosFicticios }[a.dataset.acc] || (() => {}))();
    });
    const z = $('.zona-carga', raiz);
    if (z) z.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#archivo-excel').click(); } });
  }

  function vistaSeccion(sec) {
    const s = SECCIONES[sec]; const docs = todosDocs().filter(d => d.seccion === sec);
    pintar(`${banda(`<a href="#/">Inicio</a> / <span>${s.n}</span>`, `${s.n} · <i>${s.nombre}</i>`, s.desc)}<section class="pagina"><div class="contenedor">
      ${docs.length ? listaDocs(docs) : `<div class="vacio" style="margin-top:26px"><strong>Todavía no hay modelos de ${s.n}</strong>
        Pásame los documentos y los preparo como los de S1. Mientras, puedes cargar una plantilla propia.<br><br>
        <a class="btn principal" href="#/propias">Añadir plantilla propia</a></div>`}
    </div></section>`);
  }

  // ======================================================================= editor
  const camposDe = def => def.campos || [];
  function defecto(c, p) {
    const a = S.ajustes;
    if (c.persona && p && p[c.id]) return p[c.id];
    return typeof c.def === 'function' ? c.def(a, p || {}) : (c.def ?? '');
  }
  const clave = def => def.estado || def.id; // documentos que comparten lo rellenado (hoja anual corta/larga)
  function personaDe(def) { return S.personaDoc[clave(def)] || (S.personaDoc[clave(def)] = vaciaPersona()); }
  function vaciaPersona() { return { trat: 'D.', nombre: '', apellidos: '', empleo: '', empleo_abrev: '', dni: '', escala: '', cia: '', telefono: '', domicilio: '', email: '' }; }
  function completarPersona(p) {
    if (p.nombre || p.apellidos) {
      p.nombre_completo = [p.nombre, p.apellidos].filter(Boolean).join(' ');
      p.apellidos_nombre = [p.apellidos, p.nombre].filter(Boolean).join(', ');
    }
    p.compania = /^\d+$/.test(p.cia || '') ? `${p.cia}ª COMPAÑÍA` : (p.cia || '');
    if (!p.empleo_abrev && p.empleo) p.empleo_abrev = C.abreviar(p.empleo);
    return p;
  }
  function copiaPersona(p) {
    const k = ['trat', 'nombre', 'apellidos', 'empleo', 'empleo_abrev', 'dni', 'escala', 'cia', 'telefono', 'domicilio', 'email', 'nombre_completo', 'apellidos_nombre', 'compania'];
    const c = {}; for (const x of k) c[x] = p[x] || ''; c._ref = p; return c;
  }

  /** Junta ajustes + persona + campos + tablas, calcula y comprueba. */
  function construirDatos(def, persona, valores, tablas) {
    const d = Object.assign({}, S.ajustes);
    const p = persona ? completarPersona(Object.assign({}, persona)) : completarPersona(vaciaPersona());
    for (const [k, v] of Object.entries(p)) if (!k.startsWith('_')) d[k] = v;
    for (const c of camposDe(def)) {
      if (c.tipo === 'calculado') continue;
      const v = valores[c.id]; d[c.id] = v !== undefined ? v : defecto(c, p);
    }
    for (const t of def.tablas || []) {
      d[t.id] = (tablas[t.id] || []).map(r => {
        const o = {};
        for (const col of t.columnas) o[col.id] = r[col.id] ?? '';
        return o;
      });
    }
    const av = [];
    // fechas: X (dd/mm/aaaa), X_corta y X_larga
    for (const c of camposDe(def)) if (c.tipo === 'fecha') {
      const f = C.aFecha(d[c.id]);
      d[c.id] = C.corta(f); d[c.id + '_corta'] = C.corta(f); d[c.id + '_larga'] = C.larga(f);
    }
    for (const t of def.tablas || []) for (const col of t.columnas) if (col.tipo === 'fecha') {
      for (const r of d[t.id]) r[col.id] = C.corta(C.aFecha(r[col.id])) || r[col.id];
    }
    if (def.calcular) def.calcular(d, av);
    for (const t of def.tablas || []) {
      if (!def.calcular) d[t.id] = d[t.id].filter(r => Object.values(r).some(Boolean));
      while (d[t.id].length < (t.filas || 0)) d[t.id].push({});
      const escritas = (tablas[t.id] || []).filter(r => Object.values(r).some(Boolean)).length;
      if (t.max && escritas > t.max) av.push({ tipo: 'error', txt: `${t.et}: caben ${t.max} filas en la hoja.` });
    }
    for (const c of camposDe(def)) {
      if (!c.oblig || (c.visible && !c.visible(d))) continue;
      if (!String(d[c.id] ?? '').trim()) av.push({ tipo: 'falta', txt: `Falta: ${c.et}.`, campo: c.id });
    }
    if (!p.nombre_completo) av.unshift({ tipo: 'falta', txt: 'Falta la persona: búscala o escribe sus datos.' });
    else if (!p.dni) av.push({ tipo: 'falta', txt: 'Falta el DNI.' });
    return { d, av };
  }

  function htmlCampo(c, valor, def) {
    const id = 'f_' + c.id; const req = c.oblig ? '<span class="obl" title="Obligatorio">*</span>' : '';
    const ayuda = c.ayuda ? `<span class="ayuda">${esc(c.ayuda)}</span>` : '';
    const ancho = c.ancho === 'medio' ? ' medio' : '';
    const vis = c.visible ? ` data-visible="1"` : '';
    let control = '';
    const ph = c.ph ? ` placeholder="${esc(c.ph)}"` : '';
    if (c.tipo === 'area') control = `<textarea id="${id}" data-campo="${c.id}" rows="2"${ph}>${esc(valor)}</textarea>`;
    else if (c.tipo === 'fecha') control = `<input id="${id}" data-campo="${c.id}" type="date" value="${esc(C.iso(C.aFecha(valor)))}">`;
    else if (c.tipo === 'numero') control = `<input id="${id}" data-campo="${c.id}" type="number" inputmode="numeric" min="0" value="${esc(valor)}"${ph}>`;
    else if (c.tipo === 'calculado') control = `<input id="${id}" data-calc="${c.id}" readonly tabindex="-1" value="">`;
    else if (c.tipo === 'checklist') {
      const fuera = new Set(Array.isArray(valor) ? valor : []);
      const ops = (typeof c.opciones === 'function' ? c.opciones(S.ajustes) : c.opciones) || [];
      const n = ops.filter(o => !fuera.has(o.v)).length;
      control = ops.length ? `<div class="checklist" role="group" aria-label="${esc(c.et)}">${ops.map(o => `<label><input type="checkbox" data-check="${c.id}" value="${esc(o.v)}" ${fuera.has(o.v) ? '' : 'checked'}><span class="ck-fecha">${esc(o.sub || '')}</span><span class="ck-texto">${esc(o.et)}</span></label>`).join('')}</div>
        <div class="checklist-pie"><span data-ckcuenta="${c.id}">${n} de ${ops.length} marcados</span><span><button type="button" class="enlace" data-cktodos="${c.id}">Todos</button> · <button type="button" class="enlace" data-ckninguno="${c.id}">Ninguno</button> · <a class="enlace" href="#/ajustes">Editar lista</a></span></div>`
        : `<div class="vacio" style="padding:14px">No hay ejercicios en la lista. <a class="enlace" href="#/ajustes">Añádelos en Ajustes</a>.</div>`;
    }
    else if (c.tipo === 'radio') control = `<div class="radios" role="radiogroup" aria-label="${esc(c.et)}">${c.opciones.map(o => `<label><input type="radio" name="${id}" data-campo="${c.id}" value="${esc(o.v)}" ${String(valor) === o.v ? 'checked' : ''}>${esc(o.et)}</label>`).join('')}</div>`;
    else if (c.tipo === 'opciones' && c.libre) control = `<input id="${id}" data-campo="${c.id}" list="${id}_l" value="${esc(valor)}" autocomplete="off"${ph}><datalist id="${id}_l">${c.opciones.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
    else if (c.tipo === 'opciones') control = `<select id="${id}" data-campo="${c.id}">${['', ...c.opciones].map(o => `<option ${String(valor) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else {
      const sug = c.sugerencias ? ` list="${id}_l"` : '';
      control = `<input id="${id}" data-campo="${c.id}" value="${esc(valor)}" autocomplete="off"${sug}${ph}>${c.sugerencias ? `<datalist id="${id}_l">${c.sugerencias.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}`;
    }
    const etq = (c.tipo === 'radio' || c.tipo === 'checklist') ? `<span class="etq">${esc(c.et)}${req}</span>` : `<label for="${id}">${esc(c.et)}${req}</label>`;
    return `<div class="campo${ancho}" data-c="${c.id}"${vis}>${etq}${control}${ayuda}</div>`;
  }

  /* Tablas con muchas columnas (p. ej. mandos): una ficha por fila, con las columnas agrupadas. */
  function htmlFichas(t, filas) {
    const input = (c, r, i) => {
      const v = r[c.id] ?? '';
      const comun = `data-t="${t.id}" data-f="${i}" data-k="${c.id}" aria-label="${esc((c.grupo ? c.grupo + ' ' : '') + c.et)} ${i + 1}"`;
      return c.tipo === 'fecha' ? `<input type="date" ${comun} value="${esc(C.iso(C.aFecha(v)))}">` : `<input ${comun} value="${esc(v)}" placeholder="${esc(c.ph || '')}">`;
    };
    const sueltas = t.columnas.filter(c => !c.grupo);
    const grupos = []; for (const c of t.columnas) if (c.grupo && !grupos.includes(c.grupo)) grupos.push(c.grupo);
    const html = filas.map((r, i) => `<div class="ficha-fila">
      <div class="ficha-fila-cab"><span>${esc(t.fichas)} ${i + 1}</span><button type="button" data-quitar="${t.id}:${i}" title="Quitar" aria-label="Quitar ${esc(t.fichas)} ${i + 1}">×</button></div>
      <div class="campos">${sueltas.map(c => `<div class="campo medio"><label>${esc(c.et)}</label>${input(c, r, i)}</div>`).join('')}</div>
      <div class="ficha-grupos">${grupos.map(g => `<fieldset><legend>${esc(g)}</legend>${t.columnas.filter(c => c.grupo === g).map(c => `<label><span>${esc(c.et)}</span>${input(c, r, i)}</label>`).join('')}</fieldset>`).join('')}</div>
    </div>`).join('');
    return html + `<div class="tabla-pie"><span>${filas.length} de ${t.max || '∞'}${t.ayuda ? ' · ' + esc(t.ayuda) : ''}</span>${!t.max || filas.length < t.max ? `<button class="btn suave peq" type="button" data-anadir="${t.id}">+ Añadir ${esc(t.fichas.toLowerCase())}</button>` : ''}</div>`;
  }

  function htmlTabla(t, filas) {
    if (t.fichas) return htmlFichas(t, filas);
    const cab = t.columnas.map(c => `<th>${esc(c.et)}</th>`).join('');
    const cuerpo = filas.map((r, i) => `<tr><td class="idx">${i + 1}</td>${t.columnas.map(c => {
      if (c.tipo === 'calculado') return `<td class="calc" data-calcfila="${c.id}">${esc(c.calc ? c.calc(r) : '')}</td>`;
      const v = r[c.id] ?? '';
      if (c.tipo === 'fecha') return `<td><input type="date" data-t="${t.id}" data-f="${i}" data-k="${c.id}" value="${esc(C.iso(C.aFecha(v)))}" aria-label="${esc(c.et)} ${i + 1}"></td>`;
      if (c.tipo === 'opciones') return `<td><select data-t="${t.id}" data-f="${i}" data-k="${c.id}" aria-label="${esc(c.et)} ${i + 1}">${['', ...c.opciones].map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></td>`;
      return `<td><input data-t="${t.id}" data-f="${i}" data-k="${c.id}" value="${esc(v)}" placeholder="${esc(c.ph || '')}" aria-label="${esc(c.et)} ${i + 1}"></td>`;
    }).join('')}<td class="quitar"><button type="button" data-quitar="${t.id}:${i}" title="Quitar fila" aria-label="Quitar fila ${i + 1}">×</button></td></tr>`).join('');
    const anchos = t.columnas.map(c => c.tipo === 'calculado' ? '<col style="width:56px">' : (c.tipo === 'fecha' ? '<col style="width:136px">' : '<col>')).join('');
    return `<div class="tabla-ed"><table><colgroup><col style="width:26px">${anchos}<col style="width:30px"></colgroup><thead><tr><th></th>${cab}<th></th></tr></thead><tbody>${cuerpo}</tbody></table></div>
      <div class="tabla-pie"><span>${filas.length} de ${t.max || '∞'} filas${t.ayuda ? ' · ' + esc(t.ayuda) : ''}</span>${!t.max || filas.length < t.max ? `<button class="btn suave peq" type="button" data-anadir="${t.id}">+ Añadir fila</button>` : ''}</div>`;
  }

  async function vistaEditor(def) {
    const tags = await etiquetasDe(def);
    const modo = S.modo[clave(def)] || 'una';
    const valores = S.valores[clave(def)] || (S.valores[clave(def)] = {});
    const tablas = S.tablas[clave(def)] || (S.tablas[clave(def)] = {});
    for (const t of def.tablas || []) if (!tablas[t.id]) tablas[t.id] = Array.from({ length: t.inicio ?? (t.fichas ? 1 : Math.min(t.max || 3, 3)) }, () => ({}));
    const sec = SECCIONES[def.seccion];
    pintar(`<div class="editor">
      <aside class="panel" aria-label="Datos del documento">
        <div class="panel-cab">
          <div class="miga"><a href="#/">Inicio</a> / <a href="#/${def.seccion}">${sec.n} · ${sec.nombre}</a> / <span>${esc(def.grupo || '')}</span></div>
          <h1>${esc(def.titulo)}</h1>
          <div class="norma"><span class="chip">Ref.</span><span>${esc(def.norma || '')}</span></div>
          <div class="modo" role="group" aria-label="Para quién">
            <button type="button" data-modo="una" aria-pressed="${modo === 'una'}">Una persona</button>
            <button type="button" data-modo="varias" aria-pressed="${modo === 'varias'}">Varias a la vez</button>
          </div>
        </div>
        <div class="panel-cuerpo">
          <div class="seccion-form" id="sec-persona"></div>
          <div id="sec-campos"></div>
          <div class="seccion-form" id="sec-revision"><h2><span class="n">✓</span>Revisión</h2><div class="avisos" id="avisos"></div></div>
        </div>
      </aside>
      <section class="vista" aria-label="Vista previa">
        <div class="vista-barra">
          <div class="estado"><span class="listo" id="luz"></span><span id="estado-texto">Preparando…</span></div>
          <div class="zoom" aria-label="Zoom"><button type="button" data-zoom="-" aria-label="Alejar">−</button><span id="zoom-txt">Ajustar</span><button type="button" data-zoom="+" aria-label="Acercar">+</button></div>
          <div class="acciones-export" id="acciones"></div>
        </div>
        <div id="desborde"></div>
        <div class="hojas"><div class="hojas-marco" id="marco"><div class="hojas-escala" id="hojas"></div></div></div>
      </section>
    </div>`);
    const ctx = { def, tags, valores, tablas };
    pintarPersona(ctx); pintarCampos(ctx); pintarAcciones(ctx);
    enlazarEditor(ctx);
    programar(ctx, 0);
  }

  function camposPersona(def, tags) {
    const usa = k => tags.has(k);
    const l = [['trat', 'Tratamiento'], ['nombre', 'Nombre'], ['apellidos', 'Apellidos'], ['empleo', 'Empleo'], ['dni', 'DNI']];
    if (usa('empleo_abrev')) l.push(['empleo_abrev', 'Empleo abreviado']);
    if (usa('cia') || usa('compania') || (def.persona || []).includes('cia')) l.push(['cia', 'Compañía']);
    for (const k of def.persona || []) if (k !== 'cia' && !camposDe(def).some(c => c.id === k)) l.push([k, { telefono: 'Teléfono', domicilio: 'Domicilio', email: 'Correo' }[k] || k]);
    return l;
  }

  function pintarPersona(ctx) {
    const { def, tags } = ctx; const modo = S.modo[clave(def)] || 'una';
    const cont = $('#sec-persona');
    if (modo === 'varias') {
      if (!S.personas.length) {
        cont.innerHTML = `<h2><span class="n">1</span>Personas</h2><div class="vacio" style="padding:18px"><strong style="font-size:19px">Necesitas el Excel</strong>Para sacar el documento de muchas personas a la vez, carga primero el Excel de personal.<br><br><button class="btn principal peq" type="button" data-acc2="cargar">Cargar Excel</button> <button class="enlace" data-acc2="ficticios">o datos inventados</button></div>`;
        return;
      }
      const sel = S.lote[clave(def)] || (S.lote[clave(def)] = new Set());
      const cias = [...new Set(S.personas.map(p => p.cia).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
      const emps = [...new Set(S.personas.map(p => p.empleo_abrev || p.empleo).filter(Boolean))];
      cont.innerHTML = `<h2><span class="n">1</span>Personas</h2>
        <div class="lote-filtros">
          <select id="lote-cia" aria-label="Compañía"><option value="">Todas las CÍAS</option>${cias.map(c => `<option>${esc(c)}</option>`).join('')}</select>
          <select id="lote-emp" aria-label="Empleo"><option value="">Todos los empleos</option>${emps.map(c => `<option>${esc(c)}</option>`).join('')}</select>
          <input id="lote-q" placeholder="Filtrar…" aria-label="Filtrar por nombre">
        </div>
        <div class="lote-lista" id="lote-lista"></div>
        <div class="lote-pie"><span id="lote-n"></span><span><button class="enlace" type="button" id="lote-todos">Marcar los visibles</button> · <button class="enlace" type="button" id="lote-ninguno">Ninguno</button></span></div>
        <p class="sin-excel">Los datos de abajo valen para todos. Lo personal (nombre, DNI, empleo, escala…) sale del Excel de cada uno.</p>`;
      const pintarLista = () => {
        const cia = $('#lote-cia').value, emp = $('#lote-emp').value, q = C.norm($('#lote-q').value);
        const vis = S.personas.filter(p => (!cia || p.cia === cia) && (!emp || (p.empleo_abrev || p.empleo) === emp) && (!q || p._busqueda.includes(q)));
        $('#lote-lista').innerHTML = vis.map(p => { const i = S.personas.indexOf(p); return `<label><input type="checkbox" data-lote="${i}" ${sel.has(i) ? 'checked' : ''}><span class="emp">${esc(p.empleo_abrev || '')}</span><span>${esc(p.apellidos_nombre)}</span><span class="dni">${esc(p.dni)}</span></label>`; }).join('') || '<div class="nada" style="padding:12px;color:var(--gris)">Nadie con ese filtro.</div>';
        $('#lote-n').textContent = `${sel.size} seleccionadas`;
        cont._visibles = vis;
      };
      ['lote-cia', 'lote-emp', 'lote-q'].forEach(id => $('#' + id).addEventListener('input', pintarLista));
      $('#lote-lista').addEventListener('change', e => { const i = +e.target.dataset.lote; e.target.checked ? sel.add(i) : sel.delete(i); $('#lote-n').textContent = `${sel.size} seleccionadas`; pintarAcciones(ctx); programar(ctx); });
      $('#lote-todos').addEventListener('click', () => { cont._visibles.forEach(p => sel.add(S.personas.indexOf(p))); pintarLista(); pintarAcciones(ctx); programar(ctx); });
      $('#lote-ninguno').addEventListener('click', () => { sel.clear(); pintarLista(); pintarAcciones(ctx); programar(ctx); });
      pintarLista();
      return;
    }
    const p = personaDe(def);
    const iniciales = (p.nombre[0] || '·') + (p.apellidos[0] || '');
    const campos = camposPersona(def, tags);
    cont.innerHTML = `<h2><span class="n">1</span>Persona</h2>
      <div class="busca-persona">
        <div class="entrada">${ico.buscar}<input id="busca" role="combobox" aria-expanded="false" aria-controls="lista-personas" aria-autocomplete="list" autocomplete="off"
          placeholder="${S.personas.length ? 'Apellido, nombre o DNI… (pulsa /)' : 'Sin Excel: rellena los datos abajo'}" ${S.personas.length ? '' : 'disabled'}></div>
        <div class="lista-personas oculto" id="lista-personas" role="listbox" aria-label="Personas"></div>
      </div>
      ${S.personas.length ? '' : `<p class="sin-excel">Sin Excel cargado. <button class="enlace" type="button" data-acc2="cargar">Cargar Excel</button> · <button class="enlace" type="button" data-acc2="ficticios">probar con datos inventados</button></p>`}
      <div class="ficha">
        <div class="ficha-cab"><span class="avatar">${esc(iniciales.toUpperCase())}</span><div><strong>${esc(p.nombre_completo || p.nombre || 'Sin persona elegida')}</strong><span>${esc([p.empleo, p.dni].filter(Boolean).join(' · ') || 'Los datos se pueden corregir aquí sin tocar el Excel')}</span></div>
        ${p.nombre ? '<button class="enlace" type="button" id="limpiar-persona">Quitar</button>' : ''}</div>
        <div class="campos">${campos.map(([k, et]) => {
          if (k === 'trat') return `<div class="campo medio"><label for="p_trat">${et}</label><select id="p_trat" data-p="trat"><option ${p.trat === 'D.' ? 'selected' : ''}>D.</option><option ${p.trat === 'Dª' ? 'selected' : ''}>Dª</option></select></div>`;
          const medio = ['nombre', 'empleo', 'dni', 'empleo_abrev', 'cia', 'telefono'].includes(k) ? ' medio' : '';
          return `<div class="campo${medio}"><label for="p_${k}">${esc(et)}</label><input id="p_${k}" data-p="${k}" value="${esc(p[k] || '')}" autocomplete="off"></div>`;
        }).join('')}</div>
      </div>`;
    const inp = $('#busca'), lista = $('#lista-personas');
    let res = [], act = 0;
    const cerrar = () => { lista.classList.add('oculto'); inp.setAttribute('aria-expanded', 'false'); };
    const resaltar = (txt, q) => { let h = esc(txt); for (const t of C.norm(q).split(' ').filter(Boolean)) { const i = C.norm(txt).indexOf(t); if (i >= 0) { const orig = txt.substr(i, t.length); h = h.replace(esc(orig), `<mark>${esc(orig)}</mark>`); } } return h; };
    const pintar = () => {
      lista.innerHTML = res.length ? res.map((x, i) => `<div role="option" id="op-${i}" data-i="${i}" aria-selected="${i === act}"><span class="emp">${esc(x.empleo_abrev || x.empleo || '')}</span><span class="nom">${resaltar(x.apellidos_nombre, inp.value)}<br><small class="texto-gris">${esc(x.cia ? 'CÍA ' + x.cia : '')}</small></span><span class="dni">${esc(x.dni)}</span></div>`).join('') : '<div class="nada">Nadie con ese nombre o DNI.</div>';
      lista.classList.remove('oculto'); inp.setAttribute('aria-expanded', 'true');
      if (res.length) inp.setAttribute('aria-activedescendant', 'op-' + act);
    };
    const elegir = x => { S.personaDoc[clave(def)] = copiaPersona(x); limpiarValoresPersona(ctx); cerrar(); pintarPersona(ctx); pintarCampos(ctx); programar(ctx, 0); toast(`${x.apellidos_nombre}: datos cargados.`); };
    inp.addEventListener('input', () => { res = C.buscarPersonas(S.personas, inp.value); act = 0; if (inp.value.trim()) pintar(); else cerrar(); });
    inp.addEventListener('keydown', e => {
      if (lista.classList.contains('oculto')) return;
      if (e.key === 'ArrowDown') { act = Math.min(act + 1, res.length - 1); pintar(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { act = Math.max(act - 1, 0); pintar(); e.preventDefault(); }
      else if (e.key === 'Enter' && res[act]) { elegir(res[act]); e.preventDefault(); }
      else if (e.key === 'Escape') cerrar();
    });
    inp.addEventListener('blur', () => setTimeout(cerrar, 150));
    lista.addEventListener('mousedown', e => { const o = e.target.closest('[data-i]'); if (o) { e.preventDefault(); elegir(res[+o.dataset.i]); } });
    if (!cont._enlazado) cont.addEventListener('input', e => {
      const k = e.target.dataset.p; if (!k) return;
      const pp = personaDe(def); pp[k] = e.target.value; completarPersona(pp); programar(ctx);
    });
    cont._enlazado = true;
    const q = $('#limpiar-persona'); if (q) q.addEventListener('click', () => { S.personaDoc[clave(def)] = vaciaPersona(); limpiarValoresPersona(ctx); pintarPersona(ctx); pintarCampos(ctx); programar(ctx, 0); });
    if (S.personas.length && !p.nombre) setTimeout(() => inp.focus(), 50);
  }
  // al cambiar de persona, los campos que dependen de ella vuelven a su valor por defecto
  function limpiarValoresPersona(ctx) {
    for (const c of camposDe(ctx.def)) if (c.persona || typeof c.def === 'function') {
      if (c.persona || /domicilio|telefono/.test(c.id) || c.id === 'domicilio_habitual') delete ctx.valores[c.id];
    }
  }

  function pintarCampos(ctx) {
    const { def, valores, tablas } = ctx;
    const p = personaDe(def);
    const grupos = []; const porGrupo = {};
    for (const c of camposDe(def)) { const g = c.grupo || 'Datos del documento'; if (!porGrupo[g]) { porGrupo[g] = []; grupos.push(g); } porGrupo[g].push(c); }
    let n = 2;
    const html = grupos.map(g => `<div class="seccion-form"><h2><span class="n">${n++}</span>${esc(g)}</h2><div class="campos">${porGrupo[g].map(c => htmlCampo(c, valores[c.id] !== undefined ? valores[c.id] : defecto(c, p), def)).join('')}</div></div>`).join('')
      + (def.tablas || []).map(t => `<div class="seccion-form"><h2><span class="n">${n++}</span>${esc(t.et)}</h2><div data-tabla="${t.id}">${htmlTabla(t, tablas[t.id])}</div></div>`).join('');
    $('#sec-campos').innerHTML = html;
    visibilidad(ctx);
  }
  function visibilidad(ctx) {
    const { d } = construirDatos(ctx.def, ctx.def && personaDe(ctx.def), ctx.valores, ctx.tablas);
    for (const c of camposDe(ctx.def)) if (c.visible) { const el = $(`[data-c="${c.id}"]`); if (el) el.classList.toggle('oculto', !c.visible(d)); }
  }

  function enlazarEditor(ctx) {
    const { def, valores, tablas } = ctx;
    const panel = $('.panel');
    panel.addEventListener('click', e => {
      const m = e.target.closest('[data-modo]');
      if (m) { S.modo[clave(def)] = m.dataset.modo; $$('[data-modo]').forEach(b => b.setAttribute('aria-pressed', String(b === m))); pintarPersona(ctx); pintarAcciones(ctx); programar(ctx, 0); return; }
      const a2 = e.target.closest('[data-acc2]');
      if (a2) { a2.dataset.acc2 === 'cargar' ? $('#archivo-excel').click() : datosFicticios(); return; }
      const an = e.target.closest('[data-anadir]');
      if (an) { const t = def.tablas.find(x => x.id === an.dataset.anadir); tablas[t.id].push({}); $(`[data-tabla="${t.id}"]`).innerHTML = htmlTabla(t, tablas[t.id]); const ins = $$(`[data-tabla="${t.id}"] tbody tr:last-child input, [data-tabla="${t.id}"] .ficha-fila:last-of-type input`); if (ins[0]) ins[0].focus(); return; }
      const q = e.target.closest('[data-quitar]');
      if (q) { const [tid, i] = q.dataset.quitar.split(':'); const t = def.tablas.find(x => x.id === tid); tablas[tid].splice(+i, 1); if (!tablas[tid].length) tablas[tid].push({}); $(`[data-tabla="${tid}"]`).innerHTML = htmlTabla(t, tablas[tid]); programar(ctx); }
    });
    const contarCheck = id => {
      const total = $$(`[data-check="${id}"]`).length, n = $$(`[data-check="${id}"]:checked`).length;
      const c = $(`[data-ckcuenta="${id}"]`); if (c) c.textContent = `${n} de ${total} marcados`;
      valores[id] = $$(`[data-check="${id}"]:not(:checked)`).map(x => x.value);
      programar(ctx);
    };
    panel.addEventListener('click', e => {
      const t = e.target.closest('[data-cktodos],[data-ckninguno]'); if (!t) return;
      const id = t.dataset.cktodos || t.dataset.ckninguno;
      $$(`[data-check="${id}"]`).forEach(x => { x.checked = !!t.dataset.cktodos; });
      contarCheck(id);
    });
    const alCambiar = e => {
      const el = e.target;
      if (el.dataset.check) { if (e.type === 'change') contarCheck(el.dataset.check); return; }
      if (el.dataset.campo) {
        valores[el.dataset.campo] = el.value;
        if (el.type === 'radio' || el.tagName === 'SELECT') visibilidad(ctx);
        el.closest('.campo')?.classList.remove('falta');
        programar(ctx);
      } else if (el.dataset.t) {
        const r = tablas[el.dataset.t][+el.dataset.f]; r[el.dataset.k] = el.value;
        const t = def.tablas.find(x => x.id === el.dataset.t);
        const tr = el.closest('tr');
        if (tr) for (const col of t.columnas) if (col.calc) { const td = tr.querySelector(`[data-calcfila="${col.id}"]`); if (td) td.textContent = col.calc(r); }
        programar(ctx);
      }
    };
    panel.addEventListener('input', alCambiar);
    panel.addEventListener('change', alCambiar);
    $('.vista-barra').addEventListener('click', e => {
      const z = e.target.closest('[data-zoom]');
      if (z) { const act = S.zoom === 'ajustar' ? escalaAjuste() : S.zoom; S.zoom = Math.min(2, Math.max(.35, +(act + (z.dataset.zoom === '+' ? .1 : -.1)).toFixed(2))); aplicarZoom(); }
      const b = e.target.closest('[data-exp]'); if (b) exportar(ctx, b.dataset.exp, b);
    });
    $('#zoom-txt').addEventListener('dblclick', () => { S.zoom = 'ajustar'; aplicarZoom(); });
    window.onresize = () => { if (S.zoom === 'ajustar') aplicarZoom(); };
  }

  function pintarAcciones(ctx) {
    const modo = S.modo[clave(ctx.def)] || 'una';
    const n = (S.lote[clave(ctx.def)] || new Set()).size;
    $('#acciones').innerHTML = modo === 'varias'
      ? `<button class="btn suave" data-exp="zip" ${n ? '' : 'disabled'}>${ico.zip}Word (${n}) en ZIP</button><button class="btn principal" data-exp="pdf-lote" ${n ? '' : 'disabled'}>${ico.pdf}Un PDF con ${n}</button>`
      : `<button class="btn suave" data-exp="word">${ico.word}Word</button><button class="btn suave" data-exp="imprimir">${ico.imprimir}Imprimir</button><button class="btn principal" data-exp="pdf">${ico.pdf}PDF</button>`;
  }

  // ------------------------------------------------------------------ previsualización
  let temporizador = null;
  function programar(ctx, ms = 320) {
    $('#luz')?.classList.add('cargando'); $('#estado-texto') && ($('#estado-texto').textContent = 'Actualizando…');
    clearTimeout(temporizador); temporizador = setTimeout(() => actualizar(ctx), ms);
  }
  function personaVista(ctx) {
    const modo = S.modo[clave(ctx.def)] || 'una';
    if (modo === 'varias') { const sel = [...(S.lote[clave(ctx.def)] || [])]; return sel.length ? copiaPersona(S.personas[sel[0]]) : null; }
    return personaDe(ctx.def);
  }
  let contador = 0;
  async function renderizar(blob, destino) {
    const cls = 'dx' + (++contador);
    await docx.renderAsync(blob, destino, null, {
      className: cls, inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true,
      ignoreLastRenderedPageBreak: true, experimental: true, trimXmlDeclaration: true, useBase64URL: true,
      renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
    });
    for (const s of destino.querySelectorAll('section.' + cls)) s.classList.add('docx', 'hoja-docx');
    destino.querySelector('.' + cls + '-wrapper')?.classList.add('docx-wrapper');
    const st = document.createElement('style');
    st.textContent = `section.${cls} > footer { display:flex; flex-direction:column; justify-content:flex-end; } section.${cls} * { hyphens: manual !important; -webkit-hyphens: manual !important; }`; // Word no divide palabras con guion
    destino.appendChild(st);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return destino;
  }
  function desbordes(cont) {
    const out = [];
    cont.querySelectorAll('section.hoja-docx').forEach((s, i) => {
      const min = parseFloat((s.style.minHeight || '').replace('pt', '')) * 4 / 3;
      if (min && s.scrollHeight > min + 2) out.push(i + 1);
    });
    return out;
  }
  /* Espacio libre (px) al pie de la hoja más llena; negativo si algo no cabe. */
  function huecoLibre(cont) {
    let min = Infinity;
    cont.querySelectorAll('section.hoja-docx').forEach(s => {
      const art = s.querySelector('article'); if (!art) return;
      const pie = s.querySelector('footer');
      const limite = pie ? pie.offsetTop : s.clientHeight - parseFloat(getComputedStyle(s).paddingBottom);
      const altoPagina = parseFloat((s.style.minHeight || '').replace('pt', '')) * 4 / 3;
      const desborde = altoPagina && s.scrollHeight > altoPagina + 2 ? -(s.scrollHeight - altoPagina) : Infinity;
      min = Math.min(min, limite - (art.offsetTop + art.offsetHeight), desborde);
    });
    return min;
  }
  const MARGEN_SEGURIDAD = 30; // px (≈ 0,8 cm): colchón para que en Word tampoco salte de hoja
  /** Rellena y maqueta. Si el documento admite salto automático y no cabe holgado en una hoja,
   *  vuelve a generarlo con el salto (los bloques que van juntos pasan enteros a la hoja siguiente). */
  async function documentoFinal(def, d) {
    let blob = await M.rellenar(window.PLANTILLAS[def.plantilla], d);
    const cont = document.createElement('div'); $('#taller').appendChild(cont);
    await renderizar(blob, cont);
    if (def.autoSalto && !d[def.autoSalto] && huecoLibre(cont) < MARGEN_SEGURIDAD) {
      d[def.autoSalto] = '1';
      blob = await M.rellenar(window.PLANTILLAS[def.plantilla], d);
      await renderizar(blob, cont);
    }
    return { blob, cont };
  }

  async function actualizar(ctx) {
    if (!$('#avisos') || !$('#hojas')) return; // se ha cambiado de página
    const { def } = ctx; const v = ++S.version;
    const persona = personaVista(ctx);
    const { d, av } = construirDatos(def, persona, ctx.valores, ctx.tablas);
    pintarRevision(ctx, d, av);
    try {
      const { blob, cont: tmp } = await documentoFinal(def, d);
      if (v !== S.version) { tmp.remove(); return; }
      const hojas = $('#hojas'); if (!hojas) { tmp.remove(); return; }
      hojas.replaceChildren(...tmp.childNodes); tmp.remove();
      S.ultimo = { blob, d, av, def, nombre: nombreDoc(def, persona) };
      aplicarZoom();
      const des = desbordes(hojas);
      $('#desborde').innerHTML = des.length ? `<div class="desborde aviso av-error">El texto no cabe en la hoja ${des.join(', ')}: al imprimir pasaría a otra. Acorta algún campo.</div>` : '';
      const nPag = hojas.querySelectorAll('section.hoja-docx').length;
      $('#luz').classList.remove('cargando');
      const faltan = av.filter(a => a.tipo === 'falta' || a.tipo === 'error').length;
      const modo = S.modo[clave(def)] || 'una';
      if (!$('#estado-texto')) return;
      $('#estado-texto').innerHTML = (modo === 'varias' ? `Vista de la 1.ª persona · ` : '') + `<b>${nPag} ${nPag === 1 ? 'hoja' : 'hojas'} A4</b> · ` + (faltan ? `${faltan} ${faltan === 1 ? 'cosa' : 'cosas'} por revisar` : 'listo para exportar');
    } catch (e) {
      console.error(e); $('#estado-texto').textContent = 'Error al generar: ' + e.message; $('#luz').classList.remove('cargando');
    }
  }
  function pintarRevision(ctx, d, av) {
    for (const c of camposDe(ctx.def)) if (c.tipo === 'calculado') { const el = $(`[data-calc="${c.id}"]`); if (el) el.value = d[c.id] || ''; }
    $$('.campo.falta').forEach(e => e.classList.remove('falta'));
    for (const a of av) if (a.campo) $(`[data-c="${a.campo}"]`)?.classList.add('falta');
    const orden = { error: 0, falta: 1, aviso: 2, info: 3 };
    const l = [...av].sort((a, b) => orden[a.tipo] - orden[b.tipo]);
    if (!l.some(a => a.tipo === 'error' || a.tipo === 'falta')) l.unshift({ tipo: 'ok', txt: 'Todo relleno. Revisa la hoja de la derecha y exporta.' });
    $('#avisos').innerHTML = l.map(a => `<div class="aviso av-${a.tipo}"><span>${esc(a.txt)}${a.enlace ? ` <a class="enlace" href="${esc(a.enlace)}">${esc(a.textoEnlace || 'Ir')}</a>` : ''}</span></div>`).join('');
  }
  function escalaAjuste() {
    const vista = $('.vista'); const s = $('#hojas section.hoja-docx'); if (!vista || !s) return 1;
    return Math.min(1.05, Math.max(.3, (vista.clientWidth - 56) / s.offsetWidth));
  }
  function aplicarZoom() {
    const h = $('#hojas'); if (!h) return;
    const z = S.zoom === 'ajustar' ? escalaAjuste() : S.zoom;
    h.style.transform = `scale(${z})`;
    const marco = $('#marco');
    marco.style.width = (h.offsetWidth * z) + 'px';
    marco.style.height = (h.scrollHeight * z) + 'px';
    $('#zoom-txt').textContent = S.zoom === 'ajustar' ? `${Math.round(z * 100)} %` : Math.round(z * 100) + ' %';
  }

  // ------------------------------------------------------------------ exportar
  function nombreDoc(def, p) {
    return C.nombreArchivo(def.archivo || def.id, p && p.apellidos, p && p.nombre) || def.id;
  }
  async function pdfDe(blob, titulo) {
    const cont = document.createElement('div'); $('#taller').appendChild(cont);
    try { await renderizar(blob, cont); return await ExportarPdf.crearPdf(cont, titulo); } finally { cont.remove(); }
  }
  function confirmarFaltas() {
    const av = (S.ultimo && S.ultimo.av) || [];
    const n = av.filter(a => a.tipo === 'falta' || a.tipo === 'error').length;
    return !n || confirm(`Hay ${n} ${n === 1 ? 'cosa' : 'cosas'} por revisar (mira «Revisión»). ¿Exportar igualmente?`);
  }
  async function exportar(ctx, tipo, boton) {
    const { def } = ctx;
    const textoBtn = boton.innerHTML; boton.disabled = true;
    try {
      if (tipo === 'word' || tipo === 'pdf' || tipo === 'imprimir') {
        if (!S.ultimo || S.ultimo.def !== def) { await actualizar(ctx); }
        if (!confirmarFaltas()) return;
        const { blob, nombre } = S.ultimo;
        if (tipo === 'word') { descargar(blob, nombre + '.docx'); toast('Word descargado.'); return; }
        boton.textContent = 'Generando…';
        const pdf = await pdfDe(blob, def.titulo);
        if (tipo === 'pdf') { descargar(pdf, nombre + '.pdf'); toast('PDF descargado. Imprímelo a «Tamaño real» (100 %).'); return; }
        imprimirPdf(pdf);
        return;
      }
      const sel = [...(S.lote[clave(def)] || [])].map(i => S.personas[i]);
      if (!sel.length) return;
      if (tipo === 'zip') {
        const zip = new JSZip(); const usados = new Set();
        for (let i = 0; i < sel.length; i++) {
          boton.textContent = `Word ${i + 1}/${sel.length}…`;
          const { d } = construirDatos(def, copiaPersona(sel[i]), ctx.valores, ctx.tablas);
          let nom = nombreDoc(def, sel[i]); while (usados.has(nom)) nom += '_2'; usados.add(nom);
          const { blob, cont } = await documentoFinal(def, d); cont.remove();
          zip.file(nom + '.docx', blob);
        }
        descargar(await zip.generateAsync({ type: 'blob' }), C.nombreArchivo(def.id, sel.length + '_personas') + '.zip');
        toast(`${sel.length} documentos Word en un ZIP.`);
      } else if (tipo === 'pdf-lote') {
        const pdf = await ExportarPdf.nuevoPdf(def.titulo);
        for (let i = 0; i < sel.length; i++) {
          boton.textContent = `PDF ${i + 1}/${sel.length}…`;
          const { d } = construirDatos(def, copiaPersona(sel[i]), ctx.valores, ctx.tablas);
          const { cont } = await documentoFinal(def, d);
          try { await pdf.anadir(cont); } finally { cont.remove(); }
        }
        descargar(await pdf.blob(), C.nombreArchivo(def.id, sel.length + '_personas') + '.pdf');
        toast(`PDF con ${sel.length} documentos (${pdf.paginas()} hojas), listo para imprimir de una vez.`);
      }
    } catch (e) { console.error(e); toast('No se pudo exportar: ' + e.message, 'error'); }
    finally { boton.disabled = false; boton.innerHTML = textoBtn; }
  }
  function imprimirPdf(pdf) {
    const url = URL.createObjectURL(pdf);
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    f.src = url; document.body.appendChild(f);
    f.onload = () => {
      setTimeout(() => {
        try { f.contentWindow.focus(); f.contentWindow.print(); }
        catch (e) { window.open(url, '_blank'); }
        toast('En el cuadro de impresión: escala «Predeterminada» o «Tamaño real», nunca «Ajustar».');
      }, 300);
      setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 120000);
    };
  }

  // ======================================================================= ajustes
  function vistaAjustes() {
    const a = S.ajustes; const grupos = {};
    for (const d of C.AJUSTES_DEF) (grupos[d.grupo] = grupos[d.grupo] || []).push(d);
    const raiz = pintar(`${banda('<a href="#/">Inicio</a> / <span>Datos de la unidad</span>', 'Datos de la <i>unidad</i>', 'Se escriben una vez y salen en todos los documentos. Se guardan solo en este navegador (no son datos personales). Si cambia el jefe de la unidad o el destinatario, se cambia aquí.')}<section class="pagina"><div class="contenedor" style="max-width:900px">
      ${Object.entries(grupos).map(([g, l]) => `<div class="tarjeta"><h2>${esc(g)}</h2><div class="campos" style="margin-top:12px">${l.map(d => `<div class="campo"><label for="a_${d.k}">${esc(d.et)}</label>${d.tipo === 'area' ? `<textarea id="a_${d.k}" data-aj="${d.k}" rows="${Math.max(6, String(a[d.k]).split('\n').length + 1)}" style="font:13px/1.6 var(--mono)">${esc(a[d.k])}</textarea><span class="ayuda">${esc(d.ayuda || 'Cada año: cambia o añade líneas. El texto antes de la barra «|» va en la columna FECHA.')}</span>` : `<input id="a_${d.k}" data-aj="${d.k}" value="${esc(a[d.k])}" placeholder="${esc(d.v)}">`}</div>`).join('')}</div></div>`).join('')}
      <div class="tarjeta"><h2>Restablecer</h2><p class="texto-gris">Vuelve a los valores de fábrica (RIPAC 4).</p><button class="btn suave" id="reset-aj">Restablecer valores</button></div>
    </div></section>`);
    let t;
    raiz.addEventListener('input', e => {
      const k = e.target.dataset.aj; if (!k) return;
      S.ajustes[k] = e.target.value; clearTimeout(t);
      t = setTimeout(() => { C.guardarAjustes(S.ajustes) ? toast('Guardado en este equipo.') : toast('No se pudo guardar (navegador en modo privado).', 'error'); actualizarMarca(); }, 600);
    });
    $('#reset-aj').addEventListener('click', () => { if (!confirm('¿Restablecer todos los datos de la unidad?')) return; C.guardarAjustes({}); S.ajustes = C.ajustes(); vistaAjustes(); actualizarMarca(); toast('Restablecido.'); });
  }
  function actualizarMarca() { /* la marca es fija: IIBPAC «Roger de Lauria» */ }

  // ======================================================================= datos (Excel y columnas)
  function vistaDatos() {
    const n = S.personas.length;
    const ejemplo = S.registros[0] || {};
    const recomendadas = ['escala', 'sexo', 'domicilio', 'fecha_ingreso', 'fin_compromiso'];
    const faltan = recomendadas.filter(k => !S.mapa[k]).map(k => C.CAMPOS_PERSONA.find(c => c.k === k).et);
    const raiz = pintar(`${banda('<a href="#/">Inicio</a> / <span>Base de datos</span>', 'Base de <i>datos</i>', 'El Excel de personal: qué columna es cada dato.')}<section class="pagina"><div class="contenedor" style="max-width:980px">
      ${bloqueCarga()}
      ${n ? `
      ${S.hojas.length > 1 ? `<div class="tarjeta"><h2>Hoja del Excel</h2><select id="hoja" class="campo" style="margin-top:10px;padding:8px;border:1px solid var(--linea-2);border-radius:4px">${S.hojas.map(h => `<option ${h.hoja === S.hoja ? 'selected' : ''}>${esc(h.hoja)}</option>`).join('')}</select></div>` : ''}
      <div class="tarjeta"><h2>Qué columna es cada dato</h2>
        <p class="texto-gris">Se reconoce solo por el título de la columna. Si alguna está mal, cámbiala: este equipo lo recordará para los Excel con las mismas columnas.</p>
        <table class="tabla-datos"><thead><tr><th>Dato</th><th>Columna del Excel</th><th>Primera fila</th></tr></thead><tbody>
        ${C.CAMPOS_PERSONA.map(c => `<tr><td><b>${esc(c.et)}</b></td><td><select data-mapa="${c.k}"><option value="">— ninguna —</option>${S.columnas.map(col => `<option ${S.mapa[c.k] === col ? 'selected' : ''}>${esc(col)}</option>`).join('')}</select></td><td class="muestra">${esc(S.mapa[c.k] ? ejemplo[S.mapa[c.k]] || '' : '')}</td></tr>`).join('')}
        </tbody></table></div>
      ${faltan.length ? `<div class="tarjeta"><h2>Columnas que conviene añadir al Excel</h2><p class="texto-gris">Con ellas se rellenan solos más campos: <b>${faltan.map(esc).join(', ')}</b>. «Escala / especialidad» es la más útil (ej.: MTM CGET ILG); «Sexo» pone D. o Dª.</p></div>` : ''}` : ''}
    </div></section>`);
    enlazarCarga(raiz);
    raiz.addEventListener('change', e => {
      if (e.target.id === 'hoja') { usarHoja(e.target.value); return; }
      const k = e.target.dataset.mapa; if (!k) return;
      S.mapa[k] = e.target.value || undefined;
      const g = C.leerLocal(CLAVE_MAPAS, {}); g[firmaColumnas(S.columnas)] = S.mapa; C.guardarLocal(CLAVE_MAPAS, g);
      rehacerPersonas(); toast('Columna actualizada.');
    });
  }

  // ======================================================================= plantillas propias
  async function cargarPlantillaPropia(file) {
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const et = await M.etiquetas(buf);
      if (!et.campos.length && !et.listas.length) throw new Error('La plantilla no tiene ningún campo {asi}. Mira la guía de esta página.');
      let b64 = ''; for (let i = 0; i < buf.length; i += 0x8000) b64 += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      b64 = btoa(b64);
      const sec = (location.hash.match(/#\/(s[1-4])/) || [])[1] || $('#propia-sec')?.value || 's1';
      const titulo = file.name.replace(/\.docx$/i, '').replace(/[_-]+/g, ' ').trim();
      const id = 'propia_' + C.nombreArchivo(titulo).toLowerCase() + '_' + Date.now().toString(36);
      const l = propias(); l.push({ id, titulo, seccion: sec, b64, etiquetas: et });
      if (!C.guardarLocal(CLAVE_PROPIAS, l)) throw new Error('No hay espacio para guardarla en este navegador.');
      toast(`Plantilla «${titulo}» añadida a ${sec.toUpperCase()} con ${et.campos.length} campos.`);
      location.hash = `#/${sec}/${id}`;
    } catch (e) { console.error(e); toast(e.message, 'error'); }
  }
  function vistaPropias() {
    const l = propias();
    const etiquetas = [['NOMBRE_COMPLETO', 'Nombre y apellidos (en mayúsculas)'], ['Nombre_completo', 'Nombre Y Apellidos (tipo título)'], ['APELLIDOS_NOMBRE', 'APELLIDOS, NOMBRE'], ['trat', 'D. o Dª'],
      ['EMPLEO', 'Empleo'], ['empleo_abrev', 'Empleo abreviado'], ['dni', 'DNI'], ['escala', 'Escala / especialidad'], ['compania', 'Compañía'], ['telefono', 'Teléfono'], ['domicilio', 'Domicilio'],
      ['unidad', 'Nombre de la unidad'], ['UNIDAD', 'Unidad en mayúsculas'], ['localidad_firma', 'Lugar de firma'], ['fecha_firma_larga', 'Fecha en letra (25 de octubre de 2026)'], ['fecha_firma', 'Fecha 25/10/2026'],
      ['destinatario', 'Destinatario'], ['jefe_unidad', 'Jefe de la unidad'], ['cualquier_cosa', 'Crea un campo nuevo en el formulario'], ['fecha_algo', 'Empieza por «fecha»: campo de fecha'], ['fecha_algo_larga', 'Esa fecha en letra']];
    const raiz = pintar(`${banda('<a href="#/">Inicio</a> / <span>Plantillas propias</span>', 'Plantillas <i>propias</i>', '')}<section class="pagina"><div class="contenedor" style="max-width:980px">
      <p class="texto-gris" style="max-width:64ch">Coge cualquier Word, escribe los huecos entre llaves —por ejemplo <code>{NOMBRE_COMPLETO}</code>— y súbelo. Sale un formulario automático y el buscador de personas lo rellena. Se guarda solo en este navegador; para que lo tenga todo el mundo, pásamelo y lo añado a la carpeta.</p>
      <div class="tarjeta"><h2>Añadir plantilla</h2>
        <div class="campos" style="margin-top:12px"><div class="campo medio"><label for="propia-sec">Sección</label><select id="propia-sec">${Object.entries(SECCIONES).map(([k, s]) => `<option value="${k}">${s.n} · ${s.nombre}</option>`).join('')}</select></div>
        <div class="campo medio" style="justify-content:flex-end"><button class="btn principal" id="subir-propia">Elegir Word (.docx)</button></div></div></div>
      ${l.length ? `<div class="tarjeta"><h2>Tus plantillas</h2><table class="tabla-datos"><tbody>${l.map(p => `<tr><td><a href="#/${p.seccion}/${p.id}"><b>${esc(p.titulo)}</b></a></td><td>${p.seccion.toUpperCase()}</td><td>${p.etiquetas.campos.length} campos</td><td style="text-align:right"><button class="enlace" data-borrar="${p.id}">Borrar</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="tarjeta"><h2>Huecos disponibles</h2><p class="texto-gris">Pulsa uno para copiarlo. MAYÚSCULAS en el hueco = valor en mayúsculas; Primera en mayúscula = Tipo Título; minúsculas = tal cual. Para repetir filas de una tabla: pon <code>{#filas}</code> en la primera celda y <code>{/filas}</code> en la última.</p>
        <div class="etiquetas-lista" style="margin-top:12px">${etiquetas.map(([t, d]) => `<button type="button" data-copiar="{${t}}"><code>{${esc(t)}}</code><span>${esc(d)}</span></button>`).join('')}</div></div>
    </div></section>`);
    $('#subir-propia').addEventListener('click', () => $('#archivo-plantilla').click());
    raiz.addEventListener('click', e => {
      const c = e.target.closest('[data-copiar]');
      if (c) { navigator.clipboard?.writeText(c.dataset.copiar).then(() => toast(`${c.dataset.copiar} copiado.`), () => toast(c.dataset.copiar)); }
      const b = e.target.closest('[data-borrar]');
      if (b && confirm('¿Borrar esta plantilla de este navegador?')) { C.guardarLocal(CLAVE_PROPIAS, propias().filter(p => p.id !== b.dataset.borrar)); vistaPropias(); }
    });
  }

  // ======================================================================= rutas
  function router() {
    clearTimeout(temporizador); S.version++;
    const h = location.hash.replace(/^#\/?/, '');
    const [a, b] = h.split('/');
    $$('.secciones-nav a').forEach(x => x.classList.toggle('activa', x.dataset.sec === a));
    window.onresize = null;
    if (!a) vistaInicio();
    else if (SECCIONES[a] && b) {
      if (/^hoja_anual_servicios_(corta|larga)$/.test(b)) { location.replace('#/s1/hoja_anual_servicios'); return; }
      const d = docPorId(b); d ? vistaEditor(d) : vistaSeccion(a);
    }
    else if (SECCIONES[a]) vistaSeccion(a);
    else if (a === 'ajustes') vistaAjustes();
    else if (a === 'datos') vistaDatos();
    else if (a === 'propias') vistaPropias();
    else vistaInicio();
    if (!b) window.scrollTo(0, 0);
    document.title = (b && docPorId(b) ? docPorId(b).titulo + ' · ' : '') + 'IIBPAC';
  }
  window.addEventListener('hashchange', router);
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const t = $('#busca:not([disabled])') || $('#filtro-docs'); if (t) { e.preventDefault(); t.focus(); }
  });
  actualizarMarca(); pintarPildora(); router();
  // para las pruebas automáticas
  window.__mesa = { S, datosFicticios, construirDatos, docPorId };
})();

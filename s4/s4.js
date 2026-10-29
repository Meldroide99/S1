/* S4 · Logística — herramientas de combustible.
 *   · Solicitud de repostaje: la rellena cada compañía y sale en Excel con el formato original.
 *   · Refundir solicitudes: junta varias solicitudes en un solo Excel.
 *   · Base de vehículos: el Excel de vehículos y matrículas, leído en memoria como el de personal.
 * Nada sale del equipo. Lo único que se guarda en el navegador son ajustes sin datos
 * (litros por tipo, compañías añadidas a mano y el tipo asignado a cada modelo).
 */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const leer = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };
  const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const fmt = n => (Math.round(n * 100) / 100).toLocaleString('es-ES');

  const K_LITROS = 'iibpac.s4.litros', K_CIAS = 'iibpac.s4.cias', K_TIPOMOD = 'iibpac.s4.tipoModelo', K_ULTIMA = 'iibpac.s4.ultimaCia';
  const PETACA = 20;
  const LITROS_DEF = { VAMTAC: 90, LIGERO: 70, CAMION: 100 };
  const VEHICULOS = [{ k: 'VAMTAC', et: 'VAMTAC' }, { k: 'LIGERO', et: 'LIGERO' }, { k: 'CAMION', et: 'CAMIÓN' }];
  const PETACAS = [{ k: 'PET_D', et: 'PETACAS DIÉSEL', comb: 'D' }, { k: 'PET_G', et: 'PETACAS GASOLINA', comb: 'G' }];
  const litros = () => Object.assign({}, LITROS_DEF, leer(K_LITROS, {}));
  const etTipo = k => (VEHICULOS.find(t => t.k === k) || PETACAS.find(t => t.k === k) || { et: k }).et;
  const esPetaca = k => k === 'PET_D' || k === 'PET_G';
  const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  let H = null; // ayudas de la página (pintar, toast, descargar…)

  // ======================================================================= compañías
  /** «10», «10ª», «10ª Cía.», «10 CIA» → «10». «PLMM» → «PLMM». */
  function claveCia(c) {
    const t = norm(c).replace(/[ªº°.]/g, ' ').replace(/\b(CIA|COMPANIA|CÍA)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const m = t.match(/^(\d{1,2})\s*A?$/); return m ? m[1] : t;
  }
  const etCia = c => { const k = claveCia(c); return /^\d+$/.test(k) ? `${k}ª CÍA` : k; };
  const fichCia = c => { const k = claveCia(c); return (/^\d+$/.test(k) ? `${k}CIA` : k).replace(/[^A-Z0-9]+/g, ''); };
  function companias() {
    const set = new Map();
    const meter = c => { const k = claveCia(c); if (k && k.length <= 20 && !set.has(k)) set.set(k, etCia(c)); };
    B.vehiculos.forEach(v => meter(v.cia));
    ((H && H.ciasPersonal && H.ciasPersonal()) || []).forEach(meter);
    leer(K_CIAS, []).forEach(meter);
    return [...set.entries()].sort((a, b) => {
      const na = /^\d+$/.test(a[0]), nb = /^\d+$/.test(b[0]);
      return na && nb ? a[0] - b[0] : na ? -1 : nb ? 1 : a[0].localeCompare(b[0]);
    }).map(([k, et]) => ({ k, et }));
  }

  // ======================================================================= base de vehículos
  const B = { archivo: '', vehiculos: [], hojas: [] };
  function clasificar(texto) {
    const t = norm(texto);
    if (/VAMTAC/.test(t)) return 'VAMTAC';
    if (/(^|\W)(RQ|GE)(\W|$)|REMOLQUE|COCINA|GRUPO ELEC|MOTO|MULA/.test(t)) return 'NO';
    if (/CAMION|TRAKKER|PEGASO|(^|\W)URO(\W|$)|IVECO M\d|(^|\W)M ?250/.test(t)) return 'CAMION';
    if (/ANIBAL|NISSAN|TOYOTA|LAND ?ROVER|PATROL|LIGERO|SANTANA|WAGEN|MERCEDES G|LINCE|(^|\W)LMV(\W|$)/.test(t)) return 'LIGERO';
    return '';
  }
  function tipoDe(v) {
    const man = leer(K_TIPOMOD, {});
    return man[norm(v.modelo)] || clasificar(`${v.grupo} ${v.modelo}`);
  }
  const colDe = (t, prueba) => t.columnas.find(c => prueba(norm(c)));
  async function cargarBase(file) {
    const hojas = await Excel.leerArchivo(file);
    const tablas = hojas.map(Excel.tabular);
    const grupos = {};
    for (const t of tablas) {
      const ci = colDe(t, c => c === 'ID'), cm = colDe(t, c => c === 'MODELO');
      if (ci && cm && !colDe(t, c => c.includes('MATRICULA'))) t.registros.forEach(r => { if (r[ci]) grupos[r[ci]] = r[cm]; });
    }
    const vistos = new Set(), lista = [], usadas = [];
    for (const t of tablas) {
      const cMat = colDe(t, c => c.includes('MATRICULA')); if (!cMat) continue;
      const cMod = colDe(t, c => c === 'MODELO') || colDe(t, c => c.includes('MODELO'));
      const cCia = colDe(t, c => c === 'CIA' || c === 'COMPANIA' || c === 'UNIDAD');
      const cId = colDe(t, c => /^(COLUMNA ?1|ID|TIPO)$/.test(c));
      const cOp = colDe(t, c => c === 'OP REAL') || colDe(t, c => c === 'OP');
      let n = 0;
      for (const r of t.registros) {
        const mat = String(r[cMat] || '').trim(); if (!mat || vistos.has(norm(mat))) continue;
        vistos.add(norm(mat)); n++;
        lista.push({ matricula: mat, modelo: (cMod && r[cMod]) || '', cia: (cCia && r[cCia]) || '', grupo: (cId && grupos[r[cId]]) || '', op: (cOp && r[cOp]) || '', hoja: t.hoja });
      }
      if (n) usadas.push(`${t.hoja} (${n})`);
    }
    if (!lista.length) throw new Error('No encuentro vehículos: hace falta una columna «MATRÍCULA» con datos.');
    Object.assign(B, { archivo: file.name, vehiculos: lista, hojas: usadas });
    return lista.length;
  }
  function olvidarBase() { Object.assign(B, { archivo: '', vehiculos: [], hojas: [] }); }
  const deCia = (cia) => B.vehiculos.filter(v => claveCia(v.cia) === claveCia(cia));
  const opTxt = op => ({ 10: 'Operativo', 20: 'Op. condicional', 30: 'Inoperativo', 33: 'Pendiente baja' }[String(op).trim()] || '');

  // ======================================================================= Excel: escribir en la plantilla
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const serial = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
  function celda(ref, s, v) {
    const st = s != null ? ` s="${s}"` : '';
    if (v === '' || v == null) return `<c r="${ref}"${st}/>`;
    if (v instanceof Date) return `<c r="${ref}"${st}><v>${serial(v)}</v></c>`;
    if (typeof v === 'number') return `<c r="${ref}"${st}><v>${v}</v></c>`;
    return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  }
  function poner(xml, ref, v) {
    const re = new RegExp(`<c r="${ref}"([^>]*?)(\\/>|>[\\s\\S]*?<\\/c>)`);
    const m = xml.match(re);
    if (!m) throw new Error('La plantilla no tiene la celda ' + ref);
    const s = (m[1].match(/\bs="(\d+)"/) || [])[1];
    return xml.replace(re, celda(ref, s, v));
  }
  const letra = i => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

  /** Añade estilos propios (fecha con borde) y devuelve sus índices. */
  function estilosExtra(sty) {
    const m = sty.match(/<cellXfs count="(\d+)">/); const n = +m[1];
    const nuevos = '<xf numFmtId="14" fontId="1" fillId="0" borderId="4" xfId="1" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="4" xfId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>';
    sty = sty.replace(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/, (_, x) => `<cellXfs count="${n + 2}">${x}${nuevos}</cellXfs>`);
    return { sty, fecha: n, izq: n + 1 };
  }
  /** Hoja sencilla con cabecera naranja (estilo 2 de la plantilla) y celdas con borde. */
  function hojaTabla(cab, filas, anchos, est) {
    const tipoCol = cab.map(c => c.tipo || 'txt');
    const fila = (r, valores, cabecera) => `<row r="${r}"${cabecera ? ' ht="32" customHeight="1"' : ''}>${valores.map((v, i) => {
      if (cabecera) return celda(letra(i) + r, 2, v);
      const t = tipoCol[i]; const s = t === 'fecha' ? est.fecha : t === 'izq' ? est.izq : 8;
      return celda(letra(i) + r, s, v);
    }).join('')}</row>`;
    const cols = anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><tabColor rgb="FFFFC000"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="13"/><cols>${cols}</cols><sheetData>${fila(1, cab.map(c => c.et), true)}${filas.map((f, i) => fila(i + 2, f)).join('')}</sheetData><pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/></worksheet>`;
  }
  function anadirHoja(zip, libro, rels, tipos, app, nombre, xml) {
    const n = (libro.match(/<sheet /g) || []).length + 1;
    const id = 'rIdS4' + n;
    zip.file(`xl/worksheets/sheet${n}.xml`, xml);
    libro = libro.replace('</sheets>', `<sheet name="${xmlEsc(nombre)}" sheetId="${n}" r:id="${id}"/></sheets>`);
    rels = rels.replace('</Relationships>', `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/></Relationships>`);
    tipos = tipos.replace('</Types>', `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
    app = app.replace(/<vt:i4>(\d+)<\/vt:i4>/, (_, x) => `<vt:i4>${+x + 1}</vt:i4>`)
      .replace(/<TitlesOfParts><vt:vector size="(\d+)" baseType="lpstr">([\s\S]*?)<\/vt:vector>/, (_, x, y) => `<TitlesOfParts><vt:vector size="${+x + 1}" baseType="lpstr">${y}<vt:lpstr>${xmlEsc(nombre)}</vt:lpstr></vt:vector>`);
    return { libro, rels, tipos, app };
  }

  /**
   * datos: { tipos: [{et, n, dL, gL}] (máx. 9), petD, petG, fecha, fechaAlt (Date|texto|''), motivo,
   *          cia (texto o ''), matriculas: [[cia, tipo, modelo, matricula, op]], desglose: [[...]] }
   */
  async function construirExcel(datos) {
    const zip = await JSZip.loadAsync(b64(window.S4_PLANTILLA_REPOSTAJE));
    let hoja = await zip.file('xl/worksheets/sheet1.xml').async('string');
    for (let i = 0; i < 9; i++) {
      const r = i + 2, t = datos.tipos[i];
      hoja = poner(hoja, 'A' + r, t ? t.et : '');
      hoja = poner(hoja, 'B' + r, t ? t.n : '');
      hoja = poner(hoja, 'C' + r, t ? t.dL : '');
      hoja = poner(hoja, 'D' + r, t && t.gL ? t.gL : '');
    }
    hoja = poner(hoja, 'E2', datos.petD || 0);
    hoja = poner(hoja, 'F2', datos.petG || 0);
    hoja = poner(hoja, 'G2', datos.fecha || '');
    hoja = poner(hoja, 'H2', datos.fechaAlt || '');
    hoja = poner(hoja, 'I2', datos.motivo || '');
    hoja = hoja.replace(/(<\/f>)<v>[^<]*<\/v>/g, '$1').replace(/<selection [^>]*\/>/, '<selection activeCell="A1" sqref="A1"/>');
    zip.file('xl/worksheets/sheet1.xml', hoja);
    zip.remove('xl/calcChain.xml');
    let libro = (await zip.file('xl/workbook.xml').async('string')).replace(/<calcPr([^>]*?)\/>/, (_, a) => `<calcPr${a.replace(/\s*fullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`);
    let rels = (await zip.file('xl/_rels/workbook.xml.rels').async('string')).replace(/<Relationship [^>]*calcChain[^>]*\/>/, '');
    let tipos = (await zip.file('[Content_Types].xml').async('string')).replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, '');
    let app = await zip.file('docProps/app.xml').async('string');
    const e = estilosExtra(await zip.file('xl/styles.xml').async('string'));
    zip.file('xl/styles.xml', e.sty);
    let p = { libro, rels, tipos, app };
    if (datos.desglose && datos.desglose.length) {
      const cab = [{ et: 'COMPAÑÍA' }, { et: 'TIPO VEHÍCULO' }, { et: 'N.º VEHÍCULOS' }, { et: 'LITROS DIÉSEL' }, { et: 'LITROS GASOLINA' }, { et: 'N.º PETACAS DIÉSEL' }, { et: 'N.º PETACAS GASOLINA' },
        { et: 'TOTAL LITROS' }, { et: 'FECHA PRINCIPAL', tipo: 'fecha' }, { et: 'FECHA ALTERNATIVA', tipo: 'fecha' }, { et: 'MOTIVO', tipo: 'izq' }, { et: 'ARCHIVO', tipo: 'izq' }];
      p = anadirHoja(zip, p.libro, p.rels, p.tipos, p.app, 'DESGLOSE POR COMPAÑÍA', hojaTabla(cab, datos.desglose, [14, 18, 12, 12, 12, 12, 12, 12, 13, 13, 30, 40], e));
    }
    if (datos.matriculas && datos.matriculas.length) {
      const cab = [{ et: 'COMPAÑÍA' }, { et: 'TIPO' }, { et: 'MODELO', tipo: 'izq' }, { et: 'MATRÍCULA' }, { et: 'OPERATIVIDAD' }];
      p = anadirHoja(zip, p.libro, p.rels, p.tipos, p.app, 'MATRÍCULAS', hojaTabla(cab, datos.matriculas, [14, 14, 30, 16, 18], e));
    }
    zip.file('xl/workbook.xml', p.libro); zip.file('xl/_rels/workbook.xml.rels', p.rels); zip.file('[Content_Types].xml', p.tipos); zip.file('docProps/app.xml', p.app);
    let core = await zip.file('docProps/core.xml').async('string');
    const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    core = core.replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, '<dc:creator>IIBPAC</dc:creator>').replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>IIBPAC</cp:lastModifiedBy>')
      .replace(/(<dcterms:modified[^>]*>)[^<]*/, `$1${ahora}`).replace(/(<dcterms:created[^>]*>)[^<]*/, `$1${ahora}`);
    const asunto = `IIBPAC REPOSTAJE CIA=${datos.cia ? claveCia(datos.cia) : 'REFUNDIDO'}`;
    core = /<dc:subject>/.test(core) ? core.replace(/<dc:subject>[\s\S]*?<\/dc:subject>/, `<dc:subject>${xmlEsc(asunto)}</dc:subject>`) : core.replace('</cp:coreProperties>', `<dc:subject>${xmlEsc(asunto)}</dc:subject></cp:coreProperties>`);
    zip.file('docProps/core.xml', core);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  }
  const hoyTxt = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  const diaMes = d => d instanceof Date ? `${String(d.getDate()).padStart(2, '0')}${MESES[d.getMonth()]}` : '';
  const aFecha = v => { if (v instanceof Date) return v; const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/) || null; if (m) return new Date(+m[1], +m[2] - 1, +m[3]); const n = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return n ? new Date(+n[3], +n[2] - 1, +n[1]) : null; };
  const isoDe = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
  const txtFecha = d => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';

  // ======================================================================= solicitud (formulario)
  const F = { cia: leer(K_ULTIMA, ''), filas: [{ tipo: 'VAMTAC', n: 0, mats: [] }], fecha: '', fechaAlt: '', motivo: '' };
  function calcular() {
    const L = litros(); const porTipo = {}; let petD = 0, petG = 0;
    for (const f of F.filas) {
      const n = f.mats.length ? f.mats.length : Math.max(0, Math.round(num(f.n)));
      if (f.tipo === 'PET_D') petD += n; else if (f.tipo === 'PET_G') petG += n;
      else (porTipo[f.tipo] = porTipo[f.tipo] || { n: 0 }).n += n;
    }
    const tipos = VEHICULOS.map(t => ({ k: t.k, et: t.k === 'CAMION' ? 'CAMION' : t.et, n: (porTipo[t.k] || { n: 0 }).n, dL: (porTipo[t.k] || { n: 0 }).n * L[t.k], gL: 0 }));
    const dVeh = tipos.reduce((s, t) => s + t.dL, 0);
    return { tipos, petD, petG, dVeh, totD: dVeh + petD * PETACA, totG: petG * PETACA };
  }
  const litrosFila = f => { const n = f.mats.length || Math.max(0, Math.round(num(f.n))); return esPetaca(f.tipo) ? n * PETACA : n * (litros()[f.tipo] || 0); };

  function htmlBase() {
    const n = B.vehiculos.length;
    if (!n) return `<div class="s4-base"><div><strong>Base de vehículos</strong><span>Opcional. Carga el Excel de vehículos y matrículas para elegir los vehículos por matrícula.</span></div>
      <button class="btn suave peq" type="button" data-s4="cargar-base">Cargar Excel de vehículos</button></div>`;
    const sin = B.vehiculos.filter(v => !tipoDe(v)).length;
    return `<div class="s4-base cargada"><div><strong>${n} vehículos</strong><span>${esc(B.archivo)} · ${esc(B.hojas.join(', '))}. Solo en este ordenador.</span></div>
      <div class="s4-base-acc">${sin ? `<button class="btn suave peq" type="button" data-s4="clasificar">Revisar tipos (${sin} sin tipo)</button>` : `<button class="btn suave peq" type="button" data-s4="clasificar">Revisar tipos</button>`}
      <button class="btn suave peq" type="button" data-s4="cargar-base">Cambiar</button><button class="btn suave peq" type="button" data-s4="olvidar-base">Borrar de la memoria</button></div></div>`;
  }
  function htmlFilas() {
    const L = litros();
    return F.filas.map((f, i) => {
      const pet = esPetaca(f.tipo); const conMats = f.mats.length > 0;
      const opciones = [...VEHICULOS, ...PETACAS].map(t => `<option value="${t.k}"${t.k === f.tipo ? ' selected' : ''}>${t.et}</option>`).join('');
      return `<div class="s4-fila" data-i="${i}">
        <label class="s4-c tipo"><span>Tipo</span><select data-campo="tipo">${opciones}</select></label>
        <label class="s4-c cant"><span>${pet ? 'N.º de petacas' : 'N.º de vehículos'}</span><input type="number" min="0" step="1" inputmode="numeric" data-campo="n" value="${conMats ? f.mats.length : (f.n || '')}" placeholder="0"${conMats ? ' readonly title="Se cuenta con las matrículas elegidas"' : ''}></label>
        <div class="s4-c litros"><span>Litros</span><output>${fmt(litrosFila(f))} L</output><small>${pet ? `${PETACA} L por petaca` : `${L[f.tipo]} L por vehículo`}</small></div>
        <div class="s4-c mats">${pet ? '' : (B.vehiculos.length ? `<button class="btn suave peq" type="button" data-s4="matriculas">${conMats ? `${f.mats.length} matrícula${f.mats.length > 1 ? 's' : ''} · cambiar` : 'Elegir matrículas'}</button>` : '')}
          ${conMats ? `<button class="enlace" type="button" data-s4="sin-mats">Quitar matrículas</button>` : ''}</div>
        <button class="s4-quitar" type="button" data-s4="quitar" aria-label="Quitar fila" title="Quitar fila"${F.filas.length === 1 ? ' disabled' : ''}>×</button>
        ${conMats ? `<div class="s4-mats-lista">${f.mats.map(m => `<span class="chip">${esc(m)}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }
  function htmlTotales() {
    const c = calcular();
    return `<div class="s4-tot"><div><span>Diésel</span><strong>${fmt(c.totD)} L</strong><small>${fmt(c.dVeh)} L vehículos${c.petD ? ` + ${c.petD} petacas` : ''}</small></div>
      <div><span>Gasolina</span><strong>${fmt(c.totG)} L</strong><small>${c.petG ? `${c.petG} petacas` : 'Sin petacas'}</small></div>
      <div class="todo"><span>Total</span><strong>${fmt(c.totD + c.totG)} L</strong></div></div>`;
  }
  function vistaSolicitud() {
    const cias = companias();
    if (F.cia && !cias.some(c => c.k === claveCia(F.cia))) cias.push({ k: claveCia(F.cia), et: etCia(F.cia) });
    const raiz = H.pintar(`${H.banda('<a href="#/">Inicio</a> / <a href="#/s4">S4</a> / <span>Repostaje</span>', 'Solicitud de <i>repostaje</i>', 'Elige la compañía, los vehículos y las fechas. Los litros se calculan solos y sale el Excel con el formato de siempre.', 'foto-sierra')}
    <section class="pagina"><div class="contenedor s4">
      <div id="s4-base">${htmlBase()}</div>
      <form class="s4-form" id="s4-form" autocomplete="off" novalidate>
        <div class="s4-paso"><span class="s4-num">1</span><div class="s4-paso-cuerpo">
          <h2>¿Qué compañía lo pide?</h2>
          <div class="s4-cia"><select id="s4-cia" required><option value="">Elige la compañía…</option>${cias.map(c => `<option value="${esc(c.k)}"${c.k === claveCia(F.cia) && F.cia ? ' selected' : ''}>${esc(c.et)}</option>`).join('')}<option value="__otra">Otra…</option></select>
            <input id="s4-cia-otra" type="text" placeholder="Escribe la compañía (p. ej. 10, PLMM)" hidden maxlength="20"></div>
          ${cias.length ? '' : '<p class="s4-ayuda">No hay compañías todavía: carga el Excel de vehículos o el de personal, o elige «Otra…».</p>'}
        </div></div>
        <fieldset class="s4-bloque" id="s4-resto"${F.cia ? '' : ' disabled'}>
          <div class="s4-paso"><span class="s4-num">2</span><div class="s4-paso-cuerpo">
            <h2>Vehículos y petacas</h2>
            <div id="s4-filas">${htmlFilas()}</div>
            <button class="btn suave peq" type="button" data-s4="anadir">+ Añadir fila</button>
            <details class="s4-reglas"><summary>Litros por tipo</summary>
              <div class="s4-reglas-campos">${VEHICULOS.map(t => `<label>${t.et}<input type="number" min="0" step="1" data-litros="${t.k}" value="${litros()[t.k]}"> L</label>`).join('')}<span>Petaca: ${PETACA} L</span></div>
              <button class="enlace" type="button" data-s4="litros-def">Volver a 90 / 70 / 100</button></details>
          </div></div>
          <div class="s4-paso"><span class="s4-num">3</span><div class="s4-paso-cuerpo">
            <h2>Fechas y motivo</h2>
            <div class="s4-fechas">
              <label class="campo medio"><span class="etq">Fecha principal de repostaje <b class="obl">*</b></span><input type="date" id="s4-fecha" value="${esc(F.fecha)}"></label>
              <label class="campo medio"><span class="etq">Fecha alternativa</span><input type="date" id="s4-fecha-alt" value="${esc(F.fechaAlt)}"></label>
              <label class="campo"><span class="etq">Motivo del ejercicio <b class="obl">*</b></span><input type="text" id="s4-motivo" maxlength="160" placeholder="Ej.: BETA INTERVAL" value="${esc(F.motivo)}"></label>
            </div>
          </div></div>
          <div id="s4-totales">${htmlTotales()}</div>
          <div class="s4-pie"><span class="s4-nombre" id="s4-nombre"></span><button class="btn oro" type="submit">Descargar Excel</button></div>
        </fieldset>
      </form>
      <p class="s4-vuelta">¿Eres quien junta las de todas las compañías? <a href="#/s4/refundir-repostaje">Refundir solicitudes →</a></p>
    </div></section>`);
    H.animarEntrada && H.animarEntrada(raiz);
    enlazarSolicitud(raiz);
    pintarNombre();
  }
  function nombreSolicitud() {
    const d = aFecha(F.fecha);
    return `${hoyTxt()}_SOLICITUD_REPOSTAJE_${d ? diaMes(d) + '_' : ''}${F.cia ? fichCia(F.cia) : 'CIA'}_BPAC_II.xlsx`;
  }
  function pintarNombre() { const n = $('#s4-nombre'); if (n) n.textContent = F.cia ? nombreSolicitud() : ''; }
  function repintarFilas() { $('#s4-filas').innerHTML = htmlFilas(); $('#s4-totales').innerHTML = htmlTotales(); }
  function enlazarSolicitud(raiz) {
    const selCia = $('#s4-cia'), otra = $('#s4-cia-otra');
    const ponerCia = v => {
      F.cia = v; guardar(K_ULTIMA, v);
      $('#s4-resto').disabled = !v; pintarNombre();
      F.filas.forEach(f => { f.mats = f.mats.filter(m => !B.vehiculos.length || deCia(v).some(x => x.matricula === m)); });
      repintarFilas();
    };
    selCia.addEventListener('change', () => {
      if (selCia.value === '__otra') { otra.hidden = false; otra.focus(); ponerCia(otra.value.trim()); }
      else { otra.hidden = true; ponerCia(selCia.value); }
    });
    otra.addEventListener('input', () => ponerCia(otra.value.trim()));
    otra.addEventListener('change', () => { const v = otra.value.trim(); if (!v) return; const l = leer(K_CIAS, []); if (!l.some(x => claveCia(x) === claveCia(v))) guardar(K_CIAS, [...l, v]); });
    raiz.addEventListener('input', e => {
      const fila = e.target.closest('.s4-fila');
      if (fila && e.target.dataset.campo === 'n') { F.filas[+fila.dataset.i].n = e.target.value; fila.querySelector('output').textContent = fmt(litrosFila(F.filas[+fila.dataset.i])) + ' L'; $('#s4-totales').innerHTML = htmlTotales(); }
      if (e.target.dataset.litros) { const l = leer(K_LITROS, {}); l[e.target.dataset.litros] = Math.max(0, num(e.target.value)); guardar(K_LITROS, l); repintarFilas(); }
      if (e.target.id === 's4-fecha') { F.fecha = e.target.value; pintarNombre(); }
      if (e.target.id === 's4-fecha-alt') F.fechaAlt = e.target.value;
      if (e.target.id === 's4-motivo') F.motivo = e.target.value;
    });
    raiz.addEventListener('change', e => {
      const fila = e.target.closest('.s4-fila');
      if (fila && e.target.dataset.campo === 'tipo') { const f = F.filas[+fila.dataset.i]; f.tipo = e.target.value; f.mats = []; repintarFilas(); }
    });
    raiz.addEventListener('click', e => {
      const b = e.target.closest('[data-s4]'); if (!b) return;
      const fila = b.closest('.s4-fila'); const i = fila ? +fila.dataset.i : -1;
      const acc = b.dataset.s4;
      if (acc === 'anadir') { const usados = new Set(F.filas.map(f => f.tipo)); const sig = [...VEHICULOS, ...PETACAS].find(t => !usados.has(t.k)); F.filas.push({ tipo: sig ? sig.k : 'VAMTAC', n: 0, mats: [] }); repintarFilas(); const ult = $$('#s4-filas [data-campo="n"]').pop(); if (ult) ult.focus(); }
      else if (acc === 'quitar' && F.filas.length > 1) { F.filas.splice(i, 1); repintarFilas(); }
      else if (acc === 'sin-mats') { F.filas[i].n = F.filas[i].mats.length; F.filas[i].mats = []; repintarFilas(); }
      else if (acc === 'matriculas') elegirMatriculas(i);
      else if (acc === 'litros-def') { guardar(K_LITROS, {}); $$('[data-litros]').forEach(x => { x.value = LITROS_DEF[x.dataset.litros]; }); repintarFilas(); }
      else if (acc === 'cargar-base') pedirBase();
      else if (acc === 'olvidar-base') { olvidarBase(); H.toast('Base de vehículos borrada de la memoria.'); $('#s4-base').innerHTML = htmlBase(); F.filas.forEach(f => { if (f.mats.length) { f.n = f.mats.length; f.mats = []; } }); repintarFilas(); }
      else if (acc === 'clasificar') revisarTipos();
    });
    $('#s4-form').addEventListener('submit', async e => {
      e.preventDefault();
      const c = calcular();
      if (!F.cia) { H.toast('Elige primero la compañía.', 'error'); selCia.focus(); return; }
      if (!c.tipos.some(t => t.n) && !c.petD && !c.petG) { H.toast('Pon al menos un vehículo o una petaca.', 'error'); return; }
      if (!F.fecha) { H.toast('Falta la fecha principal de repostaje.', 'error'); $('#s4-fecha').focus(); return; }
      if (!F.motivo.trim()) { H.toast('Falta el motivo del ejercicio.', 'error'); $('#s4-motivo').focus(); return; }
      const btn = e.submitter || $('#s4-form .btn.oro'); btn.disabled = true;
      try {
        const mats = [];
        for (const f of F.filas) for (const m of f.mats) {
          const v = B.vehiculos.find(x => x.matricula === m) || {};
          if (!mats.some(x => x[3] === m)) mats.push([etCia(F.cia), etTipo(f.tipo), v.modelo || '', m, opTxt(v.op) || String(v.op || '')]);
        }
        const blob = await construirExcel({ tipos: c.tipos, petD: c.petD, petG: c.petG, fecha: aFecha(F.fecha), fechaAlt: aFecha(F.fechaAlt) || '', motivo: F.motivo.trim().toUpperCase(), cia: F.cia, matriculas: mats });
        H.descargar(blob, nombreSolicitud());
        H.toast('Excel descargado. Envíaselo al S4.');
      } catch (err) { console.error(err); H.toast('No se pudo crear el Excel: ' + err.message, 'error'); }
      btn.disabled = false;
    });
  }

  // ======================================================================= ventanas
  function modal(html, clase) {
    $$('.s4-modal').forEach(m => m.remove());
    const m = document.createElement('div'); m.className = 's4-modal';
    m.innerHTML = `<div class="s4-modal-caja ${clase || ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(m);
    const cerrar = () => { m.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = e => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', tecla);
    m.addEventListener('mousedown', e => { if (e.target === m) cerrar(); });
    m.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) cerrar(); });
    return { m, cerrar };
  }
  function filaVeh(v, marcada) {
    const op = String(v.op || '').trim();
    return `<label class="s4-veh${op === '30' || op === '33' ? ' inop' : ''}"><input type="checkbox" value="${esc(v.matricula)}"${marcada ? ' checked' : ''}>
      <span class="s4-veh-mat">${esc(v.matricula)}</span><span class="s4-veh-mod">${esc(v.modelo || v.grupo || '—')}</span>
      ${opTxt(op) ? `<span class="chip${op === '10' ? ' ok' : ''}">${esc(opTxt(op))}</span>` : ''}${claveCia(v.cia) !== claveCia(F.cia) ? `<span class="chip">${esc(etCia(v.cia) || 'Sin compañía')}</span>` : ''}</label>`;
  }
  function elegirMatriculas(i) {
    const f = F.filas[i]; const tipo = f.tipo;
    const otrasFilas = new Set(F.filas.flatMap((x, j) => j === i ? [] : x.mats));
    let todas = false;
    const { m, cerrar } = modal(`<form class="s4-sel">
      <div class="s4-modal-cab"><h3>${esc(etTipo(tipo))} · ${esc(etCia(F.cia))}</h3><button type="button" class="s4-x" data-cerrar aria-label="Cerrar">×</button></div>
      <div class="s4-sel-barra"><input type="search" id="s4-busca-veh" placeholder="Buscar matrícula o modelo…"><label class="s4-check"><input type="checkbox" id="s4-todas"> Ver otras compañías</label></div>
      <div class="s4-sel-lista" id="s4-sel-lista"></div>
      <div class="s4-modal-pie"><span id="s4-sel-cuenta"></span><button class="btn suave peq" type="button" data-cerrar>Cancelar</button><button class="btn oro peq" type="submit">Usar estos vehículos</button></div></form>`, 's4-modal-sel');
    const marcadas = new Set(f.mats);
    const pintarLista = () => {
      const q = norm($('#s4-busca-veh').value);
      const fuente = (todas ? B.vehiculos : deCia(F.cia)).filter(v => !otrasFilas.has(v.matricula) && (!q || norm(`${v.matricula} ${v.modelo} ${v.grupo}`).includes(q)));
      const delTipo = fuente.filter(v => tipoDe(v) === tipo);
      const sinTipo = fuente.filter(v => !tipoDe(v));
      $('#s4-sel-lista').innerHTML = (delTipo.length ? delTipo.map(v => filaVeh(v, marcadas.has(v.matricula))).join('') : `<p class="s4-vacio">No hay vehículos de tipo ${esc(etTipo(tipo))}${todas ? '' : ' en esta compañía'}${q ? ' con esa búsqueda' : ''}.</p>`)
        + (sinTipo.length ? `<details class="s4-sin-tipo"${sinTipo.some(v => marcadas.has(v.matricula)) ? ' open' : ''}><summary>Vehículos sin tipo (${sinTipo.length})</summary><p class="s4-ayuda">Si marcas uno, su modelo quedará como ${esc(etTipo(tipo))} para la próxima vez.</p>${sinTipo.map(v => filaVeh(v, marcadas.has(v.matricula))).join('')}</details>` : '');
      $('#s4-sel-cuenta').textContent = `${marcadas.size} elegido${marcadas.size === 1 ? '' : 's'} · ${fmt(marcadas.size * (litros()[tipo] || 0))} L`;
    };
    pintarLista();
    $('#s4-busca-veh').addEventListener('input', pintarLista);
    $('#s4-todas').addEventListener('change', e => { todas = e.target.checked; pintarLista(); });
    m.addEventListener('change', e => { if (e.target.type === 'checkbox' && e.target.value && e.target.id !== 's4-todas') { e.target.checked ? marcadas.add(e.target.value) : marcadas.delete(e.target.value); $('#s4-sel-cuenta').textContent = `${marcadas.size} elegido${marcadas.size === 1 ? '' : 's'} · ${fmt(marcadas.size * (litros()[tipo] || 0))} L`; } });
    $('form', m).addEventListener('submit', e => {
      e.preventDefault();
      const man = leer(K_TIPOMOD, {}); let aprendidos = 0;
      for (const mat of marcadas) { const v = B.vehiculos.find(x => x.matricula === mat); if (v && !tipoDe(v) && v.modelo) { man[norm(v.modelo)] = tipo; aprendidos++; } }
      if (aprendidos) guardar(K_TIPOMOD, man);
      f.mats = [...marcadas]; f.n = f.mats.length; cerrar(); repintarFilas();
      if (aprendidos) $('#s4-base').innerHTML = htmlBase();
    });
    setTimeout(() => $('#s4-busca-veh').focus(), 30);
  }
  function revisarTipos() {
    const modelos = new Map();
    for (const v of B.vehiculos) { const k = norm(v.modelo || v.grupo); if (!k) continue; const x = modelos.get(k) || { modelo: v.modelo || v.grupo, grupo: v.grupo, n: 0, v }; x.n++; modelos.set(k, x); }
    const lista = [...modelos.values()].sort((a, b) => (tipoDe(a.v) ? 1 : 0) - (tipoDe(b.v) ? 1 : 0) || a.modelo.localeCompare(b.modelo));
    const ops = cur => [['', 'Sin tipo'], ...VEHICULOS.map(t => [t.k, t.et]), ['NO', 'No reposta (remolque, grupo…)']].map(([k, et]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${et}</option>`).join('');
    const { m, cerrar } = modal(`<form class="s4-sel">
      <div class="s4-modal-cab"><h3>Tipo de cada modelo</h3><button type="button" class="s4-x" data-cerrar aria-label="Cerrar">×</button></div>
      <p class="s4-ayuda" style="padding:0 20px">Lo he deducido del nombre. Corrige lo que no cuadre; se recuerda en este ordenador.</p>
      <div class="s4-sel-lista">${lista.map(x => `<label class="s4-mod"><span><b>${esc(x.modelo)}</b>${x.grupo && norm(x.grupo) !== norm(x.modelo) ? `<small>${esc(x.grupo)}</small>` : ''}</span><em>${x.n}</em><select data-mod="${esc(norm(x.modelo))}">${ops(tipoDe(x.v))}</select></label>`).join('') || '<p class="s4-vacio">No hay modelos en la base.</p>'}</div>
      <div class="s4-modal-pie"><span></span><button class="btn suave peq" type="button" data-cerrar>Cancelar</button><button class="btn oro peq" type="submit">Guardar</button></div></form>`, 's4-modal-sel');
    $('form', m).addEventListener('submit', e => {
      e.preventDefault(); const man = leer(K_TIPOMOD, {});
      $$('[data-mod]', m).forEach(s => { const auto = clasificar(s.dataset.mod); if (s.value && s.value !== auto) man[s.dataset.mod] = s.value; else if (!s.value && auto) man[s.dataset.mod] = ''; else delete man[s.dataset.mod]; });
      guardar(K_TIPOMOD, man); cerrar(); $('#s4-base').innerHTML = htmlBase(); H.toast('Tipos guardados.');
    });
  }
  let entradaBase = null;
  function pedirBase() {
    if (!entradaBase) {
      entradaBase = document.createElement('input'); entradaBase.type = 'file'; entradaBase.accept = '.xlsx,.csv'; entradaBase.hidden = true; document.body.appendChild(entradaBase);
      entradaBase.addEventListener('change', () => { const f = entradaBase.files[0]; entradaBase.value = ''; if (f) usarBase(f); });
    }
    entradaBase.click();
  }
  async function usarBase(file) {
    try {
      const n = await cargarBase(file);
      H.toast(`${n} vehículos cargados de «${file.name}». Solo en este ordenador.`);
      if ($('#s4-base')) { $('#s4-base').innerHTML = htmlBase(); }
      if ($('#s4-cia')) vistaSolicitud();
    } catch (e) { console.error(e); H.toast(e.message || 'No se pudo leer el archivo.', 'error'); }
  }

  // ======================================================================= refundir
  const R = { archivos: [], fecha: '', fechaAlt: '', motivo: '', tocado: false };
  async function leerSolicitud(file) {
    const buf = await file.arrayBuffer();
    let asunto = '';
    try { const z = await JSZip.loadAsync(buf); const c = z.file('docProps/core.xml'); if (c) asunto = ((await c.async('string')).match(/<dc:subject>([^<]*)<\/dc:subject>/) || [])[1] || ''; } catch (e) { /* no es zip */ }
    const hojas = await Excel.leerArchivo({ name: file.name, arrayBuffer: async () => buf });
    let hoja = null, h = -1;
    for (const x of hojas) { const i = x.filas.findIndex(f => f && f.some(c => /TIPO VEH/.test(norm(c)))); if (i >= 0) { hoja = x; h = i; break; } }
    if (!hoja) throw new Error('no parece una solicitud de repostaje (no encuentro «TIPO VEHÍCULO»)');
    const cab = hoja.filas[h].map(norm);
    const ci = p => cab.findIndex(p);
    const c = {
      tipo: ci(x => x.includes('TIPO VEH')), n: ci(x => x.includes('VEHICULOS') && !x.includes('TIPO')),
      dL: ci(x => x.includes('DIESEL') && !x.includes('PETACA')), gL: ci(x => x.includes('GASOLINA') && !x.includes('PETACA')),
      pD: ci(x => x.includes('PETACA') && x.includes('DIESEL')), pG: ci(x => x.includes('PETACA') && x.includes('GASOLINA')),
      f1: ci(x => x.includes('FECHA') && x.includes('PRINCIPAL')), f2: ci(x => x.includes('FECHA') && x.includes('ALTERNATIVA')), mot: ci(x => x.includes('MOTIVO')),
    };
    const val = (f, i) => i >= 0 && f ? String(f[i] || '').trim() : '';
    const tipos = []; let pD = 0, pG = 0, f1 = '', f2 = '', mot = '';
    for (let r = h + 1; r < hoja.filas.length; r++) {
      const f = hoja.filas[r]; if (!f) continue;
      if (/^TOTAL/.test(norm(f[0] || f[c.tipo] || ''))) break;
      const t = val(f, c.tipo);
      if (t) tipos.push({ et: norm(t), n: num(val(f, c.n)), dL: num(val(f, c.dL)), gL: num(val(f, c.gL)) });
      pD = pD || num(val(f, c.pD)); pG = pG || num(val(f, c.pG));
      f1 = f1 || val(f, c.f1); f2 = f2 || val(f, c.f2); mot = mot || val(f, c.mot);
    }
    const mats = [];
    const hm = hojas.find(x => /MATRICULA/.test(norm(x.nombre)));
    if (hm) { const t = Excel.tabular(hm); const k = n => t.columnas.find(x => norm(x).includes(n)); for (const r of t.registros) mats.push([r[k('COMPA')] || '', r[k('TIPO')] || '', r[k('MODELO')] || '', r[k('MATRICULA')] || '', r[k('OPERATIV')] || '']); }
    let cia = (asunto.match(/CIA=([^\s]+)/) || [])[1] || '';
    if (cia === 'REFUNDIDO') cia = '';
    if (!cia) { const m = file.name.toUpperCase().match(/_(\d{1,2})\s*(?:A|ª)?\s*CIA(?:_|\.|\s)|_(PLMM|PLM|MANDO)(?:_|\.)/); if (m) cia = m[1] || m[2]; }
    return { archivo: file.name, cia: cia ? etCia(cia) : '', tipos, pD, pG, f1: aFecha(f1), f2: aFecha(f2), f1txt: f1, f2txt: f2, motivo: mot, mats };
  }
  function avisosDe(a) {
    const L = litros(); const av = [];
    for (const t of a.tipos) {
      const k = VEHICULOS.find(v => norm(v.et) === t.et || v.k === t.et);
      if (k && Math.abs(t.n * L[k.k] - t.dL) > 0.01 && (t.n || t.dL)) av.push(`${t.et}: ${fmt(t.n)} vehículos y ${fmt(t.dL)} L (serían ${fmt(t.n * L[k.k])} L)`);
    }
    if (!a.cia) av.push('Falta la compañía');
    if (!a.f1) av.push('Sin fecha principal');
    return av;
  }
  const claveTipo = et => { const v = VEHICULOS.find(x => norm(x.et) === norm(et) || x.k === norm(et)); return v ? v.k : norm(et); };
  function sumar() {
    const tipos = new Map(VEHICULOS.map(v => [v.k, { et: v.k === 'CAMION' ? 'CAMION' : v.et, n: 0, dL: 0, gL: 0 }]));
    let pD = 0, pG = 0;
    for (const a of R.archivos) {
      for (const t of a.tipos) { const k = claveTipo(t.et); const x = tipos.get(k) || { et: t.et, n: 0, dL: 0, gL: 0 }; x.n += t.n; x.dL += t.dL; x.gL += t.gL; tipos.set(k, x); }
      pD += a.pD; pG += a.pG;
    }
    const lista = [...tipos.values()];
    const dL = lista.reduce((s, t) => s + t.dL, 0), gL = lista.reduce((s, t) => s + t.gL, 0);
    return { tipos: lista, pD, pG, totD: dL + pD * PETACA, totG: gL + pG * PETACA };
  }
  function proponerComunes() {
    if (R.tocado) return;
    const masComun = arr => { const c = new Map(); arr.filter(Boolean).forEach(x => c.set(x, (c.get(x) || 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };
    R.fecha = masComun(R.archivos.map(a => isoDe(a.f1)));
    R.fechaAlt = masComun(R.archivos.map(a => isoDe(a.f2)));
    R.motivo = [...new Set(R.archivos.map(a => norm(a.motivo)).filter(Boolean))].join(' / ');
  }
  function htmlArchivos() {
    if (!R.archivos.length) return `<div class="s4-zona" data-s4="anadir-sol" tabindex="0" role="button"><strong>Arrastra aquí las solicitudes o pulsa para elegirlas</strong><span>Puedes elegir varios .xlsx a la vez. Valen las hechas aquí y las rellenadas a mano con el formato de siempre.</span></div>`;
    const cias = companias();
    const repes = new Set(R.archivos.map(a => claveCia(a.cia)).filter((k, i, arr) => k && arr.indexOf(k) !== i));
    return `<div class="s4-tabla-env"><table class="s4-tabla"><thead><tr><th>Compañía</th>${VEHICULOS.map(v => `<th>${v.et}</th>`).join('')}<th>Petacas D / G</th><th>Fechas</th><th>Motivo</th><th></th></tr></thead><tbody>
      ${R.archivos.map((a, i) => {
        const porK = {}; a.tipos.forEach(t => { porK[claveTipo(t.et)] = t; });
        const otros = a.tipos.filter(t => !VEHICULOS.some(v => v.k === claveTipo(t.et)));
        const av = avisosDe(a); if (repes.has(claveCia(a.cia))) av.push('Compañía repetida');
        return `<tr data-i="${i}"><td><input class="s4-cia-in" list="s4-cias" value="${esc(a.cia)}" placeholder="¿Compañía?" data-campo="cia"><small title="${esc(a.archivo)}">${esc(a.archivo)}</small></td>
          ${VEHICULOS.map(v => { const t = porK[v.k]; return `<td class="n">${t && (t.n || t.dL) ? `${fmt(t.n)}<small>${fmt(t.dL)} L</small>` : '—'}</td>`; }).join('')}
          <td class="n">${fmt(a.pD)} / ${fmt(a.pG)}</td>
          <td>${esc(txtFecha(a.f1) || a.f1txt || '—')}${a.f2 || a.f2txt ? `<small>Alt. ${esc(txtFecha(a.f2) || a.f2txt)}</small>` : ''}</td>
          <td class="mot">${esc(a.motivo || '—')}${otros.length ? `<small>También: ${otros.map(t => `${esc(t.et)} ${fmt(t.n)}`).join(', ')}</small>` : ''}${a.mats.length ? `<small>${a.mats.length} matrículas</small>` : ''}</td>
          <td><button class="s4-quitar" type="button" data-s4="quitar-sol" aria-label="Quitar" title="Quitar">×</button></td></tr>
          ${av.length ? `<tr class="s4-aviso"><td colspan="${VEHICULOS.length + 5}">⚠ ${av.map(esc).join(' · ')}</td></tr>` : ''}`;
      }).join('')}</tbody></table></div>
      <datalist id="s4-cias">${cias.map(c => `<option value="${esc(c.et)}">`).join('')}</datalist>
      <button class="btn suave peq" type="button" data-s4="anadir-sol">+ Añadir más solicitudes</button>`;
  }
  function htmlResumen() {
    if (!R.archivos.length) return '';
    const s = sumar();
    return `<div class="s4-paso"><span class="s4-num">2</span><div class="s4-paso-cuerpo"><h2>Total del batallón</h2>
      <div class="s4-tot">${s.tipos.filter(t => t.n || t.dL).map(t => `<div><span>${esc(t.et === 'CAMION' ? 'CAMIÓN' : t.et)}</span><strong>${fmt(t.n)}</strong><small>${fmt(t.dL)} L${t.gL ? ` · ${fmt(t.gL)} L gasolina` : ''}</small></div>`).join('')}
        <div><span>Petacas</span><strong>${fmt(s.pD + s.pG)}</strong><small>${fmt(s.pD)} diésel · ${fmt(s.pG)} gasolina</small></div>
        <div class="todo"><span>Total diésel</span><strong>${fmt(s.totD)} L</strong><small>Gasolina: ${fmt(s.totG)} L</small></div></div>
      <div class="s4-fechas" style="margin-top:16px">
        <label class="campo medio"><span class="etq">Fecha principal <b class="obl">*</b></span><input type="date" id="r4-fecha" value="${esc(R.fecha)}"></label>
        <label class="campo medio"><span class="etq">Fecha alternativa</span><input type="date" id="r4-fecha-alt" value="${esc(R.fechaAlt)}"></label>
        <label class="campo"><span class="etq">Motivo del ejercicio</span><input type="text" id="r4-motivo" maxlength="200" value="${esc(R.motivo)}"></label>
      </div><p class="s4-ayuda">Propuestas a partir de las solicitudes; si las compañías piden fechas distintas, cada una queda en la hoja «Desglose por compañía».</p>
      <div class="s4-pie"><span class="s4-nombre">${esc(nombreRefundido())}</span><button class="btn oro" type="button" data-s4="refundir">Descargar Excel refundido</button></div></div></div>`;
  }
  function nombreRefundido() { const d = aFecha(R.fecha); return `${hoyTxt()}_SOLICITUD_REPOSTAJE_${d ? diaMes(d) + '_' : ''}BPAC_II_REFUNDIDO.xlsx`; }
  function vistaRefundir() {
    const raiz = H.pintar(`${H.banda('<a href="#/">Inicio</a> / <a href="#/s4">S4</a> / <span>Refundir repostaje</span>', 'Refundir <i>solicitudes</i>', 'Mete las solicitudes de las compañías y sale un solo Excel con los totales y el desglose de cada una.', 'foto-sierra')}
    <section class="pagina"><div class="contenedor s4">
      <div class="s4-paso"><span class="s4-num">1</span><div class="s4-paso-cuerpo"><h2>Solicitudes de las compañías</h2><div id="r4-archivos">${htmlArchivos()}</div></div></div>
      <div id="r4-resumen">${htmlResumen()}</div>
      <p class="s4-vuelta"><a href="#/s4/repostaje">← Hacer una solicitud</a></p>
    </div></section>`);
    H.animarEntrada && H.animarEntrada(raiz);
    const repintar = () => { $('#r4-archivos').innerHTML = htmlArchivos(); $('#r4-resumen').innerHTML = htmlResumen(); };
    raiz.addEventListener('click', async e => {
      const b = e.target.closest('[data-s4]'); if (!b) return;
      if (b.dataset.s4 === 'anadir-sol') pedirSolicitudes();
      else if (b.dataset.s4 === 'quitar-sol') { R.archivos.splice(+b.closest('tr').dataset.i, 1); proponerComunes(); repintar(); }
      else if (b.dataset.s4 === 'refundir') refundir(b);
    });
    raiz.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.s4-zona')) { e.preventDefault(); pedirSolicitudes(); } });
    raiz.addEventListener('input', e => {
      if (e.target.dataset.campo === 'cia') { R.archivos[+e.target.closest('tr').dataset.i].cia = e.target.value.trim(); }
      if (e.target.id === 'r4-fecha') { R.fecha = e.target.value; R.tocado = true; const n = $('#r4-resumen .s4-nombre'); if (n) n.textContent = nombreRefundido(); }
      if (e.target.id === 'r4-fecha-alt') { R.fechaAlt = e.target.value; R.tocado = true; }
      if (e.target.id === 'r4-motivo') { R.motivo = e.target.value; R.tocado = true; }
    });
    raiz.addEventListener('change', e => { if (e.target.dataset.campo === 'cia') { const a = R.archivos[+e.target.closest('tr').dataset.i]; a.cia = a.cia ? etCia(a.cia) : ''; repintar(); } });
    vistaRefundir.repintar = repintar;
  }
  let entradaSol = null;
  function pedirSolicitudes() {
    if (!entradaSol) {
      entradaSol = document.createElement('input'); entradaSol.type = 'file'; entradaSol.accept = '.xlsx'; entradaSol.multiple = true; entradaSol.hidden = true; document.body.appendChild(entradaSol);
      entradaSol.addEventListener('change', () => { const fs = [...entradaSol.files]; entradaSol.value = ''; if (fs.length) anadirSolicitudes(fs); });
    }
    entradaSol.click();
  }
  async function anadirSolicitudes(files) {
    let ok = 0; const malos = [];
    for (const f of files) {
      if (!/\.xlsx$/i.test(f.name)) { malos.push(`${f.name}: no es .xlsx`); continue; }
      if (R.archivos.some(a => a.archivo === f.name)) { malos.push(`${f.name}: ya estaba`); continue; }
      try { R.archivos.push(await leerSolicitud(f)); ok++; } catch (e) { console.error(e); malos.push(`${f.name}: ${e.message}`); }
    }
    R.archivos.sort((a, b) => { const x = claveCia(a.cia), y = claveCia(b.cia); const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y); return nx && ny ? x - y : nx ? -1 : ny ? 1 : x.localeCompare(y); });
    proponerComunes();
    if (ok) H.toast(`${ok} solicitud${ok > 1 ? 'es' : ''} añadida${ok > 1 ? 's' : ''}.`);
    if (malos.length) H.toast('No añadidas: ' + malos.join(' · '), 'error');
    if (vistaRefundir.repintar && $('#r4-archivos')) vistaRefundir.repintar();
  }
  async function refundir(btn) {
    if (!R.fecha) { H.toast('Pon la fecha principal.', 'error'); $('#r4-fecha').focus(); return; }
    const sinCia = R.archivos.filter(a => !a.cia);
    if (sinCia.length) { H.toast(`Falta la compañía en ${sinCia.map(a => a.archivo).join(', ')}.`, 'error'); return; }
    btn.disabled = true;
    try {
      const s = sumar();
      const tipos = s.tipos.filter((t, i) => i < VEHICULOS.length || t.n || t.dL || t.gL).slice(0, 9);
      const desglose = [];
      for (const a of R.archivos) {
        const lineas = a.tipos.filter(t => t.n || t.dL || t.gL);
        const base = [a.f1 || a.f1txt || '', a.f2 || a.f2txt || '', a.motivo || '', a.archivo];
        if (!lineas.length) lineas.push({ et: '—', n: 0, dL: 0, gL: 0 });
        lineas.forEach((t, j) => {
          const pD = j === 0 ? a.pD : 0, pG = j === 0 ? a.pG : 0;
          desglose.push([a.cia, t.et === 'CAMION' ? 'CAMIÓN' : t.et, t.n, t.dL, t.gL, pD, pG, t.dL + t.gL + (pD + pG) * PETACA, ...base]);
        });
      }
      const mats = R.archivos.flatMap(a => a.mats.map(m => [m[0] || a.cia, ...m.slice(1)]));
      const blob = await construirExcel({ tipos, petD: s.pD, petG: s.pG, fecha: aFecha(R.fecha), fechaAlt: aFecha(R.fechaAlt) || '', motivo: R.motivo.trim().toUpperCase(), cia: '', desglose, matriculas: mats });
      H.descargar(blob, nombreRefundido());
      H.toast('Excel refundido descargado.');
    } catch (e) { console.error(e); H.toast('No se pudo crear el Excel: ' + e.message, 'error'); }
    btn.disabled = false;
  }

  // ======================================================================= entrada
  const HERR = [
    { seccion: 's4', id: 'repostaje', titulo: 'Solicitud de repostaje', resumen: 'Por compañía: tipo de vehículo, litros automáticos, petacas, fechas y motivo. Sale en Excel.', grupo: 'Combustible', chip: 'Excel', vista: vistaSolicitud },
    { seccion: 's4', id: 'refundir-repostaje', titulo: 'Refundir solicitudes de repostaje', resumen: 'Junta las solicitudes de todas las compañías en un solo Excel con totales y desglose.', grupo: 'Combustible', chip: 'Excel', vista: vistaRefundir },
  ];
  window.HERRAMIENTAS = (window.HERRAMIENTAS || []).concat(HERR.map(h => Object.assign({}, h, {
    vista: ayudas => { H = ayudas; h.vista(); },
  })));
  window.S4 = {
    /** Archivos soltados en la página: si estamos en una herramienta de S4, son para ella. */
    soltar(files, ayudas) {
      const ruta = location.hash;
      if (ayudas) H = ayudas;
      if (/^#\/s4\/refundir-repostaje/.test(ruta)) { anadirSolicitudes([...files]); return true; }
      if (/^#\/s4\/repostaje/.test(ruta)) { usarBase(files[0]); return true; }
      return false;
    },
    _base: B, _construirExcel: construirExcel, _leerSolicitud: leerSolicitud, _clasificar: clasificar,
  };
})();

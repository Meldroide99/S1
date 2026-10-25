/* Lector de Excel (.xlsx) y CSV, 100 % en el navegador.
 * El archivo nunca sale del equipo: se lee en memoria y se descarta al cerrar la pestaña.
 */
(function (global) {
  'use strict';
  const FORMATOS_FECHA = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

  const col = ref => { let n = 0; for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
  const pad = n => String(n).padStart(2, '0');
  const fechaTexto = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  function serialAFecha(serial, es1904) {
    const base = es1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const ms = Math.round(serial * 86400000);
    const u = new Date(base + ms);
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
  }

  async function leerXlsx(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const p = new DOMParser();
    const xml = async ruta => { const f = zip.file(ruta); return f ? p.parseFromString(await f.async('string'), 'application/xml') : null; };
    const todos = (doc, tag) => doc ? Array.from(doc.getElementsByTagName(tag)) : [];

    const libro = await xml('xl/workbook.xml');
    const es1904 = todos(libro, 'workbookPr').some(e => /^(1|true)$/.test(e.getAttribute('date1904') || ''));
    const rels = await xml('xl/_rels/workbook.xml.rels');
    const destino = {};
    todos(rels, 'Relationship').forEach(r => { destino[r.getAttribute('Id')] = r.getAttribute('Target'); });

    const compartidas = todos(await xml('xl/sharedStrings.xml'), 'si').map(si => todos(si, 't').map(t => t.textContent).join(''));

    const estilos = await xml('xl/styles.xml');
    const propios = {};
    todos(estilos, 'numFmt').forEach(n => { propios[+n.getAttribute('numFmtId')] = n.getAttribute('formatCode') || ''; });
    const xfs = estilos ? todos(estilos.getElementsByTagName('cellXfs')[0], 'xf') : [];
    const esFecha = s => {
      const xf = xfs[s]; if (!xf) return false;
      const id = +xf.getAttribute('numFmtId');
      if (FORMATOS_FECHA.has(id)) return true;
      const f = (propios[id] || '').replace(/\[[^\]]*\]|"[^"]*"|\\./g, '');
      return /[dmy]/i.test(f) && !/[#0]/.test(f);
    };

    const hojas = [];
    for (const h of todos(libro, 'sheet')) {
      const rid = h.getAttribute('r:id') || h.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let ruta = destino[rid] || '';
      ruta = ruta.startsWith('/') ? ruta.slice(1) : 'xl/' + ruta.replace(/^\.\//, '');
      const hoja = await xml(ruta);
      const filas = [];
      for (const r of todos(hoja, 'row')) {
        const fila = [];
        for (const c of todos(r, 'c')) {
          const ref = c.getAttribute('r'); const t = c.getAttribute('t'); const s = +(c.getAttribute('s') || 0);
          const v = c.getElementsByTagName('v')[0]; let valor = '';
          if (t === 's' && v) valor = compartidas[+v.textContent] || '';
          else if (t === 'inlineStr') valor = todos(c, 't').map(x => x.textContent).join('');
          else if (t === 'b' && v) valor = v.textContent === '1' ? 'SÍ' : 'NO';
          else if (v) {
            const n = Number(v.textContent);
            if (t !== 'str' && !isNaN(n) && esFecha(s) && n > 0) valor = fechaTexto(serialAFecha(n, es1904));
            else if (t !== 'str' && !isNaN(n)) valor = Number.isInteger(n) ? String(n) : String(+n.toFixed(6));
            else valor = v.textContent;
          }
          fila[col(ref)] = String(valor).trim();
        }
        filas[(+r.getAttribute('r') || filas.length + 1) - 1] = fila;
      }
      hojas.push({ nombre: h.getAttribute('name'), filas: Array.from(filas, f => Array.from(f || [], x => x || '')) });
    }
    return hojas;
  }

  function leerCsv(texto) {
    const primera = texto.split(/\r?\n/)[0] || '';
    const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
    const filas = []; let fila = [], campo = '', comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (comillas) {
        if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') comillas = false;
        else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo.trim()); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo.trim()); filas.push(fila); fila = []; campo = '';
      } else campo += ch;
    }
    if (campo || fila.length) { fila.push(campo.trim()); filas.push(fila); }
    return [{ nombre: 'CSV', filas }];
  }

  /** Busca la fila de cabeceras: la primera con al menos 3 celdas de texto. */
  function tabular(hoja) {
    const filas = hoja.filas;
    let h = filas.findIndex(f => f && f.filter(c => c && isNaN(Number(c))).length >= 3);
    if (h < 0) h = 0;
    const cab = (filas[h] || []).map(c => (c || '').replace(/\s+/g, ' ').trim());
    const columnas = []; cab.forEach((c, i) => { if (c) columnas.push({ i, nombre: c }); });
    const registros = [];
    for (let r = h + 1; r < filas.length; r++) {
      const f = filas[r]; if (!f) continue;
      const reg = {}; let lleno = 0;
      for (const c of columnas) { const v = f[c.i] || ''; reg[c.nombre] = v; if (v) lleno++; }
      if (lleno >= 2) registros.push(reg);
    }
    return { hoja: hoja.nombre, columnas: columnas.map(c => c.nombre), registros };
  }

  async function leerArchivo(file) {
    const nombre = file.name.toLowerCase();
    if (nombre.endsWith('.xls')) throw new Error('El formato .xls antiguo no se puede leer. Ábrelo en Excel y guárdalo como .xlsx.');
    if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) {
      const buf = await file.arrayBuffer();
      let texto = new TextDecoder('utf-8').decode(buf);
      if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf);
      return leerCsv(texto.replace(/^﻿/, ''));
    }
    return leerXlsx(await file.arrayBuffer());
  }

  global.Excel = { leerArchivo, tabular, fechaTexto };
})(window);

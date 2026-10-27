/* Rellena plantillas de Excel (.xlsx) en el navegador, igual que el motor de Word.
 *
 * En las celdas de la plantilla:
 *   {campo} / {CAMPO}         como en Word (tal cual / en MAYÚSCULAS)
 *   {#lista} ... {/lista}     en una fila: esa fila se repite por cada elemento de la lista
 *                             (la primera celda lleva {#lista} y la última {/lista})
 * Se respetan los estilos de cada celda (bordes, letra, alineación). Las fechas dd/mm/aaaa
 * se guardan como fecha de verdad si la celda modelo tiene formato de fecha; el resto, como
 * texto (así un DNI con ceros delante no se estropea). Se actualizan el filtro y el área de
 * impresión. Las filas repetidas heredan la altura de la fila modelo.
 */
(function (global) {
  'use strict';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const RE_TAG = /\{([#\/]?)([A-Za-z_ÁÉÍÓÚÑÜáéíóúñü0-9]+)\}/g;
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const hijos = (el, n) => Array.from(el.getElementsByTagNameNS(NS, n));
  const directos = (el, n) => Array.from(el.childNodes).filter(x => x.localName === n);

  function columna(ref) { return ref.replace(/\d+/g, ''); }
  function numFila(ref) { return +ref.replace(/\D+/g, ''); }

  function buscar(etiqueta, ambitos) {
    const k = etiqueta.toLowerCase();
    for (const a of ambitos) if (a && Object.prototype.hasOwnProperty.call(a, k) && a[k] != null) return a[k];
    return '';
  }
  function sustituir(texto, ambitos) {
    return texto.replace(RE_TAG, (m, signo, nombre) => (signo ? '' : Motor.transformar(nombre, buscar(nombre, ambitos))));
  }

  /* dd/mm/aaaa -> número de serie de Excel (días desde 30/12/1899) */
  function serie(txt) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(txt).trim());
    if (!m) return null;
    const ms = Date.UTC(+m[3], +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30);
    return Math.round(ms / 86400000);
  }

  /* Estilos de celda: cuáles son de fecha y cuáles «ajustan texto» (varias líneas). */
  function estilos(stylesXml) {
    const fechas = new Set(), ajuste = new Set();
    if (!stylesXml) return { fechas, ajuste };
    const doc = new DOMParser().parseFromString(stylesXml, 'application/xml');
    const propios = {};
    for (const f of hijos(doc, 'numFmt')) propios[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || '';
    const xfs = hijos(doc, 'cellXfs')[0];
    if (!xfs) return { fechas, ajuste };
    directos(xfs, 'xf').forEach((xf, i) => {
      const id = +xf.getAttribute('numFmtId');
      const cod = propios[id] || '';
      if ((id >= 14 && id <= 22) || (cod && /[dy]/i.test(cod.replace(/"[^"]*"|\[[^\]]*\]/g, '')))) fechas.add(String(i));
      const al = directos(xf, 'alignment')[0];
      if (al && /^(1|true)$/.test(al.getAttribute('wrapText') || '')) ajuste.add(String(i));
    });
    return { fechas, ajuste };
  }
  function letraANum(l) { let n = 0; for (const ch of l) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
  function anchos(doc) {
    const a = {};
    for (const c of hijos(doc, 'col')) for (let i = +c.getAttribute('min'); i <= +c.getAttribute('max'); i++) a[i] = +c.getAttribute('width') || 9;
    return a;
  }

  function leerCompartidos(xml) {
    if (!xml) return [];
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return directos(doc.documentElement, 'si').map(si => hijos(si, 't').map(t => t.textContent).join(''));
  }

  function textoCelda(c, compartidos) {
    const t = c.getAttribute('t');
    if (t === 's') { const v = directos(c, 'v')[0]; return v ? (compartidos[+v.textContent] || '') : ''; }
    if (t === 'inlineStr') return hijos(c, 't').map(x => x.textContent).join('');
    const v = directos(c, 'v')[0];
    return v ? v.textContent : '';
  }

  /* Escribe un valor en la celda: texto en línea, número de fecha o vacía (conserva el estilo). */
  function escribir(doc, c, valor, fechas) {
    while (c.firstChild) c.removeChild(c.firstChild);
    c.removeAttribute('t');
    const v = valor == null ? '' : String(valor);
    if (v === '') return;
    const s = c.getAttribute('s');
    const n = fechas.has(s) ? serie(v) : null;
    if (n !== null) {
      const ve = doc.createElementNS(NS, 'v'); ve.textContent = String(n); c.appendChild(ve);
      return;
    }
    c.setAttribute('t', 'inlineStr');
    const is = doc.createElementNS(NS, 'is'); const te = doc.createElementNS(NS, 't');
    te.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    te.textContent = v; is.appendChild(te); c.appendChild(is);
  }

  function rehacerRef(ref, filaFin) {
    // "A2:F3" -> "A2:F<filaFin>"
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref || '');
    return m ? `${m[1]}${m[2]}:${m[3]}${Math.max(+m[2], filaFin)}` : ref;
  }

  async function rellenar(fuente, datos) {
    const bytes = typeof fuente === 'string' ? Motor.base64aBytes(fuente) : fuente;
    const zip = await JSZip.loadAsync(bytes, { createFolders: false });
    const compartidos = leerCompartidos(zip.file('xl/sharedStrings.xml') && await zip.file('xl/sharedStrings.xml').async('string'));
    const { fechas, ajuste } = estilos(zip.file('xl/styles.xml') && await zip.file('xl/styles.xml').async('string'));
    const parser = new DOMParser(), ser = new XMLSerializer();
    const ultimas = {}; // hoja -> última fila escrita
    const rutas = Object.keys(zip.files).filter(r => /^xl\/worksheets\/sheet\d+\.xml$/.test(r));
    for (const ruta of rutas) {
      const doc = parser.parseFromString(await zip.file(ruta).async('string'), 'application/xml');
      const sd = hijos(doc, 'sheetData')[0]; if (!sd) continue;
      let filas = directos(sd, 'row');
      const ancho = anchos(doc);
      // 1) filas que se repiten
      for (let guard = 0; guard < 20; guard++) {
        const modelo = filas.find(r => directos(r, 'c').some(c => /\{#[^}]+\}/.test(textoCelda(c, compartidos))));
        if (!modelo) break;
        const celdas = directos(modelo, 'c');
        const nombre = celdas.map(c => textoCelda(c, compartidos)).join('').match(/\{#([^}]+)\}/)[1];
        const lista = Array.isArray(datos[nombre.toLowerCase()]) ? datos[nombre.toLowerCase()] : [];
        const r0 = +modelo.getAttribute('r');
        const extra = lista.length - 1;
        // desplazar las filas de debajo
        if (extra !== 0) for (const r of filas) {
          const n = +r.getAttribute('r'); if (n <= r0) continue;
          r.setAttribute('r', n + extra);
          for (const c of directos(r, 'c')) c.setAttribute('r', columna(c.getAttribute('r')) + (n + extra));
        }
        const plantillas = celdas.map(c => ({ col: columna(c.getAttribute('r')), texto: textoCelda(c, compartidos).replace(new RegExp('\\{[#/]' + nombre + '\\}', 'g'), '') }));
        lista.forEach((item, i) => {
          const fila = modelo.cloneNode(true); const n = r0 + i;
          fila.setAttribute('r', n);
          let lineas = 1;
          directos(fila, 'c').forEach((c, j) => {
            c.setAttribute('r', plantillas[j].col + n);
            const v = sustituir(plantillas[j].texto, [item, datos]);
            escribir(doc, c, v, fechas);
            // texto largo en celda que ajusta: la fila crece (Excel no lo recalcula al abrir si la altura es fija)
            if (v && ajuste.has(c.getAttribute('s'))) {
              const w = ancho[letraANum(plantillas[j].col)] || 9;
              lineas = Math.max(lineas, Math.ceil(v.length * 1.15 / Math.max(1, w - 1)));
            }
          });
          const ht = parseFloat(fila.getAttribute('ht'));
          if (lineas > 1 && ht) { fila.setAttribute('ht', String(Math.round((ht + (lineas - 1) * 12.5) * 4) / 4)); fila.setAttribute('customHeight', '1'); }
          sd.insertBefore(fila, modelo);
        });
        sd.removeChild(modelo);
        filas = directos(sd, 'row');
      }
      // 2) resto de celdas con etiquetas
      for (const r of filas) for (const c of directos(r, 'c')) {
        const t = textoCelda(c, compartidos);
        if (/\{[A-Za-z_ÁÉÍÓÚÑÜáéíóúñü0-9]+\}/.test(t)) escribir(doc, c, sustituir(t, [datos]), fechas);
      }
      // 3) dimensión y filtro
      const ultima = filas.reduce((m, r) => Math.max(m, +r.getAttribute('r')), 1);
      ultimas[ruta] = ultima;
      const dim = hijos(doc, 'dimension')[0];
      if (dim) { const ref = dim.getAttribute('ref'); const m = /^([A-Z]+\d+):([A-Z]+)\d+$/.exec(ref); if (m) dim.setAttribute('ref', `${m[1]}:${m[2]}${ultima}`); }
      const af = hijos(doc, 'autoFilter')[0];
      if (af) af.setAttribute('ref', rehacerRef(af.getAttribute('ref'), ultima));
      zip.file(ruta, ser.serializeToString(doc));
    }
    // filtro guardado en el libro (_FilterDatabase)
    const wbf = zip.file('xl/workbook.xml');
    if (wbf) {
      let wb = await wbf.async('string');
      const ultima = Math.max(...Object.values(ultimas), 1);
      wb = wb.replace(/(<definedName[^>]*name="_xlnm\._FilterDatabase"[^>]*>[^<]*?\$[A-Z]+\$\d+:\$[A-Z]+\$)(\d+)/, (m, a) => a + ultima);
      zip.file('xl/workbook.xml', wb);
    }
    // sin entradas de carpeta en el zip (Office las tolera, pero así queda igual que un .xlsx de Excel)
    for (const k of Object.keys(zip.files)) if (zip.files[k].dir) delete zip.files[k];
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: MIME });
  }

  global.Hoja = { rellenar };
})(window);

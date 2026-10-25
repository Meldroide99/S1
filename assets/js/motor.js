/* Motor de plantillas Word (.docx) — sin servidor, sin internet.
 *
 * Etiquetas en la plantilla:
 *   {campo}          valor tal cual
 *   {CAMPO}          valor en MAYÚSCULAS
 *   {Campo}          si el valor viene en mayúsculas, lo pasa a "Tipo Título" (de, del, la... en minúscula)
 *   {#lista} ... {/lista}   en una fila de tabla: repite la fila por cada elemento de la lista
 * Word suele partir las etiquetas en varios trozos al escribirlas; el motor las vuelve a unir.
 */
(function (global) {
  'use strict';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const XMLNS = 'http://www.w3.org/XML/1998/namespace';
  const RE_TAG = /\{([#\/]?)([A-Za-z_ÁÉÍÓÚÑÜáéíóúñü0-9]+)\}/g;
  const PARTES_XML = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
  const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'el', 'en', 'a', 'al']);

  function capitalizar(v) {
    if (!v || /[a-zñáéíóúü]/.test(v)) return v; // ya tiene minúsculas: se respeta
    return v.toLocaleLowerCase('es').replace(/(^|[\s\-“"(\/])([a-zñáéíóúü])([a-zñáéíóúü]*)/g, (m, sep, l, resto, pos) => {
      const palabra = l + resto;
      if (pos > 0 && PARTICULAS.has(palabra)) return sep + palabra;
      return sep + l.toLocaleUpperCase('es') + resto;
    }).replace(/\b(cget|eof|esb|ilg|lig|mtm|bod|fas|ripac|bpac|uco|dni|nif|siperdef|ri|s-1|s1|ii|iii|iv)\b/gi, s => s.toUpperCase());
  }

  function transformar(etiqueta, valor) {
    if (valor === undefined || valor === null) return '';
    let v = String(valor);
    const letras = etiqueta.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
    if (!letras) return v;
    if (letras === letras.toUpperCase()) return v.toLocaleUpperCase('es');
    if (letras[0] === letras[0].toUpperCase()) return capitalizar(v);
    return v;
  }

  function buscar(etiqueta, ambitos) {
    const k = etiqueta.toLowerCase();
    for (const a of ambitos) {
      if (a && Object.prototype.hasOwnProperty.call(a, k) && a[k] !== undefined && a[k] !== null) return a[k];
    }
    return '';
  }

  const hijos = (el, nombre) => Array.from(el.getElementsByTagNameNS(W, nombre));

  /* Une en un solo <w:t> las etiquetas que Word ha partido en varios runs */
  function unirEtiquetas(doc) {
    for (const p of hijos(doc, 'p')) {
      const ts = hijos(p, 't').filter(t => t.closest ? true : true);
      if (ts.length < 2) continue;
      const textos = ts.map(t => t.textContent);
      const todo = textos.join('');
      if (todo.indexOf('{') < 0) continue;
      const ini = []; let acc = 0;
      for (const s of textos) { ini.push(acc); acc += s.length; }
      const nodoDe = pos => { let i = 0; while (i + 1 < ini.length && ini[i + 1] <= pos) i++; return i; };
      const coincidencias = [];
      const re = /\{[^{}]*\}/g; let m;
      while ((m = re.exec(todo))) coincidencias.push([m.index, m.index + m[0].length, m[0]]);
      for (let k = coincidencias.length - 1; k >= 0; k--) {
        const [s, e, tag] = coincidencias[k];
        const a = nodoDe(s), b = nodoDe(e - 1);
        if (a === b) continue;
        const ta = ts[a], tb = ts[b];
        ta.textContent = ta.textContent.slice(0, s - ini[a]) + tag;
        for (let i = a + 1; i < b; i++) ts[i].textContent = '';
        tb.textContent = tb.textContent.slice(e - ini[b]);
        ta.setAttributeNS(XMLNS, 'xml:space', 'preserve');
        tb.setAttributeNS(XMLNS, 'xml:space', 'preserve');
        // recalcular textos para las siguientes (están antes, offsets intactos)
        textos[a] = ta.textContent; textos[b] = tb.textContent;
      }
    }
  }

  function textoDe(el) { return hijos(el, 't').map(t => t.textContent).join(''); }

  /* Repite filas de tabla marcadas con {#lista} ... {/lista} */
  function expandirBucles(doc, datos) {
    let seguridad = 0;
    while (seguridad++ < 200) {
      const filas = hijos(doc, 'tr');
      const inicio = filas.find(tr => /\{#[^}]+\}/.test(textoDe(tr)));
      if (!inicio) break;
      const nombre = textoDe(inicio).match(/\{#([^}]+)\}/)[1];
      const grupo = [inicio];
      let fila = inicio;
      while (!textoDe(fila).includes('{/' + nombre + '}')) {
        fila = fila.nextSibling;
        while (fila && fila.localName !== 'tr') fila = fila.nextSibling;
        if (!fila) break;
        grupo.push(fila);
      }
      const lista = Array.isArray(datos[nombre.toLowerCase()]) ? datos[nombre.toLowerCase()] : [];
      const padre = inicio.parentNode;
      for (const item of lista) {
        for (const g of grupo) {
          const copia = g.cloneNode(true);
          for (const t of hijos(copia, 't')) {
            const txt = t.textContent.replace(new RegExp('\\{[#/]' + nombre + '\\}', 'g'), '');
            t.textContent = sustituir(txt, [item, datos]);
            if (/\s$|^\s/.test(t.textContent)) t.setAttributeNS(XMLNS, 'xml:space', 'preserve');
          }
          padre.insertBefore(copia, inicio);
        }
      }
      for (const g of grupo) g.parentNode.removeChild(g);
    }
  }

  /* Párrafos condicionales: si un párrafo contiene {?campo} y el campo está vacío,
   * se elimina el párrafo entero; si tiene valor, solo se quita la marca. */
  function condicionales(doc, datos) {
    for (const p of hijos(doc, 'p')) {
      const tx = textoDe(p);
      const m = tx.match(/\{\?([^}]+)\}/);
      if (!m) continue;
      const v = buscar(m[1], [datos]);
      const vacio = v === '' || v === false || (Array.isArray(v) && !v.length);
      if (vacio) {
        const padre = p.parentNode;
        const enCelda = padre.localName === 'tc' && hijos(padre, 'p').length === 1;
        if (enCelda) hijos(p, 't').forEach(t => { t.textContent = ''; });
        else padre.removeChild(p);
      } else {
        hijos(p, 't').forEach(t => { t.textContent = t.textContent.replace(/\{\?[^}]+\}/g, ''); });
      }
    }
  }

  function sustituir(texto, ambitos) {
    return texto.replace(RE_TAG, (m, signo, nombre) => (signo ? '' : transformar(nombre, buscar(nombre, ambitos))));
  }

  /* Sustituye etiquetas y convierte saltos de línea en <w:br/> */
  function rellenarTextos(doc, datos) {
    for (const t of hijos(doc, 't')) {
      const txt = t.textContent;
      if (txt.indexOf('{') < 0) continue;
      const nuevo = sustituir(txt, [datos]);
      t.setAttributeNS(XMLNS, 'xml:space', 'preserve');
      if (nuevo.indexOf('\n') < 0) { t.textContent = nuevo; continue; }
      const trozos = nuevo.split('\n');
      t.textContent = trozos[0];
      let ref = t;
      for (let i = 1; i < trozos.length; i++) {
        const br = doc.createElementNS(W, 'w:br');
        const nt = doc.createElementNS(W, 'w:t');
        nt.setAttributeNS(XMLNS, 'xml:space', 'preserve');
        nt.textContent = trozos[i];
        ref.parentNode.insertBefore(br, ref.nextSibling);
        br.parentNode.insertBefore(nt, br.nextSibling);
        ref = nt;
      }
    }
  }

  function base64aBytes(b64) {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  async function abrir(fuente) {
    const datos = typeof fuente === 'string' ? base64aBytes(fuente) : fuente;
    return JSZip.loadAsync(datos);
  }

  /** Rellena una plantilla. fuente: base64 | ArrayBuffer | Uint8Array. Devuelve Blob .docx */
  async function rellenar(fuente, datos) {
    const zip = await abrir(fuente);
    const parser = new DOMParser(), ser = new XMLSerializer();
    for (const ruta of Object.keys(zip.files)) {
      if (!PARTES_XML.test(ruta)) continue;
      const xml = await zip.file(ruta).async('string');
      if (xml.indexOf('{') < 0) continue;
      const doc = parser.parseFromString(xml, 'application/xml');
      unirEtiquetas(doc);
      condicionales(doc, datos);
      expandirBucles(doc, datos);
      rellenarTextos(doc, datos);
      zip.file(ruta, ser.serializeToString(doc));
    }
    return zip.generateAsync({
      type: 'blob', compression: 'DEFLATE',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  /** Lista las etiquetas de una plantilla (para plantillas propias). */
  async function etiquetas(fuente) {
    const zip = await abrir(fuente);
    const parser = new DOMParser();
    const campos = new Map(), listas = new Map();
    for (const ruta of Object.keys(zip.files)) {
      if (!PARTES_XML.test(ruta)) continue;
      const doc = parser.parseFromString(await zip.file(ruta).async('string'), 'application/xml');
      unirEtiquetas(doc);
      for (const tr of hijos(doc, 'tr')) {
        const tx = textoDe(tr); const m = tx.match(/\{#([^}]+)\}/);
        if (m) {
          const cols = [];
          let fila = tr; const nombre = m[1];
          while (fila) {
            const t = textoDe(fila); let mm; const re = new RegExp(RE_TAG.source, 'g');
            while ((mm = re.exec(t))) if (!mm[1]) cols.push(mm[2]);
            if (t.includes('{/' + nombre + '}')) break;
            fila = fila.nextSibling;
          }
          listas.set(nombre.toLowerCase(), { nombre, columnas: [...new Set(cols)] });
        }
      }
      const enListas = new Set([...listas.values()].flatMap(l => l.columnas.map(c => c.toLowerCase())));
      let m; const re = new RegExp(RE_TAG.source, 'g'); const todo = textoDe(doc);
      while ((m = re.exec(todo))) {
        if (m[1]) continue;
        const k = m[2].toLowerCase();
        if (!enListas.has(k) && !campos.has(k)) campos.set(k, m[2]);
      }
    }
    return { campos: [...campos.values()], listas: [...listas.values()] };
  }

  global.Motor = { rellenar, etiquetas, transformar, capitalizar, base64aBytes };
})(window);

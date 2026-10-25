/* Exporta a PDF exactamente lo que se ve en la previsualización.
 *
 * No hace "captura de pantalla": recorre la página renderizada y vuelve a dibujar cada palabra,
 * línea de tabla e imagen en su posición exacta con texto vectorial (se puede seleccionar y
 * se imprime nítido). Arial se dibuja con Helvetica y Times New Roman con Times, que tienen
 * las mismas medidas de letra, así que nada se mueve.
 */
(function (global) {
  'use strict';
  const { PDFDocument, StandardFonts, rgb, LineCapStyle } = PDFLib;
  const PX = 0.75; // 1 px CSS = 0,75 pt

  // Caracteres que admite la codificación WinAnsi de las fuentes estándar del PDF
  const EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const SUSTITUTOS = { '☐': '[ ]', '☑': '[X]', '☒': '[X]', '✓': 'X', '✔': 'X', '≤': '<=', '≥': '>=', ' ': ' ', ' ': ' ', ' ': ' ', '−': '-', '‐': '-', '‑': '-' };
  function limpiar(t) {
    let s = '';
    for (const ch of t) {
      const c = ch.codePointAt(0);
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa1 && c <= 0xff) || EXTRA.includes(ch)) s += ch;
      else if (SUSTITUTOS[ch] !== undefined) s += SUSTITUTOS[ch];
      else if (c === 0x09) s += ' ';
      else s += '?';
    }
    return s;
  }

  function color(css) {
    const m = css && css.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (!m) return null;
    if (m[4] !== undefined && +m[4] === 0) return null;
    return rgb(+m[1] / 255, +m[2] / 255, +m[3] / 255);
  }

  async function fuentes(pdf) {
    const f = {};
    const pares = {
      'sans': [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
      'serif': [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
      'mono': [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
    };
    for (const [k, l] of Object.entries(pares)) f[k] = await Promise.all(l.map(n => pdf.embedFont(n)));
    return f;
  }
  // métricas (ascendente) de las fuentes de pantalla
  const ASC = { sans: 0.905, serif: 0.891, mono: 0.833 };
  function familia(ff) {
    ff = (ff || '').toLowerCase();
    if (/times|serif(?!-)|georgia|garamond|cambria|book antiqua/.test(ff) && !/sans/.test(ff)) return 'serif';
    if (/courier|mono|consolas/.test(ff)) return 'mono';
    return 'sans';
  }

  function subrayado(el, limite) {
    for (let e = el; e && e !== limite; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if ((cs.textDecorationLine || cs.textDecoration || '').includes('underline')) return true;
      if (cs.display === 'block' || cs.display === 'table-cell') break;
    }
    return false;
  }

  async function imagenPdf(pdf, src, cache) {
    if (cache.has(src)) return cache.get(src);
    let promesa = (async () => {
      const resp = await fetch(src); const buf = new Uint8Array(await resp.arrayBuffer());
      const esPng = buf[0] === 0x89 && buf[1] === 0x50;
      const esJpg = buf[0] === 0xff && buf[1] === 0xd8;
      if (esPng) return pdf.embedPng(buf);
      if (esJpg) return pdf.embedJpg(buf);
      // otros formatos: pasar por canvas a PNG
      const img = new Image(); img.src = src; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext('2d').drawImage(img, 0, 0);
      const b = await (await fetch(cv.toDataURL('image/png'))).arrayBuffer();
      return pdf.embedPng(b);
    })();
    cache.set(src, promesa);
    return promesa;
  }

  async function dibujarSeccion(pdf, seccion, F, cache) {
    const r0 = seccion.getBoundingClientRect();
    const escala = r0.width / seccion.offsetWidth || 1; // por si la vista está ampliada/reducida
    const anchoPt = seccion.offsetWidth * PX, altoPt = seccion.offsetHeight * PX;
    const pagina = pdf.addPage([anchoPt, altoPt]);
    const X = x => ((x - r0.left) / escala) * PX;
    const Y = y => altoPt - ((y - r0.top) / escala) * PX;
    const elementos = Array.from(seccion.querySelectorAll('*'));

    // 1) fondos
    for (const el of elementos) {
      const cs = getComputedStyle(el);
      const c = color(cs.backgroundColor);
      if (!c || el === seccion) continue;
      if (/^rgba?\(255,\s*255,\s*255/.test(cs.backgroundColor)) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      pagina.drawRectangle({ x: X(r.left), y: Y(r.bottom), width: (r.width / escala) * PX, height: (r.height / escala) * PX, color: c });
    }
    // 2) bordes (tablas, recuadros, filetes)
    for (const el of elementos) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
      // en tablas con bordes "colapsados" el borde ya está centrado en el canto de la celda
      const tab = (el.tagName === 'TD' || el.tagName === 'TH') ? el.closest('table') : null;
      const colapsado = tab && getComputedStyle(tab).borderCollapse === 'collapse';
      const lados = [
        ['Top', r.left, r.top, r.right, r.top, 1],
        ['Bottom', r.left, r.bottom, r.right, r.bottom, -1],
        ['Left', r.left, r.top, r.left, r.bottom, 1],
        ['Right', r.right, r.top, r.right, r.bottom, -1],
      ];
      for (const [lado, x1, y1, x2, y2, signo] of lados) {
        const estilo = cs['border' + lado + 'Style'];
        const ancho = parseFloat(cs['border' + lado + 'Width']);
        if (!ancho || estilo === 'none' || estilo === 'hidden') continue;
        const c = color(cs['border' + lado + 'Color']) || rgb(0, 0, 0);
        const g = (ancho / escala) * PX;
        const desp = colapsado ? 0 : (ancho / 2) * signo; // centro del borde
        const horizontal = lado === 'Top' || lado === 'Bottom';
        const discontinua = estilo === 'dashed' ? [3 * g, 2 * g] : estilo === 'dotted' ? [g, g] : undefined;
        pagina.drawLine({
          start: { x: X(x1), y: Y(horizontal ? y1 + desp : y1) },
          end: { x: X(x2), y: Y(horizontal ? y2 + desp : y2) },
          thickness: g, color: c, dashArray: discontinua, lineCap: LineCapStyle.Projecting,
          ...(horizontal ? {} : { start: { x: X(x1 + desp), y: Y(y1) }, end: { x: X(x2 + desp), y: Y(y2) } }),
        });
      }
    }
    // 3) imágenes
    for (const img of seccion.querySelectorAll('img')) {
      const r = img.getBoundingClientRect(); if (!r.width) continue;
      try {
        const im = await imagenPdf(pdf, img.currentSrc || img.src, cache);
        pagina.drawImage(im, { x: X(r.left), y: Y(r.bottom), width: (r.width / escala) * PX, height: (r.height / escala) * PX });
      } catch (e) { console.warn('Imagen no exportada', e); }
    }
    // 4) texto, palabra a palabra en su posición exacta
    const walker = document.createTreeWalker(seccion, NodeFilter.SHOW_TEXT);
    const rango = document.createRange();
    let nodo;
    while ((nodo = walker.nextNode())) {
      const texto = nodo.textContent;
      if (!texto || !texto.trim()) continue;
      const el = nodo.parentElement; const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const fam = familia(cs.fontFamily);
      const negrita = (parseInt(cs.fontWeight, 10) || 400) >= 600;
      const cursiva = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique';
      const fuente = F[fam][(negrita ? 1 : 0) + (cursiva ? 2 : 0)];
      const tamPx = parseFloat(cs.fontSize);
      const tamPt = tamPx * PX;
      const c = color(cs.color) || rgb(0, 0, 0);
      const espaciado = cs.letterSpacing && cs.letterSpacing !== 'normal' && parseFloat(cs.letterSpacing) !== 0;
      const trozos = espaciado ? Array.from(texto).map((ch, i) => [ch, i]) : (() => {
        const out = []; const re = /\S+/g; let m; while ((m = re.exec(texto))) out.push([m[0], m.index]); return out;
      })();
      // la posición se mide en unidades de código UTF-16
      for (const [palabra, idx] of trozos) {
        if (!palabra.trim()) continue;
        rango.setStart(nodo, idx); rango.setEnd(nodo, idx + palabra.length);
        const rects = Array.from(rango.getClientRects()).filter(r => r.width > 0);
        if (!rects.length) continue;
        if (rects.length === 1) {
          const r = rects[0];
          const base = r.top + ASC[fam] * tamPx * escala;
          pagina.drawText(limpiar(palabra), { x: X(r.left), y: Y(base), size: tamPt, font: fuente, color: c });
        } else {
          // palabra partida entre líneas: letra a letra
          let k = 0;
          for (const ch of palabra) {
            rango.setStart(nodo, idx + k); rango.setEnd(nodo, idx + k + ch.length); k += ch.length;
            const rr = rango.getClientRects()[0]; if (!rr) continue;
            pagina.drawText(limpiar(ch), { x: X(rr.left), y: Y(rr.top + ASC[fam] * tamPx * escala), size: tamPt, font: fuente, color: c });
          }
        }
      }
      if (subrayado(el, seccion)) {
        const a = texto.search(/\S/), b = texto.length - (texto.length - texto.trimEnd().length);
        rango.setStart(nodo, a); rango.setEnd(nodo, b);
        for (const r of rango.getClientRects()) {
          if (!r.width) continue;
          const yb = r.top + ASC[fam] * tamPx * escala + 0.11 * tamPx * escala;
          pagina.drawLine({ start: { x: X(r.left), y: Y(yb) }, end: { x: X(r.right), y: Y(yb) }, thickness: Math.max(0.5, 0.07 * tamPt), color: c });
        }
      }
    }
  }

  /** PDF que se va llenando documento a documento (para sacar muchos de golpe). */
  async function nuevoPdf(titulo) {
    const pdf = await PDFDocument.create();
    pdf.setTitle(titulo || 'Documento'); pdf.setCreator('IIBPAC'); pdf.setProducer('IIBPAC · Documentación');
    pdf.setLanguage('es-ES');
    const F = await fuentes(pdf); const cache = new Map();
    return {
      async anadir(cont) { for (const s of cont.querySelectorAll("section.hoja-docx, section.docx")) await dibujarSeccion(pdf, s, F, cache); },
      paginas: () => pdf.getPageCount(),
      async blob() { return new Blob([await pdf.save()], { type: 'application/pdf' }); },
    };
  }

  /** contenedores: elementos con el documento ya renderizado por docx-preview. */
  async function crearPdf(contenedores, titulo) {
    const p = await nuevoPdf(titulo);
    for (const cont of [].concat(contenedores)) await p.anadir(cont);
    return p.blob();
  }

  global.ExportarPdf = { crearPdf, nuevoPdf };
})(window);

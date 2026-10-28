/* Envío de correos (confirmar cuenta, contraseña olvidada, avisos y recordatorios).
 *
 * Proveedores (se elige en Ajustes, desde la página):
 *  - «registro»: no envía nada; apunta cada correo en correos.log (para probar antes de contratar nada).
 *  - «brevo» o «resend»: servicios de envío con plan gratuito. Necesitan una clave (API key) y un
 *    remitente de tu dominio verificado en el servicio.
 * Los correos se mandan de uno en uno, con reintentos si el servicio falla.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./almacen');

const cola = [];
let trabajando = false;
let cfgActual = () => ({});

const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Plantilla sencilla y elegante, que se ve bien en Outlook, Gmail y el móvil. */
function html({ titulo, parrafos = [], boton, pie }) {
  return `<!doctype html><html><body style="margin:0;background:#F4F1EC;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1D2125">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F1EC;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0E2A44;padding:18px 28px;color:#E4C88F;font-size:12px;letter-spacing:3px;text-transform:uppercase;font-weight:700">IIBPAC · Moral y Bienestar</td></tr>
<tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 14px;font:400 26px/1.2 Georgia,serif;color:#1D2125">${escH(titulo)}</h1>
${parrafos.map(p => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3A4047">${p}</p>`).join('')}
${boton ? `<p style="margin:22px 0 8px"><a href="${escH(boton.url)}" style="display:inline-block;background:#9A7642;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:24px">${escH(boton.texto)}</a></p>
<p style="margin:0 0 12px;font-size:12px;color:#8C9095">Si el botón no funciona, copia este enlace: ${escH(boton.url)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;color:#8C9095;border-top:1px solid #EEE9E1">${pie ? pie + '<br>' : ''}Correo automático: no respondas a este mensaje.</td></tr>
</table></td></tr></table></body></html>`;
}

async function mandarUno(m) {
  const cfg = cfgActual().correo || {};
  const proveedor = cfg.proveedor || 'registro';
  if (proveedor === 'registro') {
    fs.mkdirSync(A.DATOS, { recursive: true, mode: 0o700 });
    fs.appendFileSync(path.join(A.DATOS, 'correos.log'), JSON.stringify({ fecha: new Date().toISOString(), para: m.para, asunto: m.asunto, texto: m.texto }) + '\n', { mode: 0o600 });
    return;
  }
  if (!cfg.clave || !cfg.remitente) throw new Error('Falta la clave o el remitente del servicio de correo.');
  const remitente = cfg.nombre ? `${cfg.nombre} <${cfg.remitente}>` : cfg.remitente;
  let r;
  if (proveedor === 'brevo') {
    r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': cfg.clave, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: { email: cfg.remitente, name: cfg.nombre || 'IIBPAC' }, to: [{ email: m.para, name: m.nombre || undefined }], subject: m.asunto, htmlContent: m.html, textContent: m.texto }),
    });
  } else if (proveedor === 'resend') {
    r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + cfg.clave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remitente, to: [m.para], subject: m.asunto, html: m.html, text: m.texto }),
    });
  } else throw new Error('Proveedor de correo desconocido: ' + proveedor);
  if (!r.ok) throw new Error(`${proveedor} respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function procesar() {
  if (trabajando) return; trabajando = true;
  while (cola.length) {
    const m = cola[0];
    try { await mandarUno(m); cola.shift(); if (m.ok) m.ok(); }
    catch (e) {
      m.intentos = (m.intentos || 0) + 1;
      console.error(`Correo a ${m.para} («${m.asunto}») falló (${m.intentos}): ${e.message}`);
      if (m.intentos >= 3) { cola.shift(); if (m.mal) m.mal(e); } else await new Promise(r => setTimeout(r, 4000 * m.intentos));
    }
    await new Promise(r => setTimeout(r, 250)); // sin agobiar al servicio
  }
  trabajando = false;
}

/** Pone un correo en la cola. Devuelve una promesa (por si se quiere esperar, como en el correo de prueba). */
function enviar({ para, nombre, asunto, titulo, parrafos, boton, pie, esperar }) {
  if (!para) return Promise.resolve();
  const texto = [titulo, '', ...(parrafos || []).map(p => p.replace(/<[^>]+>/g, '')), boton ? `\n${boton.texto}: ${boton.url}` : ''].join('\n');
  // solo se avisa del fallo a quien espera la respuesta (p. ej. el correo de prueba); el resto, al registro
  return new Promise((ok, mal) => { cola.push({ para, nombre, asunto, texto, html: html({ titulo, parrafos, boton, pie }), ok, mal: esperar ? mal : () => ok() }); procesar(); });
}

module.exports = { enviar, escH, configurar: f => { cfgActual = f; } };

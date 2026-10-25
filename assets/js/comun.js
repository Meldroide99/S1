/* Utilidades comunes: fechas, números en letra, columnas del Excel y datos de la unidad. */
(function (global) {
  'use strict';

  // ------------------------------------------------------------------ texto
  const sinAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => sinAcentos(s).toUpperCase().replace(/[º°]/g, 'O').replace(/[ª]/g, 'A').replace(/[^A-Z0-9]+/g, ' ').trim();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------------ fechas
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MES_MIL = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const pad = n => String(n).padStart(2, '0');
  /** Acepta 'aaaa-mm-dd' (input fecha) o 'dd/mm/aaaa' (Excel) */
  function aFecha(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    let m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = String(v).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) { let a = +m[3]; if (a < 100) a += a < 50 ? 2000 : 1900; return new Date(a, +m[2] - 1, +m[1]); }
    return null;
  }
  const iso = d => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
  const corta = d => d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
  const larga = d => d ? `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}` : '';
  const militar = d => d ? `${pad(d.getDate())}${MES_MIL[d.getMonth()]}${String(d.getFullYear()).slice(2)}` : '';
  const hoy = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const diasEntre = (a, b) => Math.round((b - a) / 86400000);
  const sumarMeses = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  const esLaborable = d => d.getDay() !== 0 && d.getDay() !== 6;

  // ------------------------------------------------------------------ números en letra
  const U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  function letras(n) {
    n = Math.floor(Number(n));
    if (!isFinite(n) || n < 0) return '';
    if (n < 30) return U[n];
    if (n < 100) return D[Math.floor(n / 10)] + (n % 10 ? ' y ' + U[n % 10] : '');
    if (n === 100) return 'cien';
    if (n < 1000) return C[Math.floor(n / 100)] + (n % 100 ? ' ' + letras(n % 100) : '');
    if (n < 1e6) { const m = Math.floor(n / 1000); return (m === 1 ? 'mil' : letras(m).replace(/uno$/, 'ún') + ' mil') + (n % 1000 ? ' ' + letras(n % 1000) : ''); }
    return String(n);
  }

  // ------------------------------------------------------------------ empleos
  const EMPLEOS = [
    ['SOLDADO', 'SDO'], ['SOLDADO DE PRIMERA', 'SDO1'], ['CABO', 'CBO'], ['CABO PRIMERO', 'CB1'], ['CABO MAYOR', 'CBM'],
    ['SARGENTO', 'SGTO'], ['SARGENTO PRIMERO', 'SG1'], ['BRIGADA', 'BG'], ['SUBTENIENTE', 'STTE'], ['SUBOFICIAL MAYOR', 'SBMY'],
    ['ALFEREZ', 'ALF'], ['TENIENTE', 'TTE'], ['CAPITAN', 'CAP'], ['COMANDANTE', 'CTE'], ['TENIENTE CORONEL', 'TCOL'], ['CORONEL', 'COL'],
    ['GENERAL DE BRIGADA', 'GB'], ['GENERAL DE DIVISION', 'GD'], ['TENIENTE GENERAL', 'TG'],
  ];
  const BONITO = { 'SARGENTO PRIMERO': 'SARGENTO 1º', 'CABO PRIMERO': 'CABO 1º', 'ALFEREZ': 'ALFÉREZ', 'CAPITAN': 'CAPITÁN', 'GENERAL DE DIVISION': 'GENERAL DE DIVISIÓN' };
  function empleoNorm(v) { return norm(v).replace(/\b1O\b|\b1\b/g, 'PRIMERO').replace(/\s+/g, ' ').trim(); }
  function abreviar(empleo) { const n = empleoNorm(empleo); const e = EMPLEOS.find(x => x[0] === n); return e ? e[1] : ''; }
  function desabreviar(ab) {
    const n = norm(ab).replace(/\s/g, '');
    const alias = { SGT: 'SGTO', SG: 'SGTO', SARG: 'SGTO', SGTO1: 'SG1', SGTO1O: 'SG1', SG1O: 'SG1', SGT1: 'SG1', BRIG: 'BG', BRG: 'BG', CB: 'CBO', CAB: 'CBO', CABO1: 'CB1', CB1O: 'CB1', CBO1: 'CB1', CBO1O: 'CB1', CBMY: 'CBM', CBOMY: 'CBM', SBM: 'SBMY', SUBMY: 'SBMY', ST: 'STTE', SBTTE: 'STTE', TCOR: 'TCOL', TCNEL: 'TCOL', TCORONEL: 'TCOL', CORONEL: 'COL', CMTE: 'CTE', COM: 'CTE', CAPT: 'CAP', CPT: 'CAP', TENIENTE: 'TTE', TTE1: 'TTE', ALFZ: 'ALF', SOLD: 'SDO', SOL: 'SDO', SD: 'SDO', SDO1: 'SDO1', SDO1O: 'SDO1' };
    const k = alias[n] || n; const e = EMPLEOS.find(x => x[1] === k);
    return e ? (BONITO[e[0]] || e[0]) : '';
  }

  // ------------------------------------------------------------------ columnas del Excel
  // Cada dato de persona y los nombres de columna con que se reconoce (sin importar tildes ni mayúsculas).
  const CAMPOS_PERSONA = [
    { k: 'nombre', et: 'Nombre', alias: ['NOMBRE', 'NOMBRE PROPIO'] },
    { k: 'apellido1', et: '1.er apellido', alias: ['1O APELLIDO', '1ER APELLIDO', 'PRIMER APELLIDO', 'APELLIDO 1', 'APELLIDO1'] },
    { k: 'apellido2', et: '2.º apellido', alias: ['2O APELLIDO', 'SEGUNDO APELLIDO', 'APELLIDO 2', 'APELLIDO2'] },
    { k: 'apellidos', et: 'Apellidos', alias: ['APELLIDOS'] },
    { k: 'apellidos_nombre', et: 'Apellidos y nombre', alias: ['APELLIDOS Y NOMBRE', 'APELLIDOS NOMBRE', 'NOMBRE COMPLETO'] },
    { k: 'dni', et: 'DNI', alias: ['NUMERO DNI', 'DNI', 'NIF', 'DNI NIE', 'NO DNI', 'N DNI', 'DOCUMENTO'] },
    { k: 'empleo', et: 'Empleo', alias: ['EMPLEO', 'EMPLEO COMPLETO'] },
    { k: 'empleo_abrev', et: 'Empleo abreviado', alias: ['EMPLEO ABREVIADO', 'EMPLEO ABREV', 'EMP'] },
    { k: 'escala', et: 'Escala / especialidad', alias: ['ESCALA Y ESPECIALIDAD', 'ESCALA', 'CUERPO Y ESCALA', 'CUERPO', 'ESPECIALIDAD FUNDAMENTAL', 'ESPECIALIDAD'] },
    { k: 'sexo', et: 'Sexo (para D./Dª)', alias: ['SEXO', 'GENERO', 'TRATAMIENTO'] },
    { k: 'cia', et: 'Compañía', alias: ['CIA', 'COMPANIA', 'CIA PN', 'UNIDAD'] },
    { k: 'telefono', et: 'Teléfono', alias: ['TELEFONO', 'TELEFONO MOVIL', 'MOVIL', 'TLF', 'TELF'] },
    { k: 'email', et: 'Correo', alias: ['EMAIL CIVIL', 'EMAIL', 'CORREO', 'CORREO ELECTRONICO', 'E MAIL'] },
    { k: 'domicilio', et: 'Domicilio', alias: ['DOMICILIO', 'DIRECCION', 'DOMICILIO HABITUAL', 'RESIDENCIA 1', 'RESIDENCIA'] },
    { k: 'fecha_nacimiento', et: 'Fecha de nacimiento', alias: ['FECHA NACIMIENTO', 'FECHA DE NACIMIENTO', 'F NACIMIENTO'] },
    { k: 'fecha_ingreso', et: 'Fecha de ingreso en las FAS', alias: ['FECHA INGRESO', 'FECHA DE INGRESO', 'FECHA INGRESO FAS', 'INGRESO FAS'] },
    { k: 'fecha_incorporacion', et: 'Fecha de incorporación', alias: ['FECHA INCORPORACION', 'FECHA DE INCORPORACION'] },
    { k: 'fin_compromiso', et: 'Fin de compromiso', alias: ['FIN COMPROMISO', 'FECHA FIN COMPROMISO', 'FIN DE COMPROMISO'] },
    { k: 'escalafon', et: 'Nº escalafón', alias: ['NO ESCALAFON', 'ESCALAFON', 'N ESCALAFON'] },
  ];

  function detectarMapa(columnas) {
    const mapa = {};
    const usadas = new Set();
    for (const c of CAMPOS_PERSONA) {
      for (const a of c.alias) {
        const col = columnas.find(x => !usadas.has(x) && norm(x) === a);
        if (col) { mapa[c.k] = col; usadas.add(col); break; }
      }
    }
    return mapa;
  }

  /** Convierte una fila del Excel en una persona con todos los datos derivados. */
  function persona(reg, mapa) {
    const g = k => (mapa[k] ? String(reg[mapa[k]] || '').trim() : '');
    const p = {};
    for (const c of CAMPOS_PERSONA) p[c.k] = g(c.k);
    if (!p.apellidos) p.apellidos = [p.apellido1, p.apellido2].filter(Boolean).join(' ');
    if (!p.nombre && p.apellidos_nombre.includes(',')) {
      const [a, n] = p.apellidos_nombre.split(','); p.nombre = n.trim(); if (!p.apellidos) p.apellidos = a.trim();
    }
    if (!p.apellidos_nombre) p.apellidos_nombre = [p.apellidos, p.nombre].filter(Boolean).join(', ');
    p.nombre_completo = [p.nombre, p.apellidos].filter(Boolean).join(' ') || p.apellidos_nombre;
    if (!p.empleo && p.empleo_abrev) p.empleo = desabreviar(p.empleo_abrev) || p.empleo_abrev;
    // si la columna EMPLEO trae la abreviatura (SDO, CBO, SG1...), se escribe completo en los documentos
    if (p.empleo && !abreviar(p.empleo) && desabreviar(p.empleo)) {
      if (!p.empleo_abrev) p.empleo_abrev = p.empleo.toUpperCase();
      p.empleo = desabreviar(p.empleo);
    }
    // y si la abreviada trae el empleo completo, al revés
    if (p.empleo_abrev && abreviar(p.empleo_abrev)) p.empleo_abrev = abreviar(p.empleo_abrev);
    if (p.empleo) { const n = empleoNorm(p.empleo); if (BONITO[n] && p.empleo !== BONITO[n]) p.empleo = BONITO[n]; }
    if (!p.empleo_abrev && p.empleo) p.empleo_abrev = abreviar(p.empleo);
    p.dni = p.dni.replace(/\s+/g, '').toUpperCase();
    const sx = norm(p.sexo);
    p.trat = /^(F|MUJER|FEM|DA|DONA|DNA)/.test(sx) ? 'Dª' : 'D.';
    p.compania = /^\d+$/.test(p.cia) ? `${p.cia}ª COMPAÑÍA` : p.cia;
    p._busqueda = norm([p.apellidos_nombre, p.nombre_completo, p.dni, p.empleo_abrev, p.empleo, p.cia].join(' '));
    p._fila = reg;
    return p;
  }

  function buscarPersonas(personas, texto, max = 8) {
    const toks = norm(texto).split(' ').filter(Boolean);
    if (!toks.length) return [];
    const res = [];
    for (const p of personas) {
      if (toks.every(t => p._busqueda.includes(t))) {
        const ap = norm(p.apellidos);
        const puntos = (ap.startsWith(toks[0]) ? 2 : 0) + (norm(p.nombre).startsWith(toks[0]) ? 1 : 0) + (p.dni.startsWith(toks[0]) ? 3 : 0);
        res.push([puntos, p]);
      }
    }
    res.sort((a, b) => b[0] - a[0] || a[1].apellidos_nombre.localeCompare(b[1].apellidos_nombre, 'es'));
    return res.slice(0, max).map(x => x[1]);
  }

  // ------------------------------------------------------------------ datos de la unidad
  const AJUSTES_DEF = [
    { k: 'unidad', et: 'Nombre completo de la unidad', v: 'Regimiento de Infantería “Nápoles” 4 de Paracaidistas', grupo: 'Unidad' },
    { k: 'unidad_corta', et: 'Nombre corto', v: 'RIPAC “Nápoles” 4', grupo: 'Unidad' },
    { k: 'unidad_vacantes', et: 'Nombre en la papeleta de vacantes', v: 'RIPAC “NÁPOLES” 4', grupo: 'Unidad' },
    { k: 'uco', et: 'UCO (como figura en SIPERDEF)', v: 'RI 4/BPAC II', grupo: 'Unidad' },
    { k: 'base', et: 'Base y dirección', v: 'base “Príncipe”, en la carretera Torrejón-Ajalvir km 4,4', grupo: 'Unidad' },
    { k: 'localidad', et: 'Término municipal', v: 'Paracuellos de Jarama', grupo: 'Unidad' },
    { k: 'provincia', et: 'Provincia', v: 'Madrid', grupo: 'Unidad' },
    { k: 'localidad_firma', et: 'Lugar de firma de los escritos', v: 'Paracuellos de Jarama', grupo: 'Firma' },
    { k: 'jefe_unidad', et: 'Jefe de la unidad (para la hoja anual)', v: 'D. Javier Arrabal Flores', grupo: 'Firma' },
    { k: 'ejercicios', et: 'Ejercicios del año (uno por línea: FECHA | EJERCICIO)', tipo: 'area', grupo: 'Hoja anual', v: [
      '7FEB-8MAR | STEADFAST DART 2026',
      '10-16ABR | GGAA “LAURIA PARACA II/26”',
      '27ABR-15MAY | FASE O DAGUET 26 ARF (NIMES)',
      '18-29MAY | EX. LONE PARATROOPER (LEÓN)',
      '15-19JUN | SIMACA 01',
      '7-11SEP | RECOZO',
      '14-18SEP | SIMACA 02',
      '21-25SEP | EPCIS III',
      '28SEP-6OCT | GGAA LAURIA PRINCIPAL III-26 (CH)',
    ].join('\n') },
    { k: 'destinatario', et: 'Destinatario de instancias', v: 'EXCMO. SR. GENERAL DIRECTOR DE PERSONAL', grupo: 'Destinatarios' },
    { k: 'destinatario_sgp', et: 'Destinatario de excedencias', v: 'SR. SUBDIRECTOR DE GESTIÓN DE PERSONAL', grupo: 'Destinatarios' },
    { k: 'ciudad_destino', et: 'Ciudad del destinatario', v: 'MADRID', grupo: 'Destinatarios' },
    { k: 'cab_mp_1', et: 'Recuadro de solicitudes (línea 1)', v: 'EJÉRCITO DE TIERRA', grupo: 'Membretes' },
    { k: 'cab_mp_2', et: 'Recuadro de solicitudes (línea 2)', v: 'MANDO DE PERSONAL', grupo: 'Membretes' },
    { k: 'cab_ft_1', et: 'Recuadro de la hoja anual (línea 1)', v: 'EJÉRCITO DE TIERRA', grupo: 'Membretes' },
    { k: 'cab_ft_2', et: 'Recuadro de la hoja anual (línea 2)', v: 'FUERZA TERRESTRE', grupo: 'Membretes' },
    { k: 'cab_ft_3', et: 'Bajo el recuadro (línea 1)', v: 'RI “NÁPOLES” 4 DE PARACAIDISTAS', grupo: 'Membretes' },
    { k: 'cab_ft_4', et: 'Bajo el recuadro (línea 2)', v: 'DIVISIÓN SAN MARCIAL', grupo: 'Membretes' },
  ];
  const CLAVE_AJUSTES = 'mesa-doc.ajustes.v1';
  function leerLocal(clave, def) { try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function guardarLocal(clave, v) { try { localStorage.setItem(clave, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function ajustes() {
    const guard = leerLocal(CLAVE_AJUSTES, {});
    // un ajuste guardado vacío vuelve al valor por defecto (si no, el valor nuevo nunca llegaría)
    const a = {}; for (const d of AJUSTES_DEF) a[d.k] = guard[d.k] !== undefined && guard[d.k] !== '' ? guard[d.k] : d.v;
    return a;
  }
  const guardarAjustes = a => guardarLocal(CLAVE_AJUSTES, a);

  const nombreArchivo = (...partes) => partes.filter(Boolean).join('_').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 120);

  global.Comun = {
    sinAcentos, norm, esc, aFecha, iso, corta, larga, militar, hoy, diasEntre, sumarMeses, esLaborable, letras,
    abreviar, desabreviar, CAMPOS_PERSONA, detectarMapa, persona, buscarPersonas,
    AJUSTES_DEF, ajustes, guardarAjustes, leerLocal, guardarLocal, nombreArchivo, MESES,
  };
})(window);

/* S1 · PERSONAL — definición de los documentos.
 *
 * Cada documento dice: qué plantilla usa (s1/plantillas/<plantilla>.docx), qué campos pide,
 * qué datos de la persona necesita y qué comprobaciones hace antes de exportar.
 * Los datos de la persona (nombre, DNI, empleo...) y de la unidad se añaden solos.
 *
 * Tipos de campo: texto · area · fecha · numero · opciones (con libre:true admite escribir) · radio
 */
(function () {
  'use strict';
  const C = window.Comun;
  const docs = (window.MESA_DOCS = window.MESA_DOCS || []);
  const reg = d => docs.push(Object.assign({ seccion: 's1' }, d));

  const F = (id, et, extra) => Object.assign({ id, et, tipo: 'fecha' }, extra);
  const T = (id, et, extra) => Object.assign({ id, et, tipo: 'texto' }, extra);
  const A = (id, et, extra) => Object.assign({ id, et, tipo: 'area' }, extra);
  const N = (id, et, extra) => Object.assign({ id, et, tipo: 'numero' }, extra);
  const O = (id, et, opciones, extra) => Object.assign({ id, et, tipo: 'opciones', opciones }, extra);
  const firma = (extra) => F('fecha_firma', 'Fecha del escrito', Object.assign({ def: () => C.iso(C.hoy()), ancho: 'medio' }, extra));
  const destinatario = (def = 'destinatario') => [
    T('destinatario', 'Destinatario', { def: a => a[def], ancho: 'medio', grupo: 'Destinatario' }),
    T('ciudad_destino', 'Ciudad', { def: a => a.ciudad_destino, ancho: 'medio', grupo: 'Destinatario' }),
  ];
  const ESCALAS = ['MTM CGET ILG', 'CGET ILG', 'CGET ESB ILG', 'CGET en la especialidad de ILG', 'CGET ESB en la especialidad de ILG', 'CGET EOF INF', 'CGET EOF', 'CGET ESO'];
  const escala = (extra) => T('escala', 'Escala / especialidad', Object.assign({ persona: true, sugerencias: ESCALAS, ayuda: 'Ej.: MTM CGET ILG · CGET EOF INF. Añade la columna «ESCALA» al Excel y saldrá sola.' }, extra));

  /* ---------- comprobaciones reutilizables ---------- */
  function rango(ini, fin, avisos, nombre = 'la fecha final') {
    if (ini && fin && fin < ini) avisos.push({ tipo: 'error', txt: `La fecha de inicio es posterior a ${nombre}.` });
  }

  // ================================================================== LICENCIAS
  reg({
    id: 'licencia_asuntos_propios', plantilla: 'licencia_asuntos_propios',
    titulo: 'Licencia por asuntos propios', grupo: 'Licencias',
    resumen: 'Solicitud por tramos. Cuenta los días, comprueba el día laborable entre tramos y el máximo de 90 días.',
    norma: 'Orden DEF/253/2015, arts. 17.2, 18 y 24',
    campos: [
      T('localidad_disfrute', 'Localidad donde se disfruta', { oblig: true }),
      firma(),
      ...destinatario(),
    ],
    tablas: [{
      id: 'tramos', et: 'Tramos solicitados', filas: 7, max: 7,
      columnas: [F('ini', 'Inicio'), F('fin', 'Final'), { id: 'n', et: 'Días', tipo: 'calculado', calc: r => { const a = C.aFecha(r.ini), b = C.aFecha(r.fin); return a && b && b >= a ? C.diasEntre(a, b) + 1 : ''; } }],
    }],
    calcular(d, av) {
      const tr = d.tramos.map(t => ({ ...t, a: C.aFecha(t.ini), b: C.aFecha(t.fin) })).filter(t => t.a || t.b);
      let total = 0;
      tr.sort((x, y) => (x.a || 0) - (y.a || 0));
      d.tramos = tr.map(t => {
        if (t.a && t.b && t.b < t.a) av.push({ tipo: 'error', txt: `Tramo ${C.corta(t.a)}: el final es anterior al inicio.` });
        const n = t.a && t.b && t.b >= t.a ? C.diasEntre(t.a, t.b) + 1 : '';
        if (n) total += n;
        return { ini: C.corta(t.a), fin: C.corta(t.b), n: String(n) };
      });
      for (let i = 1; i < tr.length; i++) {
        const prev = tr[i - 1].b, cur = tr[i].a; if (!prev || !cur) continue;
        if (cur <= prev) { av.push({ tipo: 'error', txt: `Los tramos ${i} y ${i + 1} se solapan.` }); continue; }
        let laborable = false;
        for (let x = new Date(prev.getTime() + 864e5); x < cur; x = new Date(x.getTime() + 864e5)) if (C.esLaborable(x)) { laborable = true; break; }
        if (!laborable) av.push({ tipo: 'error', txt: `Entre el tramo ${i} y el ${i + 1} no hay ningún día laborable (nota 3). Revisa también los festivos.` });
      }
      d.total_dias = total ? String(total) : '';
      d.total_tramos = tr.length ? String(tr.length) : '';
      const f = C.aFecha(d.fecha_firma);
      if (f && tr.some(t => t.b && t.b > C.sumarMeses(f, 9))) av.push({ tipo: 'aviso', txt: 'Hay tramos a más de nueve meses vista (nota 1).' });
      if (total > 90) av.push({ tipo: 'error', txt: `Suma ${total} días: el máximo son 90 días naturales cada dos años de servicio (art. 18.1).` });
      else if (total) av.push({ tipo: 'info', txt: `Total ${total} días en ${tr.length} tramo(s). Recuerda: máximo 90 días cada 2 años y sin retribución (art. 18).` });
      if (!tr.length) av.push({ tipo: 'falta', txt: 'Añade al menos un tramo.' });
    },
  });

  function licenciaEstudios(tipo) {
    const horas = tipo === 'horas';
    reg({
      id: 'licencia_estudios_' + tipo, plantilla: 'licencia_estudios_' + tipo,
      titulo: `Licencia por estudios (${horas ? 'horas' : 'días'})`, grupo: 'Licencias',
      resumen: horas ? 'Hasta 40 horas hábiles, con retribuciones básicas.' : 'Hasta 3 meses (90 días naturales), sin retribución. Calcula los días.',
      norma: 'Orden DEF/253/2015, arts. 19 y 24.2',
      campos: [
        T('estudios', 'Estudios', { oblig: true, ayuda: 'Adjuntar la matrícula o certificado del centro (art. 24.2).' }),
        T('localidad_disfrute', 'Localidad', { oblig: true, ancho: 'medio' }),
        horas ? N('total', 'Horas', { oblig: true, ancho: 'medio' }) : { id: 'total', et: 'Días', tipo: 'calculado', ancho: 'medio' },
        F('fecha_ini', 'Fecha de inicio', { oblig: true, ancho: 'medio' }),
        F('fecha_fin', 'Fecha final', { oblig: true, ancho: 'medio' }),
        firma(),
        ...destinatario(),
      ],
      calcular(d, av) {
        const a = C.aFecha(d.fecha_ini), b = C.aFecha(d.fecha_fin);
        rango(a, b, av);
        if (a && b && a.getFullYear() !== b.getFullYear()) av.push({ tipo: 'error', txt: 'Solo una licencia por estudios en el año natural: inicio y fin deben caer en el mismo año (art. 19.3).' });
        if (!horas) {
          const n = a && b && b >= a ? C.diasEntre(a, b) + 1 : 0;
          d.total = n ? String(n) : '';
          if (n > 90) av.push({ tipo: 'error', txt: `Son ${n} días: el máximo es de tres meses o 90 días naturales (art. 19.2.b).` });
        } else if (+d.total > 40) av.push({ tipo: 'error', txt: 'El máximo son cuarenta horas hábiles (art. 19.2.a).' });
      },
    });
  }
  licenciaEstudios('dias');
  licenciaEstudios('horas');

  // ================================================================== CONCILIACIÓN
  const MOTIVOS = [
    'por la guarda legal de un hijo menor de 12 años',
    'por la guarda legal de hijos menores de 12 años',
    'por el cuidado directo de un familiar hasta el segundo grado que no pueda valerse por sí mismo',
    'por el cuidado de un familiar de primer grado por enfermedad muy grave',
    'por el cuidado de un hijo menor afectado por cáncer u otra enfermedad grave',
    'por ser víctima de violencia de género',
    'por ser víctima del terrorismo',
  ];
  const conciliacion = (id, titulo, resumen, extra) => reg(Object.assign({
    id, plantilla: id, titulo, grupo: 'Conciliación', resumen,
    norma: 'Orden DEF/253/2015, mod. por Orden DEF/112/2019',
  }, extra));

  conciliacion('solicitud_flexibilidad_horaria', 'Flexibilidad horaria', 'Solicitud de flexibilidad de jornada con membrete del Mando de Personal.', {
    campos: [
      escala({ def: '', ayuda: 'Como debe leerse tras el empleo. Ej.: CGET ESB en la especialidad de ILG' }),
      O('motivo', 'Motivo', MOTIVOS, { libre: true, oblig: true }),
      F('fecha_ini', 'Fecha de inicio', { oblig: true, ancho: 'medio' }),
      F('fecha_fin', 'Fecha fin prevista', { ancho: 'medio', ayuda: 'Si se deja vacía se usa el texto de abajo.' }),
      T('fin_texto', 'Si no hay fecha fin', { def: 'mientras se mantengan las circunstancias que la motivan' }),
      A('periodo', 'Periodo horario solicitado', { oblig: true, def: 'de treinta minutos antes de fin de actividades, recuperándola treinta minutos antes de inicio de actividades' }),
      firma(),
    ],
    calcular(d, av) {
      rango(C.aFecha(d.fecha_ini), C.aFecha(d.fecha_fin), av);
      if (!d.fecha_fin) d.fecha_fin_larga = d.fin_texto;
    },
  });

  conciliacion('solicitud_reduccion_jornada', 'Reducción de jornada', 'Anexo I · Modelo de solicitud de reducción de jornada diaria.', {
    norma: 'Orden DEF/253/2015, arts. 9 a 16 bis y 22',
    campos: [
      escala({ ayuda: 'Ej.: CGET en la especialidad de ILG' }),
      O('motivo', 'Motivo', MOTIVOS, { libre: true, oblig: true }),
      F('fecha_ini', 'Inicio de la reducción', { oblig: true, ancho: 'medio' }),
      F('fecha_fin', 'Fecha de finalización', { oblig: true, ancho: 'medio' }),
      A('periodo', 'Periodo horario solicitado', { oblig: true, def: 'de una hora después de inicio de actividades' }),
      F('fecha_nac_menor', 'Nacimiento del menor', { ancho: 'medio', ayuda: 'Solo si es por guarda legal. Si se deja vacía, el apartado e) desaparece.' }),
      firma(),
    ],
    calcular(d, av) {
      rango(C.aFecha(d.fecha_ini), C.aFecha(d.fecha_fin), av);
      const n = C.aFecha(d.fecha_nac_menor), i = C.aFecha(d.fecha_ini);
      if (/guarda legal/i.test(d.motivo) && !n) av.push({ tipo: 'aviso', txt: 'Por guarda legal se suele indicar la fecha de nacimiento del menor (apartado e).' });
      if (n && i && /12 años/.test(d.motivo) && C.sumarMeses(n, 144) <= i) av.push({ tipo: 'error', txt: 'El menor ya habrá cumplido 12 años al inicio de la reducción.' });
    },
  });

  // ================================================================== BAJAS
  reg({
    id: 'anexo_ii_baja_temporal', plantilla: 'anexo_ii_baja_temporal',
    titulo: 'Parte de baja temporal para el servicio', grupo: 'Bajas', resumen: 'Anexo II. Marca la contingencia y avisa si pasa de 15 días.',
    norma: 'Instrucción de bajas temporales para el servicio, Anexo II',
    campos: [
      escala({ ayuda: 'Ej.: MTM CGET ILG' }),
      F('fecha_asistencia', 'Día de la asistencia médica', { oblig: true, ancho: 'medio' }),
      N('dias_baja', 'Días de baja (aprox.)', { oblig: true, ancho: 'medio' }),
      T('medico', 'Médico que le asistió', { oblig: true }),
      O('entidad_medica', 'Perteneciente a', ['ISFAS', 'ADESLAS', 'ASISA', 'DKV', 'Sanidad Militar', 'el Servicio Público de Salud'], { libre: true, oblig: true, ancho: 'medio' }),
      T('cie', 'Código CIE-9-MC', { oblig: true, ancho: 'medio' }),
      A('domicilio_habitual', 'Domicilio habitual (con CP y teléfono)', { oblig: true, def: (a, p) => [p.domicilio, p.telefono && 'teléfono ' + p.telefono].filter(Boolean).join(', ') }),
      { id: 'contingencia', et: 'Contingencia', tipo: 'radio', def: 'comun', opciones: [{ v: 'comun', et: 'Común' }, { v: 'profesional', et: 'Profesional' }, { v: 'resto', et: 'Resto de situaciones (ap. décimo.3)' }] },
      A('hechos', 'Descripción de los hechos', { visible: d => d.contingencia === 'profesional', oblig: true }),
      A('residencia_baja', 'Residencia durante la baja (dirección, CP, teléfono, correo)', { oblig: true, def: 'el mismo domicilio habitual' }),
      firma(),
    ],
    persona: ['domicilio', 'telefono', 'cia'],
    calcular(d, av) {
      d.x_comun = d.contingencia === 'comun' ? 'X' : '';
      d.x_profesional = d.contingencia === 'profesional' ? 'X' : '';
      d.x_resto = d.contingencia === 'resto' ? 'X' : '';
      d.hechos_profesional = d.contingencia === 'profesional' && d.hechos ? ': ' + d.hechos : '';
      if (+d.dias_baja > 15) av.push({ tipo: 'aviso', txt: 'El modelo prevé un máximo de 15 días por parte.' });
      if (!d.compania) av.push({ tipo: 'falta', txt: 'Falta la compañía (columna CIA del Excel).' });
    },
  });

  // ================================================================== HOJA ANUAL
  // Los ejercicios de la unidad vienen ya puestos (se editan en Ajustes) y se desmarcan
  // los que no ha hecho cada uno. Lo personal se añade aparte y todo se ordena por fecha.
  const MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
  function claveFecha(txt) {
    const t = C.sinAcentos(String(txt || '')).toUpperCase();
    const dia = t.match(/\d{1,2}/), mes = t.match(/ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC/);
    return dia && mes ? MESES[mes[0]] * 100 + +dia[0] : 9999;
  }
  function ejerciciosDe(texto) {
    return String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const [f, ...r] = l.split('|');
      const fecha = r.length ? f.trim() : '', info = (r.length ? r.join('|') : f).trim();
      return { clave: C.norm(fecha + ' ' + info), fecha, texto: info };
    });
  }
  function hojaAnual(larga) {
    const filas = larga ? 18 : 7, mandos = larga ? 6 : 3;
    const otra = larga ? 'hoja_anual_servicios_corta' : 'hoja_anual_servicios_larga';
    reg({
      id: 'hoja_anual_servicios_' + (larga ? 'larga' : 'corta'), plantilla: 'hoja_anual_servicios_' + (larga ? 'larga' : 'corta'),
      estado: 'hoja_anual', // corta y larga comparten lo rellenado: se puede cambiar de una a otra sin perder nada
      titulo: `Hoja anual de servicios (${larga ? 'larga · 2 hojas' : 'corta · 1 hoja'})`, grupo: 'Hoja anual',
      resumen: `Anexo I. Trae ya los ejercicios del año: solo hay que quitar los que no ha hecho. ${filas} filas, ${mandos} de mandos.`,
      norma: 'IT de la hoja anual de servicios · Anexo I',
      lote: true,
      campos: [
        N('anio', 'Año', { def: () => String(new Date().getFullYear()), ancho: 'medio', oblig: true }),
        { id: 'datos_admin', et: 'Datos administrativos', tipo: 'radio', def: 'correcto', opciones: [{ v: 'correcto', et: 'Comprobados y correctos' }, { v: 'errores', et: 'Con errores (nota de reparos)' }] },
        T('puesto_inicio', 'Puesto táctico al empezar el año', { ayuda: 'Ej.: TIRADOR DE LA 1ª SECCIÓN' }),
        T('puesto_fin', 'Puesto táctico al acabar el año', { ayuda: 'Vacío = el mismo que al empezar.' }),
        A('bio_inicio_libre', 'Otro texto para el 01ENE (opcional)', { ayuda: 'Si se rellena, sustituye a «COMIENZA EL AÑO EN LA MISMA SITUACIÓN…»' }),
        F('fecha_interesado', 'Fecha del interesado', { def: a => `${new Date().getFullYear()}-12-31`, ancho: 'medio' }),
        F('fecha_jefe', 'Fecha del jefe de unidad', { def: a => `${new Date().getFullYear()}-12-31`, ancho: 'medio' }),
        T('jefe_unidad', 'Jefe de la unidad (firma)', { def: a => a.jefe_unidad, ayuda: 'Se guarda en Ajustes para no repetirlo.' }),
        { id: 'ejercicios_fuera', et: 'Ejercicios de la unidad', tipo: 'checklist', grupo: 'Ejercicios del año', def: [],
          opciones: a => ejerciciosDe(a.ejercicios).map(e => ({ v: e.clave, et: e.texto, sub: e.fecha })),
          ayuda: 'Quita la marca de los que no ha hecho. La lista se cambia en Ajustes (engranaje) y vale para todos los años.' },
      ],
      tablas: [
        { id: 'bio', et: 'Otras vicisitudes (cursos, comisiones, bajas…)', filas, max: filas, inicio: 1, ayuda: 'Se mezclan con los ejercicios y se ordenan por fecha.',
          columnas: [T('fecha', 'Fecha', { ph: '7-11SEP' }), T('texto', 'Información biográfica', { ph: 'CURSO BÁSICO PARACAIDISTA' })] },
        { id: 'mandos', et: 'Mandos ejercidos', filas: mandos, max: mandos,
          columnas: [T('empleo_m', 'Empleo'), T('unidad_m', 'Tipo de unidad'), T('ti', 'Tit. inicio'), T('tf', 'Tit. fin'), T('ii', 'Int. inicio'), T('if', 'Int. fin'), T('ai', 'Acc. inicio'), T('af', 'Acc. fin')] },
      ],
      calcular(d, av) {
        d.x_correcto = d.datos_admin === 'correcto' ? 'X' : '';
        d.x_errores = d.datos_admin === 'errores' ? 'X' : '';
        const pi = (d.puesto_inicio || '').trim(), pf = (d.puesto_fin || '').trim() || pi;
        d.bio_inicio = d.bio_inicio_libre || 'COMIENZA EL AÑO EN LA MISMA SITUACIÓN QUE EL ANTERIOR COMO ' + (pi || '…');
        d.bio_fin = 'SIN MÁS VICISITUDES FINALIZA EL AÑO COMO ' + (pf || '…');
        if (!pi && !d.bio_inicio_libre) av.push({ tipo: 'falta', txt: 'Falta el puesto táctico.' });
        if (!d.jefe_unidad) av.push({ tipo: 'falta', txt: 'Falta el nombre del jefe de la unidad (Ajustes).' });
        const fuera = new Set(d.ejercicios_fuera || []);
        const ejercicios = ejerciciosDe(d.ejercicios).filter(e => !fuera.has(e.clave)).map(e => ({ fecha: e.fecha, texto: e.texto }));
        const propias = d.bio.filter(r => r.fecha || r.texto);
        // orden cronológico estable (lo que no tenga fecha reconocible va al final, en su orden)
        d.bio = [...ejercicios, ...propias].map((r, i) => [claveFecha(r.fecha), i, r]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
        const n = d.bio.length;
        if (n > filas) av.push({ tipo: 'error', txt: `Hay ${n} vicisitudes y en la ${larga ? 'larga' : 'corta'} caben ${filas}. ${larga ? 'Quita alguna o agrupa varias en una fila.' : 'Pasa a la versión larga (no se pierde nada).'}`, enlace: larga ? null : '#/s1/' + otra, textoEnlace: 'Pasar a la larga' });
        else av.push({ tipo: 'info', txt: `${n} de ${filas} filas biográficas usadas.` + (!larga ? '' : n <= 7 ? ' Cabe en la versión corta (1 hoja).' : ''), enlace: larga && n <= 7 ? '#/s1/' + otra : null, textoEnlace: 'Pasar a la corta' });
        d._filas_bio = filas;
      },
    });
  }
  hojaAnual(false);
  hojaAnual(true);

  // ================================================================== DESTINOS
  reg({
    id: 'papeleta_solicitud_vacantes', plantilla: 'papeleta_solicitud_vacantes',
    titulo: 'Papeleta de solicitud de vacantes', grupo: 'Destinos',
    resumen: 'Hasta 28 vacantes por papeleta. Una papeleta por resolución.',
    norma: 'RD 456/2011, Reglamento de destinos (mod. RD 484/2025)',
    campos: [
      T('resolucion_comun', 'Nº resolución - Nº BOD', { ayuda: 'Una papeleta por resolución: se copia en todas las filas.', ph: '562/10239/24 - Nº 129' }),
      T('uco', 'UCO', { def: a => a.uco, ancho: 'medio' }),
      firma({ ancho: 'medio' }),
      A('observaciones', 'Observaciones del solicitante', { ayuda: 'Si la vacante exige un curso, indica aquí que te comprometes a realizarlo (obs. 4).' }),
    ],
    persona: ['cia'],
    tablas: [{
      id: 'vacantes', et: 'Vacantes por orden de preferencia', filas: 28, max: 28,
      columnas: [T('num', 'Nº vacante'), T('unidad_v', 'Unidad, centro u organismo'), O('caracter', 'V/A', ['V', 'A']), T('obs', 'Obs. vacante (5)')],
    }],
    calcular(d, av) {
      d.vacantes = d.vacantes.filter(v => v.num || v.unidad_v).map((v, i) => ({ ...v, orden: String(i + 1), resolucion: d.resolucion_comun || '' }));
      if (!d.vacantes.length) av.push({ tipo: 'falta', txt: 'Añade al menos una vacante.' });
      if (!d.resolucion_comun) av.push({ tipo: 'falta', txt: 'Falta el nº de resolución y BOD.' });
      av.push({ tipo: 'info', txt: 'Antes de entregarla: informar a los jefes de pelotón, sección y compañía, y llevarla en persona a S-1 (obs. 2).' });
    },
  });

  // ================================================================== RECOMPENSAS Y DISTINTIVOS
  reg({
    id: 'instancia_distintivo_saltos', plantilla: 'instancia_distintivo_saltos',
    titulo: 'Instancia de distintivo de saltos', grupo: 'Distintivos',
    resumen: 'Pide el distintivo y su anotación en el apartado «DI» de SIPERDEF. Escribe el número en letra.',
    norma: 'Normativa de distintivos de saltos · SIPERDEF (datos SX y DI)',
    campos: [
      escala({ ayuda: 'Ej.: CGET EOF INF' }),
      O('saltos', 'Número de saltos', ['25', '50', '75', '100', '150', '200', '250', '300', '400', '500'], { libre: true, def: '25', ancho: 'medio' }),
      firma({ ancho: 'medio' }),
      ...destinatario(),
    ],
    calcular(d, av) {
      d.saltos_letra = C.letras(d.saltos);
      if (!/^\d+$/.test(String(d.saltos || ''))) av.push({ tipo: 'error', txt: 'El número de saltos debe ser un número.' });
    },
  });

  // ================================================================== SITUACIONES
  reg({
    id: 'solicitud_excedencia_voluntaria', plantilla: 'solicitud_excedencia_voluntaria',
    titulo: 'Excedencia voluntaria por interés particular', grupo: 'Situaciones administrativas',
    resumen: 'Instancia con el historial (ingreso, empleo, destino) y la residencia durante la excedencia.',
    norma: 'Ley 39/2007, de la carrera militar, art. 110.1.b) y 110.3',
    campos: [
      escala({ ayuda: 'Ej.: MTM CGET ILG' }),
      F('fecha_ingreso', 'Ingreso en las FAS', { oblig: true, ancho: 'medio', grupo: 'Ingreso' }),
      T('res_ingreso', 'Resolución de ingreso', { ancho: 'medio', grupo: 'Ingreso', ph: '551/09243/09' }),
      T('bod_ingreso', 'BOD núm.', { ancho: 'medio', grupo: 'Ingreso' }),
      F('fecha_bod_ingreso', 'Fecha del BOD', { ancho: 'medio', grupo: 'Ingreso' }),
      T('empleo_adquirido', 'Empleo adquirido', { def: 'Soldado', ancho: 'medio', grupo: 'Empleo' }),
      F('fecha_empleo', 'Con fecha', { ancho: 'medio', grupo: 'Empleo' }),
      T('res_empleo', 'Resolución', { ancho: 'medio', grupo: 'Empleo' }),
      T('bod_empleo', 'BOD núm.', { ancho: 'medio', grupo: 'Empleo' }),
      F('fecha_bod_empleo', 'Fecha del BOD', { ancho: 'medio', grupo: 'Empleo' }),
      O('tipo_compromiso', 'Compromiso', ['larga duración', 'inicial'], { def: 'larga duración', ancho: 'medio', grupo: 'Compromiso y destino' }),
      F('fin_compromiso', 'Finaliza el', { ancho: 'medio', grupo: 'Compromiso y destino' }),
      T('res_destino', 'Resolución de destino', { ancho: 'medio', grupo: 'Compromiso y destino' }),
      T('bod_destino', 'BOD núm.', { ancho: 'medio', grupo: 'Compromiso y destino' }),
      F('fecha_bod_destino', 'Fecha del BOD', { ancho: 'medio', grupo: 'Compromiso y destino' }),
      A('domicilio', 'Residencia durante la excedencia', { oblig: true, persona: true, grupo: 'Residencia' }),
      T('telefono', 'Teléfono', { persona: true, ancho: 'medio', grupo: 'Residencia' }),
      F('fecha_efectos', 'A partir del', { oblig: true, ancho: 'medio', grupo: 'Residencia' }),
      firma({ grupo: 'Residencia' }),
      ...destinatario('destinatario_sgp'),
    ],
    calcular(d, av) {
      d.empleo_adquirido = d.empleo_adquirido || '';
      if (d.tipo_compromiso === 'inicial') av.push({ tipo: 'error', txt: 'Solo pueden pedirla los militares de carrera y la tropa con compromiso de larga duración (art. 110.3).' });
      const f = C.aFecha(d.fecha_firma), e = C.aFecha(d.fecha_efectos);
      if (f && e && e < f) av.push({ tipo: 'error', txt: 'La fecha de efectos es anterior a la del escrito.' });
      av.push({ tipo: 'info', txt: 'Requisitos (art. 110.3): preaviso reglamentario, no estar designado para operaciones en el exterior, sin procedimiento disciplinario en curso y con el tiempo mínimo de servicios cumplido.' });
    },
  });

  reg({
    id: 'declaracion_jurada_compatibilidad', plantilla: 'declaracion_jurada_compatibilidad',
    titulo: 'Declaración jurada (compatibilidad)', grupo: 'Situaciones administrativas',
    resumen: 'Se adjunta a la solicitud de compatibilidad para un segundo trabajo.',
    norma: 'Ley 53/1984 de incompatibilidades · Guía Burros: compatibilidad laboral',
    campos: [escala({ ayuda: 'Ej.: CGET ILG' }), firma()],
  });
})();

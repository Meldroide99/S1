/* S2 — definición de los documentos.
 *
 * Documentos de tipo LISTA (lista: {...}): un único documento con muchas personas
 * (una fila cada una). Se eligen del Excel de personal de golpe, se pueden corregir o
 * añadir filas a mano, y salen en Excel (plantilla .xlsx), Word y PDF. En Word y PDF la
 * lista se reparte en hojas A4 con la cabecera repetida en cada una.
 *
 * Para añadir otro: copia el bloque, pon su .docx (y .xlsx si sale en Excel) en
 * s2/plantillas/ y ejecuta python3 tools/empaquetar.py
 */
(function () {
  'use strict';
  const C = window.Comun;
  const D = window.MESA_DOCS = window.MESA_DOCS || [];

  D.push({
    id: 'formulario_clearance', seccion: 's2', grupo: 'Seguridad · HPS',
    titulo: 'Formulario Clearance (relación HPS)',
    resumen: 'Lista de personal con DNI, apellidos, nombre, grado y caducidad de la HPS. Marca a todos de golpe y sácalo en Excel, Word o PDF.',
    norma: 'Plantilla S2 · Formulario Clearance',
    plantilla: 'formulario_clearance', xlsx: 'formulario_clearance.xlsx', archivo: 'Clearance',
    lista: {
      id: 'filas',
      columnas: [
        { id: 'dni', et: 'DNI', de: p => p.dni, ancho: 92 },
        { id: 'apellido1', et: 'Apellido 1', de: p => p.apellido1 },
        { id: 'apellido2', et: 'Apellido 2', de: p => p.apellido2 },
        { id: 'nombre', et: 'Nombre', de: p => p.nombre },
        { id: 'grado', et: 'Grado', de: (p, o) => (o.grado_de === 'empleo' ? (p.empleo_abrev || p.empleo) : p.hps), ancho: 150 },
        { id: 'caducidad', et: 'Caducidad', tipo: 'fecha', de: p => p.validez_hps, ancho: 92 },
      ],
      // comprobaciones de la lista (además de filas vacías y DNI repetidos)
      revisar(filas, av) {
        const hoy = C.hoy(); const pronto = C.sumarMeses(hoy, 6);
        const sinGrado = filas.filter(f => !f.grado).length, sinCad = filas.filter(f => !f.caducidad).length;
        if (sinGrado) av.push({ tipo: 'aviso', txt: `${sinGrado} ${sinGrado === 1 ? 'fila' : 'filas'} sin GRADO: el Excel no trae la HPS de esa gente. Escríbelo en la tabla o déjalo en blanco.` });
        if (sinCad) av.push({ tipo: 'aviso', txt: `${sinCad} ${sinCad === 1 ? 'fila' : 'filas'} sin CADUCIDAD.` });
        const nom = f => [f.apellido1, f.nombre].filter(Boolean).join(', ') || f.dni;
        const cad = filas.filter(f => { const d = C.aFecha(f.caducidad); return d && d < hoy; });
        if (cad.length) av.push({ tipo: 'error', txt: `HPS caducada (${cad.length}): ${cad.slice(0, 6).map(nom).join('; ')}${cad.length > 6 ? '…' : '.'}` });
        const pr = filas.filter(f => { const d = C.aFecha(f.caducidad); return d && d >= hoy && d < pronto; });
        if (pr.length) av.push({ tipo: 'info', txt: `Caduca en menos de 6 meses (${pr.length}): ${pr.slice(0, 6).map(nom).join('; ')}${pr.length > 6 ? '…' : '.'}` });
      },
    },
    campos: [
      { id: 'titulo', et: 'Título encima de la tabla (opcional)', ph: 'Ej.: RELACIÓN DE PERSONAL — EJERCICIO …', grupo: 'Opciones de la lista' },
      { id: 'grado_de', et: 'Qué poner en GRADO y CADUCIDAD', tipo: 'radio', def: 'hps', grupo: 'Opciones de la lista',
        opciones: [{ v: 'hps', et: 'La HPS del Excel (grado y validez)' }, { v: 'empleo', et: 'El empleo (la caducidad sigue siendo la de la HPS)' }] },
      { id: 'orden', et: 'Orden de la lista', tipo: 'opciones', def: 'Apellidos', grupo: 'Opciones de la lista',
        opciones: ['Apellidos', 'Compañía y apellidos', 'Empleo (de mayor a menor)', 'Como están en el Excel', 'Como las voy marcando'] },
      { id: 'vacias', et: 'Filas en blanco al final', tipo: 'numero', def: '0', ancho: 'medio', grupo: 'Opciones de la lista',
        ayuda: 'Para completar a mano después de imprimir.' },
    ],
  });
})();

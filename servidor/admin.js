#!/usr/bin/env node
/* Herramientas de administración del servidor (se usan por SSH en la Raspberry).
 *
 *   node servidor/admin.js maestro <usuario>        crea (o cambia la contraseña de) un usuario maestro
 *   node servidor/admin.js clave <usuario>          cambia la contraseña de cualquier usuario
 *   node servidor/admin.js usuarios                 lista los usuarios
 *   node servidor/admin.js importar <archivo.json>  carga el programa desde el .json de la carpeta compartida
 *   node servidor/admin.js exportar <archivo.json>  saca una copia completa
 *
 * El resto de usuarios (lectores y editores) se crean más cómodo desde la página, entrando como maestro.
 */
'use strict';
const fs = require('fs');
const readline = require('readline');
const A = require('./almacen');

function preguntarOculto(texto) {
  return new Promise(ok => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(texto)) process.stdout.write(s); else process.stdout.write('*'.repeat(s.replace(/\r?\n/g, '').length ? 1 : 0)); };
    rl.question(texto, r => { rl.close(); process.stdout.write('\n'); ok(r); });
  });
}
async function pedirClave() {
  const a = await preguntarOculto('Contraseña (mínimo 8): ');
  if (a.length < 8) { console.error('Demasiado corta.'); process.exit(1); }
  const b = await preguntarOculto('Repite la contraseña: ');
  if (a !== b) { console.error('No coinciden.'); process.exit(1); }
  return a;
}

(async () => {
  const [orden, arg] = process.argv.slice(2);
  const usu = A.leerJSON('usuarios.json', []);
  if (orden === 'maestro' || orden === 'clave') {
    const nombre = String(arg || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,32}$/.test(nombre)) { console.error('Indica el usuario: letras sin acentos, números, punto o guion.'); process.exit(1); }
    let u = usu.find(x => x.usuario === nombre);
    if (orden === 'clave' && !u) { console.error('Ese usuario no existe.'); process.exit(1); }
    const clave = await pedirClave();
    if (!u) { u = { usuario: nombre, creado: new Date().toISOString(), clubs: [] }; usu.push(u); }
    if (orden === 'maestro') u.rol = 'maestro';
    Object.assign(u, A.hashClave(clave));
    A.escribirJSON('usuarios.json', usu);
    console.log(`Hecho: ${nombre} (${u.rol}).`);
  } else if (orden === 'usuarios') {
    if (!usu.length) console.log('No hay usuarios.');
    for (const u of usu) console.log(`${u.usuario.padEnd(20)} ${u.rol.padEnd(8)} ${(u.clubs || []).join(', ')}`);
  } else if (orden === 'importar') {
    if (!arg) { console.error('Indica el archivo .json.'); process.exit(1); }
    const previo = A.leerJSON('moral.json', null);
    const m = A.importar(JSON.parse(fs.readFileSync(arg, 'utf8')), previo);
    A.escribirJSON('moral.json', m);
    console.log(`Importado: ${m.apartados.length} apartados y ${m.eventos.length} actividades. Datos en ${A.DATOS}`);
  } else if (orden === 'exportar') {
    if (!arg) { console.error('Indica el archivo de salida.'); process.exit(1); }
    fs.writeFileSync(arg, JSON.stringify(A.leerJSON('moral.json', A.moralVacio()), null, 1));
    console.log('Copia guardada en ' + arg);
  } else {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n\/\* ?/, ''));
  }
})();

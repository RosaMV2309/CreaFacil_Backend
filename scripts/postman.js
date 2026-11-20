// Ejecuta la colección de Postman con newman contra el servidor local (npm run test:postman).
//
// La contraseña de la administradora NO está en los archivos de entorno versionados: este script
// lee ADMIN_EMAIL y ADMIN_PASSWORD del .env (o del entorno), crea una copia temporal del entorno
// «CreaFácil · local» con esos valores en la carpeta temporal del sistema y la borra al terminar.
// Así la contraseña no aparece en la línea de comandos, en el historial ni en el repositorio.
// Los argumentos extra se pasan a newman (p. ej. `npm run test:postman -- --bail`).
//
// Al terminar newman (pase o falle) ejecuta `npm run db:limpiar-pruebas`, que borra los clientes
// de prueba del dominio reservado @newman.creafacil.test. El código de salida es SIEMPRE el de
// newman: si la limpieza falla solo se muestra un aviso.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

config({ quiet: true });

const NEWMAN = 'newman@6.2.3';
const COLECCION = 'postman/CreaFacil.postman_collection.json';
const ENTORNO = 'postman/CreaFacil.local.postman_environment.json';
// resolve() quita la barra final: en Windows, «\"» dentro de las comillas escaparía la comilla.
const raizRepositorio = resolve(fileURLToPath(new URL('..', import.meta.url)));

const entorno = JSON.parse(readFileSync(ENTORNO, 'utf8'));
const valores = { adminEmail: process.env.ADMIN_EMAIL, adminPassword: process.env.ADMIN_PASSWORD };
for (const variable of entorno.values) {
  const valor = valores[variable.key];
  if (valor !== undefined && valor !== '') {
    variable.value = valor;
  }
}
if (!valores.adminPassword) {
  console.warn(
    'Aviso: no hay ADMIN_PASSWORD en el .env; la petición «Inicio de sesión de la administradora» fallará.',
  );
}

// En Windows npx y npm son .cmd y necesitan la shell; las rutas van entre comillas por si hay espacios.
const enWindows = process.platform === 'win32';
const ruta = (valor) => (enWindows ? `"${valor}"` : valor);

/** Borra los datos de prueba de newman. Nunca cambia el código de salida de newman. */
function limpiarDatosDePrueba() {
  console.info('\nLimpiando los datos de prueba de newman (npm run db:limpiar-pruebas)…');
  const limpieza = spawnSync('npm', ['run', '--silent', 'db:limpiar-pruebas'], {
    stdio: 'inherit',
    shell: enWindows,
  });
  if (limpieza.status !== 0) {
    console.warn(
      'Aviso: la limpieza de los datos de prueba falló; ejecútala a mano con `npm run db:limpiar-pruebas`.',
    );
  }
}

const carpeta = mkdtempSync(join(tmpdir(), 'creafacil-newman-'));
const entornoTemporal = join(carpeta, 'entorno.json');
let codigo;
try {
  writeFileSync(entornoTemporal, JSON.stringify(entorno), { encoding: 'utf8', mode: 0o600 });
  const resultado = spawnSync(
    'npx',
    [
      '--yes',
      NEWMAN,
      'run',
      ruta(COLECCION),
      '-e',
      ruta(entornoTemporal),
      // Las subidas de fotos usan rutas relativas a la raíz del repositorio (postman/fixtures/…).
      '--working-dir',
      ruta(raizRepositorio),
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit', shell: enWindows },
  );
  codigo = resultado.status ?? 1;
} finally {
  rmSync(carpeta, { recursive: true, force: true });
  limpiarDatosDePrueba();
}
process.exit(codigo ?? 1);

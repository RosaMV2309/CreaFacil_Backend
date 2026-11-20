/**
 * `npm run db:limpiar-pruebas` — borra los clientes de prueba de newman de la BD del .env.
 * Toda la lógica y las protecciones están en `limpieza-datos-prueba.ts` (con pruebas en Vitest);
 * este archivo solo conecta la línea de comandos, el .env y la consola.
 */
import { config } from 'dotenv';

import { crearAlmacenamientoDisco } from '../src/shared/almacenamiento/disco.js';
import { crearClientePrisma } from '../src/shared/database/prisma.js';
import { ejecutarCli } from './limpieza-datos-prueba.js';

config({ quiet: true });

process.exitCode = await ejecutarCli(process.argv.slice(2), process.env, {
  crearPrisma: crearClientePrisma,
  // Las fotos de los servicios de prueba se borran de la misma carpeta que usa la API.
  crearAlmacenamiento: (entorno) =>
    crearAlmacenamientoDisco({
      carpeta: entorno.UPLOADS_DIR?.trim() || 'uploads',
      urlBase: 'http://localhost',
    }),
  escribir: (linea) => {
    console.info(linea);
  },
  escribirError: (linea) => {
    console.error(linea);
  },
});

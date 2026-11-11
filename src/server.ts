import { crearApp } from './app.js';
import { cargarEnv } from './config/env.js';
import { desconectarPrisma, obtenerPrisma } from './shared/database/prisma.js';

const env = cargarEnv();
const prisma = obtenerPrisma(env.DATABASE_URL);
const app = crearApp(env, { prisma });

const servidor = app.listen(env.PORT, () => {
  console.info(`CreaFácil API escuchando en http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

/** Si el cierre ordenado se atasca, se fuerza la salida pasado este tiempo. */
const TIEMPO_MAXIMO_CIERRE_MS = 10_000;
let cerrando = false;

/**
 * Apagado ordenado: deja de aceptar peticiones, espera a las que están en curso
 * y cierra las conexiones con PostgreSQL antes de salir.
 */
function apagar(senal: string): void {
  if (cerrando) return;
  cerrando = true;
  console.info(`Señal ${senal} recibida, cerrando el servidor...`);

  setTimeout(() => {
    console.error('El cierre ordenado tardó demasiado; se fuerza la salida.');
    process.exit(1);
  }, TIEMPO_MAXIMO_CIERRE_MS).unref();

  servidor.close(() => {
    desconectarPrisma()
      .then(() => {
        console.info('Conexiones con la base de datos cerradas.');
        process.exit(0);
      })
      .catch((error: unknown) => {
        console.error('Error al cerrar la conexión con la base de datos:', error);
        process.exit(1);
      });
  });
}

process.on('SIGINT', () => {
  apagar('SIGINT');
});
process.on('SIGTERM', () => {
  apagar('SIGTERM');
});

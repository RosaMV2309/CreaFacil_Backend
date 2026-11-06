import { crearApp } from './app.js';
import { cargarEnv } from './config/env.js';

const env = cargarEnv();
const app = crearApp(env);

const servidor = app.listen(env.PORT, () => {
  console.info(`CreaFácil API escuchando en http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

function apagar(senal: string): void {
  console.info(`Señal ${senal} recibida, cerrando el servidor...`);
  servidor.close(() => process.exit(0));
}

process.on('SIGINT', () => {
  apagar('SIGINT');
});
process.on('SIGTERM', () => {
  apagar('SIGTERM');
});

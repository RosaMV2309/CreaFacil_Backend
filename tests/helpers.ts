import express, { type Express, type Router } from 'express';

import { cargarEnv, type Env } from '../src/config/env.js';
import { manejador404, manejadorErrores } from '../src/shared/errors/index.js';

/** Configuración válida para las pruebas (no usa el .env local). */
export const envDePrueba: Env = cargarEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://usuario:clave@localhost:5432/creafacil_test',
  JWT_SECRET: 'x'.repeat(32),
});

/**
 * App mínima con las mismas piezas compartidas que la real (JSON, 404 y manejador de errores)
 * para montar rutas que solo existen dentro de las pruebas.
 */
export function crearAppDePrueba(rutas: Router): Express {
  const app = express();
  app.use(express.json());
  app.use(rutas);
  app.use(manejador404);
  app.use(manejadorErrores);
  return app;
}

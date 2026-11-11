import express, { type Express, type Router } from 'express';

import { crearApp } from '../src/app.js';
import { cargarEnv, type Env } from '../src/config/env.js';
import { crearClientePrisma, type PrismaClient } from '../src/shared/database/prisma.js';
import { manejador404, manejadorErrores } from '../src/shared/errors/index.js';

/** Puerto donde no escucha ningún PostgreSQL: simula una base de datos caída. */
export const URL_SIN_BASE_DATOS = 'postgresql://usuario:clave@127.0.0.1:5999/no_existe';

/** Configuración válida para las pruebas (no usa el .env local). */
export const envDePrueba: Env = cargarEnv({
  NODE_ENV: 'test',
  DATABASE_URL: URL_SIN_BASE_DATOS,
  JWT_SECRET: 'x'.repeat(32),
});

/**
 * Cliente Prisma sin base de datos detrás. Crearlo no abre conexiones, así que sirve para
 * las pruebas que no consultan la BD; las que lo hagan reciben un error de conexión.
 */
export function crearPrismaSinBaseDatos(): PrismaClient {
  return crearClientePrisma(URL_SIN_BASE_DATOS);
}

/** App real para pruebas que no tocan la base de datos (404, errores, raíz de la API…). */
export function crearAppSinBaseDatos(): Express {
  return crearApp(envDePrueba, { prisma: crearPrismaSinBaseDatos() });
}

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

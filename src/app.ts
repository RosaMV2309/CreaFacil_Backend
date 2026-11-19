import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';

import type { Env } from './config/env.js';
import { crearRouterApi } from './routes.js';
import {
  type AlmacenamientoArchivos,
  RUTA_PUBLICA_ARCHIVOS,
} from './shared/almacenamiento/almacenamiento.js';
import { crearAlmacenamientoDisco } from './shared/almacenamiento/disco.js';
import type { PrismaClient } from './shared/database/prisma.js';
import { manejador404, manejadorErrores } from './shared/errors/index.js';
import { registroPeticiones } from './shared/middlewares/request-logger.js';
import type { Reloj } from './shared/security/tokens.js';

/**
 * Dependencias externas de la aplicación. Se inyectan para que las pruebas decidan
 * a qué base de datos se conecta la app (o usen una sin PostgreSQL).
 */
export interface DependenciasApp {
  prisma: PrismaClient;
  /** Reloj para firmar y verificar los tokens JWT (las pruebas lo adelantan para simular la expiración). */
  reloj?: Reloj;
  /**
   * Límite de intentos de inicio de sesión. Si no se inyecta, se construye con
   * `LOGIN_MAX_INTENTOS` y `LOGIN_VENTANA_MINUTOS`. Las pruebas pasan uno con un límite bajo.
   */
  limitadorLogin?: RequestHandler;
  /**
   * Almacenamiento de las fotos del catálogo (interfaz intercambiable, RF-04). Si no se inyecta, se
   * usa el disco local en `UPLOADS_DIR` con URL públicas `${PUBLIC_BASE_URL}/uploads/<archivo>`.
   */
  almacenamiento?: AlmacenamientoArchivos;
}

export function crearApp(env: Env, dependencias: DependenciasApp): Express {
  const almacenamiento =
    dependencias.almacenamiento ??
    crearAlmacenamientoDisco({ carpeta: env.UPLOADS_DIR, urlBase: env.PUBLIC_BASE_URL });
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  // Las apps web necesitan leer el tiempo de espera del 429 del límite de intentos.
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy'],
    }),
  );
  if (env.NODE_ENV !== 'test') {
    app.use(registroPeticiones);
  }
  app.use(express.json({ limit: '1mb' }));

  // Fotos del catálogo servidas por la propia API (solo si el almacenamiento es el disco local).
  // Sin autenticación: el catálogo es público.
  if (almacenamiento.manejadorPublico) {
    app.use(RUTA_PUBLICA_ARCHIVOS, almacenamiento.manejadorPublico);
  }
  app.use('/api/v1', crearRouterApi(env, { ...dependencias, almacenamiento }));

  // Siempre al final: 404 en JSON y manejador central de errores (RNF-02).
  app.use(manejador404);
  app.use(manejadorErrores);

  return app;
}

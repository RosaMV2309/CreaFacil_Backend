import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import type { Env } from './config/env.js';
import { crearRouterApi } from './routes.js';
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
}

export function crearApp(env: Env, dependencias: DependenciasApp): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  if (env.NODE_ENV !== 'test') {
    app.use(registroPeticiones);
  }
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1', crearRouterApi(env, dependencias));

  // Siempre al final: 404 en JSON y manejador central de errores (RNF-02).
  app.use(manejador404);
  app.use(manejadorErrores);

  return app;
}

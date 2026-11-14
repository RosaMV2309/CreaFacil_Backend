import { Router } from 'express';

import type { DependenciasApp } from './app.js';
import { NOMBRE_API, VERSION_API } from './config/app-info.js';
import type { Env } from './config/env.js';
import { crearAuthRouter } from './modules/auth/auth.routes.js';
import { crearHealthRouter } from './modules/health/health.routes.js';
import { crearServicioTokens } from './shared/security/tokens.js';

/**
 * Router raíz de la API, montado en `/api/v1` desde `app.ts`.
 * Cada módulo nuevo (auth, categorias, cotizaciones…) se registra aquí y recibe
 * las dependencias que necesite (por ejemplo, el cliente Prisma para su repositorio).
 */
export function crearRouterApi(env: Env, dependencias: DependenciasApp): Router {
  const tokens = crearServicioTokens({
    secreto: env.JWT_SECRET,
    duracion: env.JWT_EXPIRES_IN,
    ...(dependencias.reloj ? { reloj: dependencias.reloj } : {}),
  });

  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ nombre: NOMBRE_API, version: VERSION_API });
  });
  router.use('/health', crearHealthRouter(env, dependencias.prisma));
  router.use('/auth', crearAuthRouter({ prisma: dependencias.prisma, tokens }));

  return router;
}

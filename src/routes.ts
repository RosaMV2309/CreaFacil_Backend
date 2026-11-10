import { Router } from 'express';

import { NOMBRE_API, VERSION_API } from './config/app-info.js';
import type { Env } from './config/env.js';
import { crearHealthRouter } from './modules/health/health.routes.js';

/**
 * Router raíz de la API, montado en `/api/v1` desde `app.ts`.
 * Cada módulo nuevo (auth, categorias, cotizaciones…) se registra aquí.
 */
export function crearRouterApi(env: Env): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ nombre: NOMBRE_API, version: VERSION_API });
  });
  router.use('/health', crearHealthRouter(env));

  return router;
}

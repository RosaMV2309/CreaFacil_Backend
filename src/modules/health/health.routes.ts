import { Router } from 'express';

import { NOMBRE_API, VERSION_API } from '../../config/app-info.js';
import type { Env } from '../../config/env.js';
import { crearHealthController } from './health.controller.js';
import { crearHealthService } from './health.service.js';

/**
 * Rutas del módulo health, montadas en `/api/v1/health`.
 * Aquí se conectan las capas: rutas → controlador → servicio.
 */
export function crearHealthRouter(env: Env): Router {
  const servicio = crearHealthService({
    servicio: NOMBRE_API,
    version: VERSION_API,
    entorno: env.NODE_ENV,
  });
  const controlador = crearHealthController(servicio);

  const router = Router();
  router.get('/', controlador.obtenerEstado);
  return router;
}

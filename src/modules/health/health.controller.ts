import type { RequestHandler } from 'express';

import type { HealthService } from './health.service.js';

/**
 * Capa HTTP del módulo health: solo traduce entre Express y el servicio, sin lógica (RNF-07).
 * Estado `ok` → 200; `degradado` (la base de datos no responde) → 503 Service Unavailable.
 */
export function crearHealthController(servicio: HealthService): { obtenerEstado: RequestHandler } {
  return {
    obtenerEstado: async (_req, res) => {
      const estado = await servicio.obtenerEstado();
      res.status(estado.estado === 'ok' ? 200 : 503).json(estado);
    },
  };
}

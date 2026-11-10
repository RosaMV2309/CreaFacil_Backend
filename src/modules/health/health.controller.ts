import type { RequestHandler } from 'express';

import type { HealthService } from './health.service.js';

/** Capa HTTP del módulo health: solo traduce entre Express y el servicio, sin lógica (RNF-07). */
export function crearHealthController(servicio: HealthService): { obtenerEstado: RequestHandler } {
  return {
    obtenerEstado: (_req, res) => {
      res.status(200).json(servicio.obtenerEstado());
    },
  };
}

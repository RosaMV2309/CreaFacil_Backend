import { Router } from 'express';

import type { PrismaClient } from '../../shared/database/prisma.js';
import type { ServicioTokens } from '../../shared/security/tokens.js';
import { validate } from '../../shared/middlewares/validate.js';
import { crearAuthController } from './auth.controller.js';
import { crearAuthRepository } from './auth.repository.js';
import { esquemasRegistro } from './auth.schemas.js';
import { crearAuthService } from './auth.service.js';

export interface DependenciasAuthRouter {
  readonly prisma: PrismaClient;
  readonly tokens: ServicioTokens;
}

/**
 * Rutas del módulo de autenticación, montadas en `/api/v1/auth` (RF-01).
 * Conecta las capas: rutas → controlador → servicio → repositorio.
 */
export function crearAuthRouter({ prisma, tokens }: DependenciasAuthRouter): Router {
  const repositorio = crearAuthRepository(prisma);
  const servicio = crearAuthService({ repositorio, tokens });
  const controlador = crearAuthController(servicio);

  const router = Router();
  router.post('/registro', validate(esquemasRegistro), controlador.registrar);
  return router;
}

import { Router } from 'express';

import type { AlmacenamientoArchivos } from '../../shared/almacenamiento/almacenamiento.js';
import type { PrismaClient } from '../../shared/database/prisma.js';
import { validate } from '../../shared/middlewares/validate.js';
import { crearCatalogoController } from './catalogo.controller.js';
import { crearCatalogoRepository } from './catalogo.repository.js';
import { esquemasCatalogo, esquemasFichaPublica } from './catalogo.schemas.js';
import { crearCatalogoService } from './catalogo.service.js';

/**
 * Catálogo PÚBLICO en `/api/v1/catalogo` (RF-03, RF-04, RF-05, RN-01).
 *
 * SIN auth ni requireRole (decisión de la Fase 2: «Explorar el catálogo» no pide sesión). Si llega
 * un token, se ignora: la respuesta es la misma para todos. CORS lo aplica `app.ts` (CORS_ORIGIN).
 */
export function crearCatalogoRouter(
  prisma: PrismaClient,
  almacenamiento: AlmacenamientoArchivos,
): Router {
  const controlador = crearCatalogoController(
    crearCatalogoService(crearCatalogoRepository(prisma), almacenamiento),
  );

  const router = Router();
  router.get('/', validate(esquemasCatalogo), controlador.listar);
  router.get('/servicios/:id', validate(esquemasFichaPublica), controlador.obtenerFicha);
  return router;
}

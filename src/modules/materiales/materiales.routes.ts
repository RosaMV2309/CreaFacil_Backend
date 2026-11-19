import { Router } from 'express';

import type { PrismaClient } from '../../shared/database/prisma.js';
import { validate } from '../../shared/middlewares/validate.js';
import { crearMaterialesController } from './materiales.controller.js';
import { crearMaterialesRepository } from './materiales.repository.js';
import {
  esquemasActualizarMaterial,
  esquemasCrearMaterial,
  esquemasListarMateriales,
  esquemasObtenerMaterial,
} from './materiales.schemas.js';
import { crearMaterialesService } from './materiales.service.js';

/**
 * Gestión de materiales de la administradora, montada en `/api/v1/admin/materiales` (RF-22, RF-08).
 *
 * NO añade auth ni requireRole: los aplica UNA vez el grupo `/admin` (MODULOS_ADMIN).
 * No hay DELETE (solo se desactiva con `PATCH { activo: false }`): un DELETE responde 404
 * RUTA_NO_ENCONTRADA, como cualquier ruta inexistente.
 */
export function crearMaterialesAdminRouter(prisma: PrismaClient): Router {
  const controlador = crearMaterialesController(
    crearMaterialesService(crearMaterialesRepository(prisma)),
  );

  const router = Router();
  router.get('/', validate(esquemasListarMateriales), controlador.listar);
  router.post('/', validate(esquemasCrearMaterial), controlador.crear);
  router.get('/:id', validate(esquemasObtenerMaterial), controlador.obtener);
  router.patch('/:id', validate(esquemasActualizarMaterial), controlador.actualizar);
  return router;
}

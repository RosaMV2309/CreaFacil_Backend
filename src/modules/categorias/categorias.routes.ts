import { Router } from 'express';

import type { PrismaClient } from '../../shared/database/prisma.js';
import { validate } from '../../shared/middlewares/validate.js';
import { crearCategoriasController } from './categorias.controller.js';
import { crearCategoriasRepository } from './categorias.repository.js';
import {
  esquemasActualizarCategoria,
  esquemasCrearCategoria,
  esquemasListarCategorias,
  esquemasObtenerCategoria,
} from './categorias.schemas.js';
import { crearCategoriasService } from './categorias.service.js';

/**
 * Gestión de categorías de la administradora, montada en `/api/v1/admin/categorias` (RF-22).
 *
 * NO añade auth ni requireRole: los aplica UNA vez el grupo `/admin` (MODULOS_ADMIN).
 * No hay DELETE (solo se desactiva con `PATCH { activa: false }`): un DELETE responde 404
 * RUTA_NO_ENCONTRADA, como cualquier ruta inexistente.
 */
export function crearCategoriasAdminRouter(prisma: PrismaClient): Router {
  const controlador = crearCategoriasController(
    crearCategoriasService(crearCategoriasRepository(prisma)),
  );

  const router = Router();
  router.get('/', validate(esquemasListarCategorias), controlador.listar);
  router.post('/', validate(esquemasCrearCategoria), controlador.crear);
  router.get('/:id', validate(esquemasObtenerCategoria), controlador.obtener);
  router.patch('/:id', validate(esquemasActualizarCategoria), controlador.actualizar);
  return router;
}

import { Router } from 'express';

import type { PrismaClient } from '../../shared/database/prisma.js';
import { validate } from '../../shared/middlewares/validate.js';
import { crearUsuariosController } from './usuarios.controller.js';
import { crearUsuariosRepository } from './usuarios.repository.js';
import { esquemasListarClientes } from './usuarios.schemas.js';
import { crearUsuariosService } from './usuarios.service.js';

/**
 * Rutas de la administradora sobre los clientes, montadas en `/api/v1/admin/clientes` (RF-02).
 *
 * NO añaden auth ni requireRole: ya los aplica UNA vez el grupo `/admin`
 * (`src/modules/admin/admin.routes.ts`). Por eso este router solo se monta a través de ese grupo.
 * Conecta las capas: rutas → controlador → servicio → repositorio.
 */
export function crearClientesAdminRouter(prisma: PrismaClient): Router {
  const controlador = crearUsuariosController(
    crearUsuariosService(crearUsuariosRepository(prisma)),
  );

  const router = Router();
  router.get('/', validate(esquemasListarClientes), controlador.listarClientes);
  return router;
}

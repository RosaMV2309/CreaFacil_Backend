import { randomUUID } from 'node:crypto';

import { Router } from 'express';

import type { AlmacenamientoArchivos } from '../../shared/almacenamiento/almacenamiento.js';
import type { PrismaClient } from '../../shared/database/prisma.js';
import { validate } from '../../shared/middlewares/validate.js';
import { crearFotosRepository } from './fotos.repository.js';
import { crearFotosService } from './fotos.service.js';
import { crearRecepcionFoto } from './fotos.subida.js';
import { crearServiciosController } from './servicios.controller.js';
import { crearServiciosRepository } from './servicios.repository.js';
import {
  esquemasActualizarServicio,
  esquemasBorrarFoto,
  esquemasCrearServicio,
  esquemasListarServicios,
  esquemasObtenerServicio,
  esquemasOrdenarFotos,
  esquemasSubirFoto,
} from './servicios.schemas.js';
import { crearServiciosService } from './servicios.service.js';

/**
 * Servicios del catálogo de la administradora, en `/api/v1/admin/servicios` (RF-22, RF-04, RF-05).
 *
 * NO añade auth ni requireRole: los aplica UNA vez el grupo `/admin` (MODULOS_ADMIN), ANTES de leer
 * cualquier archivo: una subida sin token o de un cliente se rechaza sin procesar el formulario.
 * No hay DELETE de servicios (solo se desactivan con `PATCH { activo: false }`); el único DELETE es
 * el de una foto.
 */
export function crearServiciosAdminRouter(
  prisma: PrismaClient,
  almacenamiento: AlmacenamientoArchivos,
): Router {
  const controlador = crearServiciosController(
    crearServiciosService(crearServiciosRepository(prisma), almacenamiento),
    crearFotosService({
      repositorio: crearFotosRepository(prisma),
      almacenamiento,
      uuid: randomUUID,
    }),
  );

  const router = Router();
  router.get('/', validate(esquemasListarServicios), controlador.listar);
  router.post('/', validate(esquemasCrearServicio), controlador.crear);
  router.get('/:id', validate(esquemasObtenerServicio), controlador.obtener);
  router.patch('/:id', validate(esquemasActualizarServicio), controlador.actualizar);
  router.post(
    '/:id/fotos',
    validate(esquemasSubirFoto),
    crearRecepcionFoto(),
    controlador.subirFoto,
  );
  router.patch('/:id/fotos/orden', validate(esquemasOrdenarFotos), controlador.ordenarFotos);
  router.delete('/:id/fotos/:fotoId', validate(esquemasBorrarFoto), controlador.borrarFoto);
  return router;
}

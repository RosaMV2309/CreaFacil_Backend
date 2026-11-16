import type { Response } from 'express';

import { AppError } from '../errors/index.js';
import { exigirUsuario } from './auth.js';

/**
 * Patrón RN-05: «el cliente solo ve lo suyo» (RN-05, RNF-03).
 *
 * Regla: el id de la persona SIEMPRE sale del token verificado, nunca de la URL, del cuerpo ni de
 * la query. Así un cliente no puede leer ni modificar datos ajenos cambiando un id.
 *
 * Uso en las fases siguientes (solicitudes, cotizaciones, pedidos, notificaciones…):
 *
 * 1. Controlador: obtiene el id con {@link idUsuarioActual} y se lo pasa al servicio.
 *    ```ts
 *    listarMisPedidos: async (_req, res) => {
 *      res.json(await servicio.listarDelCliente(idUsuarioActual(res)));
 *    },
 *    ```
 * 2. Repositorio: filtra SIEMPRE por ese id (`where: { usuarioId, ... }`). Para listar no hace falta
 *    nada más: la consulta nunca devuelve registros de otra persona.
 * 3. Detalle de un recurso por su id (`GET /pedidos/:id`): se busca y se comprueba la propiedad con
 *    {@link exigirPropietario}. Si no existe o es de otra persona se responde **404** (no 403), para
 *    no revelar que ese id existe. Mejor aún, filtra en la consulta (`where: { id, usuarioId }`) y
 *    usa `exigirPropietario` como segunda barrera.
 *
 * Las operaciones de la administradora no usan este filtro: van bajo `/api/v1/admin`, protegido
 * por rol en `src/modules/admin/admin.routes.ts`.
 */

/** Id (UUID) de la persona autenticada, tomado del token. Lanza 401 si la ruta no pasó por `auth`. */
export function idUsuarioActual(res: Response): string {
  return exigirUsuario(res).id;
}

/** Cualquier registro que pertenezca a una persona usuaria. */
export interface ConPropietario {
  readonly usuarioId: string;
}

/**
 * Devuelve el recurso si pertenece a `usuarioId`. Si no existe (`null`/`undefined`) o es de otra
 * persona, lanza 404 `NO_ENCONTRADO` con el mismo mensaje en ambos casos (RN-05).
 */
export function exigirPropietario<T extends ConPropietario>(
  recurso: T | null | undefined,
  usuarioId: string,
  mensaje?: string,
): T {
  if (!recurso || recurso.usuarioId !== usuarioId) {
    throw AppError.noEncontrado(mensaje);
  }
  return recurso;
}

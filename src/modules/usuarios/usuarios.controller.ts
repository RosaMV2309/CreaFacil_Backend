import type { RequestHandler } from 'express';

import { datosValidados } from '../../shared/middlewares/validate.js';
import { esquemasListarClientes } from './usuarios.schemas.js';
import type { UsuariosService } from './usuarios.service.js';

/**
 * Capa HTTP del módulo de usuarios: lee la petición ya validada, llama al servicio y responde.
 * Sin lógica de negocio (RNF-07).
 */
export interface UsuariosController {
  listarClientes: RequestHandler;
}

export function crearUsuariosController(servicio: UsuariosService): UsuariosController {
  return {
    listarClientes: async (_req, res) => {
      const { query } = datosValidados(res, esquemasListarClientes);
      res.status(200).json(await servicio.listarClientes(query));
    },
  };
}

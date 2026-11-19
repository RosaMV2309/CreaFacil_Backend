import type { RequestHandler } from 'express';

import { datosValidados } from '../../shared/middlewares/validate.js';
import {
  esquemasActualizarMaterial,
  esquemasCrearMaterial,
  esquemasListarMateriales,
  esquemasObtenerMaterial,
} from './materiales.schemas.js';
import type { MaterialesService } from './materiales.service.js';

/**
 * Capa HTTP de los materiales: lee la petición ya validada, llama al servicio y responde.
 * Sin lógica de negocio (RNF-07).
 */
export interface MaterialesController {
  listar: RequestHandler;
  obtener: RequestHandler;
  crear: RequestHandler;
  actualizar: RequestHandler;
}

export function crearMaterialesController(servicio: MaterialesService): MaterialesController {
  return {
    listar: async (_req, res) => {
      const { query } = datosValidados(res, esquemasListarMateriales);
      res.status(200).json(await servicio.listar(query));
    },
    obtener: async (_req, res) => {
      const { params } = datosValidados(res, esquemasObtenerMaterial);
      res.status(200).json({ material: await servicio.obtener(params.id) });
    },
    crear: async (_req, res) => {
      const { body } = datosValidados(res, esquemasCrearMaterial);
      res.status(201).json({ material: await servicio.crear(body) });
    },
    actualizar: async (_req, res) => {
      const { params, body } = datosValidados(res, esquemasActualizarMaterial);
      res.status(200).json({ material: await servicio.actualizar(params.id, body) });
    },
  };
}

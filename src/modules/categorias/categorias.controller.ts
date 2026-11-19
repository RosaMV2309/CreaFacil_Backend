import type { RequestHandler } from 'express';

import { datosValidados } from '../../shared/middlewares/validate.js';
import {
  esquemasActualizarCategoria,
  esquemasCrearCategoria,
  esquemasListarCategorias,
  esquemasObtenerCategoria,
} from './categorias.schemas.js';
import type { CategoriasService } from './categorias.service.js';

/**
 * Capa HTTP de las categorías: lee la petición ya validada, llama al servicio y responde.
 * Sin lógica de negocio (RNF-07).
 */
export interface CategoriasController {
  listar: RequestHandler;
  obtener: RequestHandler;
  crear: RequestHandler;
  actualizar: RequestHandler;
}

export function crearCategoriasController(servicio: CategoriasService): CategoriasController {
  return {
    listar: async (_req, res) => {
      const { query } = datosValidados(res, esquemasListarCategorias);
      res.status(200).json(await servicio.listar(query));
    },
    obtener: async (_req, res) => {
      const { params } = datosValidados(res, esquemasObtenerCategoria);
      res.status(200).json({ categoria: await servicio.obtener(params.id) });
    },
    crear: async (_req, res) => {
      const { body } = datosValidados(res, esquemasCrearCategoria);
      res.status(201).json({ categoria: await servicio.crear(body) });
    },
    actualizar: async (_req, res) => {
      const { params, body } = datosValidados(res, esquemasActualizarCategoria);
      res.status(200).json({ categoria: await servicio.actualizar(params.id, body) });
    },
  };
}

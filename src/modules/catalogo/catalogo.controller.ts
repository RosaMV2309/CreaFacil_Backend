import type { RequestHandler } from 'express';

import { datosValidados } from '../../shared/middlewares/validate.js';
import { esquemasCatalogo, esquemasFichaPublica } from './catalogo.schemas.js';
import type { CatalogoService } from './catalogo.service.js';

/**
 * Capa HTTP del catálogo público: lee la petición validada, llama al servicio y responde.
 * Sin lógica de negocio (RNF-07). Las respuestas correctas se pueden guardar en caché un
 * minuto (son iguales para todos: no dependen de la sesión); los errores no.
 */
export const CACHE_CATALOGO = 'public, max-age=60';

export interface CatalogoController {
  listar: RequestHandler;
  obtenerFicha: RequestHandler;
}

export function crearCatalogoController(catalogo: CatalogoService): CatalogoController {
  return {
    listar: async (_req, res) => {
      const { query } = datosValidados(res, esquemasCatalogo);
      const respuesta = await catalogo.listar(query);
      res.set('Cache-Control', CACHE_CATALOGO).status(200).json(respuesta);
    },
    obtenerFicha: async (_req, res) => {
      const { params } = datosValidados(res, esquemasFichaPublica);
      const servicio = await catalogo.obtenerFicha(params.id);
      res.set('Cache-Control', CACHE_CATALOGO).status(200).json({ servicio });
    },
  };
}

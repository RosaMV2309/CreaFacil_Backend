import type { RequestHandler } from 'express';

import { datosValidados } from '../../shared/middlewares/validate.js';
import type { FotosService } from './fotos.service.js';
import {
  esquemasActualizarServicio,
  esquemasBorrarFoto,
  esquemasCrearServicio,
  esquemasListarServicios,
  esquemasObtenerServicio,
  esquemasOrdenarFotos,
  esquemasSubirFoto,
} from './servicios.schemas.js';
import type { ServiciosService } from './servicios.service.js';

/**
 * Capa HTTP de los servicios y sus fotos: lee la petición ya validada, llama al servicio y
 * responde. Sin lógica de negocio (RNF-07).
 */
export interface ServiciosController {
  listar: RequestHandler;
  obtener: RequestHandler;
  crear: RequestHandler;
  actualizar: RequestHandler;
  subirFoto: RequestHandler;
  ordenarFotos: RequestHandler;
  borrarFoto: RequestHandler;
}

export function crearServiciosController(
  servicios: ServiciosService,
  fotos: FotosService,
): ServiciosController {
  return {
    listar: async (_req, res) => {
      const { query } = datosValidados(res, esquemasListarServicios);
      res.status(200).json(await servicios.listar(query));
    },
    obtener: async (_req, res) => {
      const { params } = datosValidados(res, esquemasObtenerServicio);
      res.status(200).json({ servicio: await servicios.obtener(params.id) });
    },
    crear: async (_req, res) => {
      const { body } = datosValidados(res, esquemasCrearServicio);
      res.status(201).json({ servicio: await servicios.crear(body) });
    },
    actualizar: async (_req, res) => {
      const { params, body } = datosValidados(res, esquemasActualizarServicio);
      res.status(200).json({ servicio: await servicios.actualizar(params.id, body) });
    },
    subirFoto: async (req, res) => {
      const { params } = datosValidados(res, esquemasSubirFoto);
      // Solo se pasan los bytes: el nombre original y el Content-Type del cliente no se usan.
      const archivo = req.file ? { contenido: req.file.buffer } : undefined;
      res.status(201).json({ foto: await fotos.subir(params.id, archivo) });
    },
    ordenarFotos: async (_req, res) => {
      const { params, body } = datosValidados(res, esquemasOrdenarFotos);
      res.status(200).json({ fotos: await fotos.ordenar(params.id, body.fotoIds) });
    },
    borrarFoto: async (_req, res) => {
      const { params } = datosValidados(res, esquemasBorrarFoto);
      res.status(200).json({ fotos: await fotos.eliminar(params.id, params.fotoId) });
    },
  };
}

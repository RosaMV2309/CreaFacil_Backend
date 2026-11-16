import type { RequestHandler } from 'express';

import { idUsuarioActual } from '../../shared/middlewares/usuario-actual.js';
import { datosValidados } from '../../shared/middlewares/validate.js';
import { esquemasActualizarPerfil, esquemasLogin, esquemasRegistro } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

/**
 * Capa HTTP del módulo de autenticación: lee la petición ya validada, llama al servicio
 * y responde. Sin lógica de negocio (RNF-07).
 */
export interface AuthController {
  registrar: RequestHandler;
  iniciarSesion: RequestHandler;
  obtenerPerfil: RequestHandler;
  actualizarPerfil: RequestHandler;
}

export function crearAuthController(servicio: AuthService): AuthController {
  return {
    registrar: async (_req, res) => {
      const { body } = datosValidados(res, esquemasRegistro);
      res.status(201).json(await servicio.registrar(body));
    },

    iniciarSesion: async (_req, res) => {
      const { body } = datosValidados(res, esquemasLogin);
      res.status(200).json(await servicio.iniciarSesion(body));
    },

    obtenerPerfil: async (_req, res) => {
      res.status(200).json({ usuario: await servicio.obtenerPerfil(idUsuarioActual(res)) });
    },

    /** RN-05: se actualiza la persona del token; el cuerpo no puede traer un id (esquema estricto). */
    actualizarPerfil: async (_req, res) => {
      const { body } = datosValidados(res, esquemasActualizarPerfil);
      res.status(200).json({
        usuario: await servicio.actualizarPerfil(idUsuarioActual(res), body),
      });
    },
  };
}

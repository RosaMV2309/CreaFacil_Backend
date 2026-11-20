import type { RequestHandler } from 'express';
import multer from 'multer';

import { TAMANO_MAXIMO_FOTO } from '../../shared/almacenamiento/almacenamiento.js';
import { AppError } from '../../shared/errors/index.js';
import { errorDemasiadoGrande, errorFoto } from './fotos.service.js';

/**
 * Lectura del formulario `multipart/form-data` de una foto con multer, EN MEMORIA y con límites:
 * un único archivo en el campo «foto», hasta 5 MB y ningún otro campo. Nada se escribe en disco
 * aquí: el servicio valida el contenido y decide el nombre.
 *
 * Errores → mismo formato que el resto de la API:
 * - más de 5 MB → 413 ARCHIVO_DEMASIADO_GRANDE;
 * - otro campo, varios archivos o campos de texto → 400 VALIDACION (campo «foto»);
 * - formulario mal formado → 400 SOLICITUD_INVALIDA.
 */

export const CAMPO_FOTO = 'foto';

const MENSAJES_MULTER: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_UNEXPECTED_FILE: 'Envía una sola foto y en el campo «foto».',
  LIMIT_FILE_COUNT: 'Envía una sola foto y en el campo «foto».',
  LIMIT_FIELD_COUNT: 'El formulario solo admite el archivo del campo «foto», sin otros campos.',
  LIMIT_PART_COUNT: 'El formulario solo admite el archivo del campo «foto», sin otros campos.',
};

export function traducirErrorSubida(error: unknown): AppError {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return errorDemasiadoGrande();
    }
    return errorFoto(MENSAJES_MULTER[error.code] ?? 'No se pudo leer la foto enviada.');
  }
  return new AppError({
    estado: 400,
    codigo: 'SOLICITUD_INVALIDA',
    mensaje: 'El formulario multipart/form-data no es válido.',
  });
}

export function crearRecepcionFoto(tamanoMaximo = TAMANO_MAXIMO_FOTO): RequestHandler {
  const subida = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: tamanoMaximo, files: 1, fields: 0, parts: 1, headerPairs: 20 },
  }).single(CAMPO_FOTO);

  return (req, res, next) => {
    subida(req, res, (error: unknown) => {
      next(error ? traducirErrorSubida(error) : undefined);
    });
  };
}

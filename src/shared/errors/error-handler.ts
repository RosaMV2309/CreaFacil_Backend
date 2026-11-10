import type { ErrorRequestHandler, RequestHandler, Response } from 'express';

import { AppError, type DetalleError } from './app-error.js';

/** Cuerpo JSON de todas las respuestas de error de la API (RNF-02). */
export interface CuerpoError {
  error: {
    codigo: string;
    mensaje: string;
    detalles?: readonly DetalleError[];
  };
}

function responderError(res: Response, error: AppError): void {
  const cuerpo: CuerpoError = {
    error: {
      codigo: error.codigo,
      mensaje: error.message,
      ...(error.detalles && error.detalles.length > 0 ? { detalles: error.detalles } : {}),
    },
  };
  res.status(error.estado).json(cuerpo);
}

/** Errores que genera `express.json()` (body-parser) al leer el cuerpo. */
interface ErrorBodyParser {
  type: string;
  status: number;
}

function esErrorBodyParser(error: unknown): error is ErrorBodyParser {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof error.type === 'string' &&
    'status' in error &&
    typeof error.status === 'number'
  );
}

/** Traduce cualquier error lanzado a un `AppError` con un código estable. */
export function normalizarError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (esErrorBodyParser(error)) {
    if (error.type === 'entity.parse.failed') {
      return new AppError({
        estado: 400,
        codigo: 'JSON_INVALIDO',
        mensaje: 'El cuerpo de la petición no es un JSON válido.',
      });
    }
    if (error.type === 'entity.too.large') {
      return new AppError({
        estado: 413,
        codigo: 'CUERPO_DEMASIADO_GRANDE',
        mensaje: 'El cuerpo de la petición supera el tamaño permitido.',
      });
    }
    if (error.status >= 400 && error.status < 500) {
      return new AppError({
        estado: error.status,
        codigo: 'SOLICITUD_INVALIDA',
        mensaje: 'No se pudo procesar la petición.',
      });
    }
  }
  return new AppError({
    estado: 500,
    codigo: 'ERROR_INTERNO',
    mensaje: 'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.',
  });
}

/**
 * Manejador central de errores. Va al final de la cadena de middlewares.
 * Express 5 reenvía aquí también los errores de los controladores `async`.
 * Nunca envía la pila ni el mensaje interno al cliente: solo se registran en el servidor.
 */
export const manejadorErrores: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    // La respuesta ya empezó: Express cierra la conexión.
    next(error);
    return;
  }
  const appError = normalizarError(error);
  // Solo se registran los fallos inesperados (500); los errores previstos (4xx, 501) no son fallos.
  if (appError.estado === 500) {
    console.error('[ERROR]', error);
  }
  responderError(res, appError);
};

/** 404 en JSON para cualquier ruta que no exista. Va antes de `manejadorErrores`. */
export const manejador404: RequestHandler = (req, res) => {
  responderError(
    res,
    new AppError({
      estado: 404,
      codigo: 'RUTA_NO_ENCONTRADA',
      mensaje: `No existe la ruta ${req.method} ${req.path}`,
    }),
  );
};

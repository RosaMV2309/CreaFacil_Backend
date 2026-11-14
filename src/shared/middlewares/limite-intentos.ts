import type { RequestHandler } from 'express';
import { type AugmentedRequest, rateLimit } from 'express-rate-limit';

import { AppError } from '../errors/index.js';

/**
 * Límite de intentos de inicio de sesión por IP (RNF-01; decisión de la Fase 1: 5 cada 15 min).
 *
 * - Solo cuentan los intentos FALLIDOS (`skipSuccessfulRequests`): quien inicia sesión bien no
 *   consume intentos, así que las pruebas automáticas no se bloquean al repetirse.
 * - Al superar el límite responde 429 `DEMASIADOS_INTENTOS` (JSON, mensaje en español) con las
 *   cabeceras `Retry-After` (segundos) y `RateLimit` / `RateLimit-Policy` (borrador IETF 8).
 *   Mientras dura el bloqueo se rechazan todos los intentos de esa IP, también los correctos.
 * - Los contadores están en memoria: se reinician al reiniciar el servidor. Si en producción se
 *   usa un proxy inverso, habrá que configurar `trust proxy` para que la IP sea la del cliente.
 * - Se construye en `crearApp` y se puede inyectar (las pruebas usan límites bajos o altos).
 */
export interface OpcionesLimiteIntentos {
  readonly maxIntentos: number;
  readonly ventanaMinutos: number;
}

export function minutosRestantes(resetTime: Date | undefined, ahora = Date.now()): number {
  if (!resetTime) return 1;
  return Math.max(1, Math.ceil((resetTime.getTime() - ahora) / 60_000));
}

export function mensajeDemasiadosIntentos(minutos: number): string {
  const unidad = minutos === 1 ? 'minuto' : 'minutos';
  return `Demasiados intentos de inicio de sesión. Inténtalo de nuevo en ${minutos} ${unidad}.`;
}

export function crearLimitadorLogin({
  maxIntentos,
  ventanaMinutos,
}: OpcionesLimiteIntentos): RequestHandler {
  return rateLimit({
    windowMs: ventanaMinutos * 60_000,
    limit: maxIntentos,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    identifier: 'inicio-sesion',
    handler: (peticion, _res, next) => {
      // La librería guarda el estado del límite en `req.rateLimit`.
      const req = peticion as AugmentedRequest;
      next(
        AppError.demasiadosIntentos(
          mensajeDemasiadosIntentos(minutosRestantes(req.rateLimit?.resetTime)),
        ),
      );
    },
  });
}

import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { AppError } from '../errors/index.js';
import type { Rol, UsuarioAutenticado } from '../middlewares/auth.js';

/**
 * Servicio de tokens JWT de sesión (RNF-01, RF-01).
 *
 * - Algoritmo fijado a HS256 (firma y verificación): nunca se acepta `none` ni otro algoritmo.
 * - Emisor (`iss`) y audiencia (`aud`) fijos para no aceptar tokens firmados para otra cosa.
 * - Payload mínimo: `sub` (UUID del usuario) y `rol`. Nada de datos personales ni contraseñas.
 * - Sin refresh token (decisión de la Fase 1): al expirar, la persona vuelve a iniciar sesión.
 * - El reloj es inyectable para probar la expiración sin esperar.
 * - Nunca se registra el token en los logs.
 */

export const EMISOR_JWT = 'creafacil-api';
export const AUDIENCIA_JWT = 'creafacil-app';
const ALGORITMO = 'HS256';

/** Devuelve la hora actual. Inyectable en las pruebas. */
export type Reloj = () => Date;

export interface TokenFirmado {
  readonly token: string;
  /** Momento exacto en que el token deja de ser válido. */
  readonly expiraEn: Date;
}

export interface ServicioTokens {
  firmar(usuario: UsuarioAutenticado): TokenFirmado;
  /** Devuelve la persona del token o lanza 401 `TOKEN_INVALIDO` / `TOKEN_EXPIRADO`. */
  verificar(token: string): UsuarioAutenticado;
}

export interface OpcionesServicioTokens {
  readonly secreto: string;
  /** Duración: número + unidad `s`, `m`, `h` o `d` (p. ej. `8h`). Sin unidad = segundos. */
  readonly duracion: string;
  readonly reloj?: Reloj;
}

const SEGUNDOS_POR_UNIDAD: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** Convierte `8h`, `30m`, `1d` o `900` en segundos. Lanza un error si el formato no es válido. */
export function duracionEnSegundos(duracion: string): number {
  const coincidencia = /^([1-9]\d*)([smhd]?)$/.exec(duracion.trim());
  if (!coincidencia) {
    throw new Error(`Duración de token no válida: "${duracion}" (usa, por ejemplo, 8h).`);
  }
  const [, cantidad = '0', unidad = ''] = coincidencia;
  return Number(cantidad) * (SEGUNDOS_POR_UNIDAD[unidad] ?? 1);
}

const ROLES: readonly [Rol, ...Rol[]] = ['ADMIN', 'CLIENTE'];

/** Lo que debe traer un token válido además de la firma, la expiración, `iss` y `aud`. */
const esquemaPayload = z.object({
  sub: z.uuid(),
  rol: z.enum(ROLES),
});

export function tokenInvalido(): AppError {
  return AppError.noAutorizado(
    'El token de sesión no es válido. Inicia sesión de nuevo.',
    'TOKEN_INVALIDO',
  );
}

export function tokenExpirado(): AppError {
  return AppError.noAutorizado('Tu sesión ha expirado. Inicia sesión de nuevo.', 'TOKEN_EXPIRADO');
}

export function crearServicioTokens({
  secreto,
  duracion,
  reloj = () => new Date(),
}: OpcionesServicioTokens): ServicioTokens {
  const segundosValidez = duracionEnSegundos(duracion);
  const ahoraEnSegundos = (): number => Math.floor(reloj().getTime() / 1000);

  return {
    firmar: (usuario) => {
      const emitido = ahoraEnSegundos();
      const expira = emitido + segundosValidez;
      const token = jwt.sign({ rol: usuario.rol, iat: emitido, exp: expira }, secreto, {
        algorithm: ALGORITMO,
        subject: usuario.id,
        issuer: EMISOR_JWT,
        audience: AUDIENCIA_JWT,
      });
      return { token, expiraEn: new Date(expira * 1000) };
    },

    verificar: (token) => {
      let payload: unknown;
      try {
        payload = jwt.verify(token, secreto, {
          algorithms: [ALGORITMO],
          issuer: EMISOR_JWT,
          audience: AUDIENCIA_JWT,
          clockTimestamp: ahoraEnSegundos(),
        });
      } catch (error) {
        throw error instanceof jwt.TokenExpiredError ? tokenExpirado() : tokenInvalido();
      }
      const resultado = esquemaPayload.safeParse(payload);
      if (!resultado.success) {
        throw tokenInvalido();
      }
      return { id: resultado.data.sub, rol: resultado.data.rol };
    },
  };
}

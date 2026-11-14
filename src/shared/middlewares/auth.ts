import type { RequestHandler, Response } from 'express';

import { AppError } from '../errors/index.js';

/**
 * ESQUELETO — se completa en la Fase 1 (RF-01 inicio de sesión y RF-02 perfiles, RNF-01, RNF-03).
 * Todavía NO se aplica a ninguna ruta.
 *
 * Pendiente en RF-01/RF-02:
 * - Instalar `jsonwebtoken`, verificar la firma con `env.JWT_SECRET` y la expiración (`JWT_EXPIRES_IN`).
 * - Construir `UsuarioAutenticado` a partir del payload del token y guardarlo con `guardarUsuario`.
 * - Nunca registrar el token en los logs (RNF-01).
 *
 * Mientras tanto es seguro por defecto: sin token responde 401 y con token responde 501,
 * así que nunca concede acceso.
 */

export type Rol = 'ADMIN' | 'CLIENTE';

/**
 * Persona autenticada extraída del token. RN-05: los filtros por cliente usan este `id`.
 * `id` es el UUID de `Usuario.id` (texto), igual que en la base de datos.
 */
export interface UsuarioAutenticado {
  readonly id: string;
  readonly rol: Rol;
}

const CLAVE_LOCALS = 'usuario';

/** Extrae el token de la cabecera `Authorization: Bearer <token>`. */
export function extraerToken(cabecera: string | undefined): string | null {
  if (!cabecera) {
    return null;
  }
  const [esquema, token] = cabecera.split(' ');
  if (esquema?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

export function guardarUsuario(res: Response, usuario: UsuarioAutenticado): void {
  res.locals[CLAVE_LOCALS] = usuario;
}

/** Devuelve la persona autenticada por `auth`, o `null` si la ruta no pasó por `auth`. */
export function usuarioAutenticado(res: Response): UsuarioAutenticado | null {
  const usuario: unknown = res.locals[CLAVE_LOCALS];
  return typeof usuario === 'object' && usuario !== null ? (usuario as UsuarioAutenticado) : null;
}

/** Exige un token JWT válido. Esqueleto: ver el comentario del módulo. */
export const auth: RequestHandler = (req, _res, next) => {
  const token = extraerToken(req.headers.authorization);
  if (!token) {
    next(AppError.noAutorizado());
    return;
  }
  // TODO(RF-01): verificar el token con jsonwebtoken y llamar a guardarUsuario(res, usuario).
  next(AppError.noImplementado('La autenticación se habilitará en la Fase 1 (RF-01).'));
};

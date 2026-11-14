import type { RequestHandler, Response } from 'express';

import { AppError } from '../errors/index.js';
import type { ServicioTokens } from '../security/tokens.js';

/**
 * Autenticación con JWT (RF-01, RF-02, RNF-01, RNF-03).
 *
 * `crearAuth(tokens)` devuelve el middleware que exige `Authorization: Bearer <token>`:
 * - Sin cabecera, o con un esquema distinto de Bearer → 401 `NO_AUTENTICADO`.
 * - Token con firma incorrecta, alterado, de otro emisor/audiencia o mal formado → 401 `TOKEN_INVALIDO`.
 * - Token caducado → 401 `TOKEN_EXPIRADO`.
 * - Token válido → guarda `UsuarioAutenticado` (id UUID y rol) en `res.locals` y continúa.
 *
 * El token nunca se registra en los logs (RNF-01). Los permisos por rol se comprueban después
 * con `requireRole` (RN-05): `router.get('/admin/...', auth, requireRole('ADMIN'), ...)`.
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

/** Como {@link usuarioAutenticado}, pero lanza 401 si la ruta no pasó por `auth`. */
export function exigirUsuario(res: Response): UsuarioAutenticado {
  const usuario = usuarioAutenticado(res);
  if (!usuario) {
    throw AppError.noAutorizado();
  }
  return usuario;
}

/** Crea el middleware que exige un token JWT válido. */
export function crearAuth(tokens: ServicioTokens): RequestHandler {
  return (req, res, next) => {
    const token = extraerToken(req.headers.authorization);
    if (!token) {
      next(AppError.noAutorizado());
      return;
    }
    try {
      guardarUsuario(res, tokens.verificar(token));
    } catch (error) {
      next(error);
      return;
    }
    next();
  };
}

import type { RequestHandler } from 'express';

import { AppError } from '../errors/index.js';
import { type Rol, usuarioAutenticado } from './auth.js';

/**
 * Exige que la persona autenticada tenga uno de los roles indicados (RF-02, RNF-03, RN-05).
 * Se usa siempre después de `auth`: `router.get('/admin/...', auth, requireRole('ADMIN'), ...)`.
 *
 * Se aplica a las rutas en la Fase 1 (RF-01/RF-02); en esta subfase todavía no se usa.
 * - Sin persona autenticada → 401 `NO_AUTENTICADO`.
 * - Con un rol no permitido → 403 `PROHIBIDO`.
 */
export function requireRole(...roles: [Rol, ...Rol[]]): RequestHandler {
  return (_req, res, next) => {
    const usuario = usuarioAutenticado(res);
    if (!usuario) {
      next(AppError.noAutorizado());
      return;
    }
    if (!roles.includes(usuario.rol)) {
      next(AppError.prohibido());
      return;
    }
    next();
  };
}

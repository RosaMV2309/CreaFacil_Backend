import { compare, hash } from 'bcryptjs';

/**
 * Hash de contraseñas con bcrypt (RNF-01). Se usa bcryptjs (JavaScript puro): mismo formato
 * `$2b$` que bcrypt nativo, sin compilar módulos en Windows ni en la CI.
 * Nunca se guarda ni se registra la contraseña en texto legible.
 */

/** Coste (rondas = 2^12). Unos 250 ms por hash: lento para un ataque, aceptable al iniciar sesión. */
export const COSTE_BCRYPT = 12;

export function generarHashPassword(password: string): Promise<string> {
  return hash(password, COSTE_BCRYPT);
}

export function verificarPassword(password: string, hashGuardado: string): Promise<boolean> {
  return compare(password, hashGuardado);
}

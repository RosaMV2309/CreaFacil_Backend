import { Router } from 'express';

import type { AlmacenamientoArchivos } from '../../shared/almacenamiento/almacenamiento.js';
import type { PrismaClient } from '../../shared/database/prisma.js';
import { crearAuth } from '../../shared/middlewares/auth.js';
import { requireRole } from '../../shared/middlewares/require-role.js';
import type { ServicioTokens } from '../../shared/security/tokens.js';
import { crearCategoriasAdminRouter } from '../categorias/categorias.routes.js';
import { crearMaterialesAdminRouter } from '../materiales/materiales.routes.js';
import { crearClientesAdminRouter } from '../usuarios/usuarios.routes.js';

/**
 * Grupo de rutas de la administradora: `/api/v1/admin/*` (RF-02, RNF-03, RN-05).
 *
 * PATRÓN (obligatorio para las fases siguientes):
 * - `auth` + `requireRole('ADMIN')` se aplican UNA SOLA VEZ aquí, a TODO el grupo, antes que
 *   cualquier ruta. Ninguna ruta administrativa puede quedar sin proteger por olvido.
 * - Para añadir una sección (categorías, servicios, materiales, precios, pedidos, agenda, reportes…)
 *   se añade una entrada a {@link MODULOS_ADMIN} con su prefijo y su router. Esos routers NO repiten
 *   auth ni requireRole.
 * - Nunca montes rutas administrativas fuera de este grupo (p. ej. directamente en `src/routes.ts`).
 * - La prueba `tests/admin-rutas.test.ts` recorre todas las rutas de MODULOS_ADMIN y comprueba que
 *   responden 401 sin token y 403 con un token de cliente.
 *
 * Como la protección va antes del enrutado, incluso una ruta inexistente bajo `/admin` responde
 * 401/403 a quien no es administradora (no revela qué rutas existen); la administradora recibe 404.
 */

export interface DependenciasAdmin {
  readonly prisma: PrismaClient;
  readonly tokens: ServicioTokens;
  /** Almacenamiento de las fotos del catálogo (interfaz intercambiable). */
  readonly almacenamiento: AlmacenamientoArchivos;
}

/** Una sección del panel de la administradora montada bajo `/api/v1/admin`. */
export interface ModuloAdmin {
  /** Prefijo dentro de `/admin`, p. ej. `/clientes`. */
  readonly prefijo: `/${string}`;
  readonly crearRouter: (dependencias: DependenciasAdmin) => Router;
}

/** Registro de las secciones administrativas. Añade aquí las de las fases siguientes. */
export const MODULOS_ADMIN: readonly ModuloAdmin[] = [
  { prefijo: '/clientes', crearRouter: ({ prisma }) => crearClientesAdminRouter(prisma) },
  { prefijo: '/categorias', crearRouter: ({ prisma }) => crearCategoriasAdminRouter(prisma) },
  { prefijo: '/materiales', crearRouter: ({ prisma }) => crearMaterialesAdminRouter(prisma) },
];

export function crearAdminRouter(
  dependencias: DependenciasAdmin,
  modulos: readonly ModuloAdmin[] = MODULOS_ADMIN,
): Router {
  const router = Router();
  // Protección de TODO el grupo: primero el token (401) y después el rol (403).
  router.use(crearAuth(dependencias.tokens), requireRole('ADMIN'));
  for (const { prefijo, crearRouter } of modulos) {
    router.use(prefijo, crearRouter(dependencias));
  }
  return router;
}

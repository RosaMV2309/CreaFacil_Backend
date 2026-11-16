/**
 * Regresión de permisos del grupo `/api/v1/admin` (RF-02, RNF-03, RN-05).
 *
 * Recorre TODAS las rutas registradas en MODULOS_ADMIN y comprueba que responden 401 sin token y
 * 403 con un token de CLIENTE. Si en una fase futura se añade una ruta administrativa, esta prueba
 * la cubre automáticamente; si alguien la protege mal (o la monta fuera del grupo), falla.
 */
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { crearApp } from '../src/app.js';
import {
  crearAdminRouter,
  type DependenciasAdmin,
  MODULOS_ADMIN,
} from '../src/modules/admin/admin.routes.js';
import { crearServicioTokens } from '../src/shared/security/tokens.js';
import { crearAppDePrueba, crearPrismaSinBaseDatos, envDePrueba } from './helpers.js';

const ID = '3f2a6c1e-8b4d-4e5f-9a7b-1c2d3e4f5a6b';
const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Metodo = (typeof METODOS)[number];

interface RutaRegistrada {
  readonly metodo: Metodo;
  readonly ruta: string;
}

interface CapaRouter {
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: unknown };
}

const prisma = crearPrismaSinBaseDatos();
const tokens = crearServicioTokens({ secreto: envDePrueba.JWT_SECRET, duracion: '1h' });
const dependencias: DependenciasAdmin = { prisma, tokens };

/** Lista las rutas (método + ruta completa bajo /api/v1/admin) de los módulos registrados. */
function rutasAdmin(): RutaRegistrada[] {
  const rutas: RutaRegistrada[] = [];
  for (const { prefijo, crearRouter } of MODULOS_ADMIN) {
    const capas = (crearRouter(dependencias) as unknown as { stack: CapaRouter[] }).stack;
    for (const capa of capas) {
      if (!capa.route) {
        // Un router anidado no expone su prefijo: no se podría comprobar. Regístralo como un
        // módulo propio en MODULOS_ADMIN.
        if (capa.handle.stack !== undefined) {
          throw new Error(`El módulo ${prefijo} anida un router: regístralo en MODULOS_ADMIN.`);
        }
        continue;
      }
      const ruta = `/api/v1/admin${prefijo}${capa.route.path === '/' ? '' : capa.route.path}`
        // Los parámetros se rellenan con un UUID cualquiera.
        .replace(/:[A-Za-z]+/g, ID);
      for (const metodo of METODOS) {
        if (capa.route.methods[metodo]) {
          rutas.push({ metodo, ruta });
        }
      }
    }
  }
  return rutas;
}

describe('grupo /api/v1/admin: todas las rutas exigen el rol ADMIN', () => {
  const app = crearApp(envDePrueba, { prisma });
  const rutas = rutasAdmin();
  const tokenCliente = tokens.firmar({ id: ID, rol: 'CLIENTE' }).token;

  it('hay rutas administrativas registradas (incluida GET /admin/clientes)', () => {
    expect(rutas).toContainEqual({ metodo: 'get', ruta: '/api/v1/admin/clientes' });
  });

  it.each(rutas)('$metodo $ruta sin token → 401 NO_AUTENTICADO', async ({ metodo, ruta }) => {
    const res = await request(app)[metodo](ruta).send({});
    expect(res.status).toBe(401);
    expect((res.body as { error: { codigo: string } }).error.codigo).toBe('NO_AUTENTICADO');
  });

  it.each(rutas)('$metodo $ruta con token de CLIENTE → 403 PROHIBIDO', async ({ metodo, ruta }) => {
    const res = await request(app)
      [metodo](ruta)
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { codigo: 'PROHIBIDO', mensaje: 'No tienes permiso para realizar esta acción.' },
    });
  });

  it('una ruta inexistente bajo /admin tampoco se revela: 401 sin token y 403 a un cliente', async () => {
    const sinToken = await request(app).get('/api/v1/admin/no-existe');
    const conCliente = await request(app)
      .get('/api/v1/admin/no-existe')
      .set('Authorization', `Bearer ${tokenCliente}`);
    expect([sinToken.status, conCliente.status]).toEqual([401, 403]);
  });

  it('un token de ADMIN pasa la protección (una ruta inexistente da 404, no 401/403)', async () => {
    const tokenAdmin = tokens.firmar({ id: ID, rol: 'ADMIN' }).token;
    const res = await request(app)
      .get('/api/v1/admin/no-existe')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
  });
});

describe('crearAdminRouter protege también los módulos nuevos sin que los repitan', () => {
  // Un módulo futuro "olvidadizo": no añade auth ni requireRole.
  const moduloNuevo = {
    prefijo: '/ejemplo' as const,
    crearRouter: () => {
      const router = Router();
      router.delete('/:id', (_req, res) => {
        res.json({ borrado: true });
      });
      return router;
    },
  };
  const app = crearAppDePrueba(
    Router().use('/admin', crearAdminRouter(dependencias, [moduloNuevo])),
  );

  it.each([
    ['sin token', undefined, 401],
    ['con token de CLIENTE', tokens.firmar({ id: ID, rol: 'CLIENTE' }).token, 403],
    ['con token de ADMIN', tokens.firmar({ id: ID, rol: 'ADMIN' }).token, 200],
  ])('%s → %i', async (_caso, token, estado) => {
    const peticion = request(app).delete(`/admin/ejemplo/${ID}`);
    const res = await (token ? peticion.set('Authorization', `Bearer ${token}`) : peticion);
    expect(res.status).toBe(estado);
  });
});

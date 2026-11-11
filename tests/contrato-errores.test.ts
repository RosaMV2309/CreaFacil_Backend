/**
 * Contrato de errores de la API (RNF-02, RNF-07): todas las respuestas de error son JSON con la forma
 * `{ "error": { "codigo", "mensaje", "detalles?" } }` y el código HTTP correcto.
 * Se prueban de punta a punta contra la app real (sin base de datos) y, para auth/requireRole,
 * con rutas montadas solo en la prueba. Las mismas comprobaciones están en la colección de Postman.
 */
import { Router, type Request, type Response } from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { crearApp } from '../src/app.js';
import { manejadorErrores } from '../src/shared/errors/index.js';
import { auth, guardarUsuario } from '../src/shared/middlewares/auth.js';
import { requireRole } from '../src/shared/middlewares/require-role.js';
import { crearAppDePrueba, crearPrismaSinBaseDatos, envDePrueba } from './helpers.js';

interface CuerpoError {
  error: { codigo: string; mensaje: string; detalles?: unknown[] };
}

const prisma = crearPrismaSinBaseDatos();
const app = crearApp(envDePrueba, { prisma });

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Comprueba la forma común de todas las respuestas de error. */
function esperarError(res: request.Response, estado: number, codigo: string): CuerpoError {
  expect(res.status).toBe(estado);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  const cuerpo = res.body as CuerpoError;
  expect(cuerpo.error.codigo).toBe(codigo);
  expect(typeof cuerpo.error.mensaje).toBe('string');
  expect(cuerpo.error.mensaje.length).toBeGreaterThan(0);
  return cuerpo;
}

describe('404 RUTA_NO_ENCONTRADA', () => {
  it.each(['get', 'post', 'put', 'patch', 'delete'] as const)(
    'responde 404 en JSON también con %s',
    async (metodo) => {
      const res = await request(app)[metodo]('/api/v1/no-existe');
      const cuerpo = esperarError(res, 404, 'RUTA_NO_ENCONTRADA');
      expect(cuerpo.error.mensaje).toBe(
        `No existe la ruta ${metodo.toUpperCase()} /api/v1/no-existe`,
      );
    },
  );

  it('responde 404 en JSON fuera del prefijo /api/v1', async () => {
    const res = await request(app).get('/');
    esperarError(res, 404, 'RUTA_NO_ENCONTRADA');
  });
});

describe('400 JSON_INVALIDO', () => {
  it.each(['{malo', '{"a":', '[1,2', "{'comillas':'simples'}"])(
    'responde 400 con el cuerpo %j',
    async (cuerpo) => {
      const res = await request(app)
        .post('/api/v1/health')
        .set('Content-Type', 'application/json')
        .send(cuerpo);
      esperarError(res, 400, 'JSON_INVALIDO');
    },
  );
});

describe('413 CUERPO_DEMASIADO_GRANDE', () => {
  it('responde 413 si el JSON supera el límite de 1 MB', async () => {
    const grande = JSON.stringify({ relleno: 'x'.repeat(1024 * 1024 + 10) });
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(grande);
    const cuerpo = esperarError(res, 413, 'CUERPO_DEMASIADO_GRANDE');
    expect(cuerpo.error.mensaje).toBe('El cuerpo de la petición supera el tamaño permitido.');
  });

  it('acepta un cuerpo por debajo del límite (y la ruta inexistente da 404, no 413)', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send({ relleno: 'x'.repeat(1000) });
    esperarError(res, 404, 'RUTA_NO_ENCONTRADA');
  });
});

describe('otros errores 4xx al leer el cuerpo', () => {
  it('responde 415 SOLICITUD_INVALIDA con un charset no soportado', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{"a":1}');
    esperarError(res, 415, 'SOLICITUD_INVALIDA');
  });
});

describe('500 ERROR_INTERNO', () => {
  it('no expone el mensaje ni la pila y lo registra en el servidor', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rutas = Router();
    rutas.get('/fallo', () => {
      throw new TypeError('Cannot read properties of undefined (password)');
    });

    const res = await request(crearAppDePrueba(rutas)).get('/fallo');

    esperarError(res, 500, 'ERROR_INTERNO');
    expect(res.text).not.toMatch(/password|TypeError|at /);
    expect(consola).toHaveBeenCalledOnce();
  });

  it('trata como 500 un valor lanzado que no es un Error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rutas = Router();
    rutas.get('/raro', () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- se prueba justo este caso
      throw 'cadena';
    });
    const res = await request(crearAppDePrueba(rutas)).get('/raro');
    esperarError(res, 500, 'ERROR_INTERNO');
  });

  it('si la respuesta ya empezó, delega en Express en lugar de responder otra vez', () => {
    const next = vi.fn();
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() };
    const error = new Error('a mitad de respuesta');

    manejadorErrores(error, {} as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('503 degradado en /health', () => {
  it('responde 503 con estado degradado y baseDatos error si PostgreSQL no está disponible', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ estado: 'degradado', baseDatos: 'error' });
    expect(res.body).not.toHaveProperty('error');
  });
});

describe('401 y 403 de auth y requireRole (esqueletos hasta RF-01/RF-02)', () => {
  const rutas = Router();
  rutas.get('/privada', auth, (_req, res) => {
    res.json({ ok: true });
  });
  rutas.get('/solo-admin-sin-auth', requireRole('ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  rutas.get(
    '/solo-admin-como-cliente',
    (_req, res, next) => {
      guardarUsuario(res, { id: 7, rol: 'CLIENTE' });
      next();
    },
    requireRole('ADMIN'),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  rutas.get(
    '/admin-o-cliente',
    (_req, res, next) => {
      guardarUsuario(res, { id: 7, rol: 'CLIENTE' });
      next();
    },
    requireRole('ADMIN', 'CLIENTE'),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  const appAuth = crearAppDePrueba(rutas);

  it.each([
    ['sin cabecera', undefined],
    ['con un esquema que no es Bearer', 'Basic dXN1YXJpbzpjbGF2ZQ=='],
    ['con Bearer vacío', 'Bearer '],
  ])('auth responde 401 NO_AUTENTICADO %s', async (_caso, cabecera) => {
    const peticion = request(appAuth).get('/privada');
    const res = await (cabecera === undefined ? peticion : peticion.set('Authorization', cabecera));
    const cuerpo = esperarError(res, 401, 'NO_AUTENTICADO');
    expect(cuerpo.error.mensaje).toBe('Debes iniciar sesión para continuar.');
  });

  it('auth nunca concede acceso todavía: con token responde 501 NO_IMPLEMENTADO', async () => {
    const res = await request(appAuth).get('/privada').set('Authorization', 'Bearer x.y.z');
    esperarError(res, 501, 'NO_IMPLEMENTADO');
  });

  it('requireRole sin persona autenticada responde 401 NO_AUTENTICADO', async () => {
    const res = await request(appAuth).get('/solo-admin-sin-auth');
    esperarError(res, 401, 'NO_AUTENTICADO');
  });

  it('requireRole responde 403 PROHIBIDO a un CLIENTE en una ruta de ADMIN (RN-05)', async () => {
    const res = await request(appAuth).get('/solo-admin-como-cliente');
    const cuerpo = esperarError(res, 403, 'PROHIBIDO');
    expect(cuerpo.error.mensaje).toBe('No tienes permiso para realizar esta acción.');
  });

  it('requireRole con varios roles deja pasar a cualquiera de ellos', async () => {
    const res = await request(appAuth).get('/admin-o-cliente');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

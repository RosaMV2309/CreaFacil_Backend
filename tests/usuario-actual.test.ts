import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { AppError } from '../src/shared/errors/index.js';
import { guardarUsuario } from '../src/shared/middlewares/auth.js';
import { exigirPropietario, idUsuarioActual } from '../src/shared/middlewares/usuario-actual.js';
import { crearAppDePrueba } from './helpers.js';

const ID = '3f2a6c1e-8b4d-4e5f-9a7b-1c2d3e4f5a6b';
const OTRO = '9b1d2c3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e';

describe('patrón RN-05: idUsuarioActual', () => {
  it('devuelve el id del token aunque la petición traiga otro id en la query o el cuerpo', async () => {
    const rutas = Router();
    rutas.post(
      '/mio',
      (_req, res, next) => {
        guardarUsuario(res, { id: ID, rol: 'CLIENTE' });
        next();
      },
      (_req, res) => {
        res.json({ id: idUsuarioActual(res) });
      },
    );
    const res = await request(crearAppDePrueba(rutas))
      .post(`/mio?usuarioId=${OTRO}`)
      .send({ id: OTRO, usuarioId: OTRO });
    expect(res.body).toEqual({ id: ID });
  });

  it('responde 401 si la ruta no pasó por auth', async () => {
    const rutas = Router();
    rutas.get('/mio', (_req, res) => {
      res.json({ id: idUsuarioActual(res) });
    });
    const res = await request(crearAppDePrueba(rutas)).get('/mio');
    expect(res.status).toBe(401);
  });
});

describe('patrón RN-05: exigirPropietario', () => {
  const pedido = { id: 'p1', usuarioId: ID, total: 10 };

  it('devuelve el recurso si es de la persona', () => {
    expect(exigirPropietario(pedido, ID)).toBe(pedido);
  });

  it.each([
    ['es de otra persona', pedido, OTRO],
    ['no existe (null)', null, ID],
    ['no existe (undefined)', undefined, ID],
  ])('lanza 404 NO_ENCONTRADO si %s (no revela que existe)', (_caso, recurso, usuarioId) => {
    let error: unknown;
    try {
      exigirPropietario(recurso, usuarioId);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppError);
    expect([(error as AppError).estado, (error as AppError).codigo]).toEqual([
      404,
      'NO_ENCONTRADO',
    ]);
    expect((error as AppError).message).toBe('El recurso solicitado no existe.');
  });

  it('acepta un mensaje propio', () => {
    expect(() => exigirPropietario(pedido, OTRO, 'El pedido no existe.')).toThrow(
      'El pedido no existe.',
    );
  });
});

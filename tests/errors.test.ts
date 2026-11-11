import { Router } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError, normalizarError } from '../src/shared/errors/index.js';
import { crearAppDePrueba, crearAppSinBaseDatos } from './helpers.js';

const app = crearAppSinBaseDatos();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rutas inexistentes', () => {
  it('responde 404 RUTA_NO_ENCONTRADA en JSON', async () => {
    const res = await request(app).get('/api/v1/no-existe');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      error: {
        codigo: 'RUTA_NO_ENCONTRADA',
        mensaje: 'No existe la ruta GET /api/v1/no-existe',
      },
    });
  });

  it('incluye el método en el mensaje y no la query string', async () => {
    const res = await request(app).delete('/api/v1/otra?x=1');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'No existe la ruta DELETE /api/v1/otra' },
    });
  });
});

describe('JSON mal formado', () => {
  it('responde 400 JSON_INVALIDO', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{malo');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la petición no es un JSON válido.' },
    });
  });
});

describe('manejador central de errores', () => {
  it('convierte un error inesperado en 500 ERROR_INTERNO sin filtrar detalles internos', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rutas = Router();
    rutas.get('/explota', () => {
      throw new Error('detalle interno secreto');
    });

    const res = await request(crearAppDePrueba(rutas)).get('/explota');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        codigo: 'ERROR_INTERNO',
        mensaje: 'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.',
      },
    });
    expect(JSON.stringify(res.body)).not.toContain('secreto');
    expect(consola).toHaveBeenCalledOnce();
  });

  it('también captura los errores de controladores async (Express 5)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rutas = Router();
    rutas.get('/async', async () => {
      await Promise.resolve();
      throw new Error('fallo asíncrono');
    });

    const res = await request(crearAppDePrueba(rutas)).get('/async');
    expect(res.status).toBe(500);
    expect((res.body as { error: { codigo: string } }).error.codigo).toBe('ERROR_INTERNO');
  });

  it('responde con el estado y el código de un AppError', async () => {
    const rutas = Router();
    rutas.get('/conflicto', () => {
      throw AppError.conflicto('El pedido ya fue entregado.', [{ mensaje: 'Estado: ENTREGADO' }]);
    });

    const res = await request(crearAppDePrueba(rutas)).get('/conflicto');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        codigo: 'CONFLICTO',
        mensaje: 'El pedido ya fue entregado.',
        detalles: [{ mensaje: 'Estado: ENTREGADO' }],
      },
    });
  });
});

describe('AppError', () => {
  it.each([
    [AppError.noAutorizado(), 401, 'NO_AUTENTICADO'],
    [AppError.prohibido(), 403, 'PROHIBIDO'],
    [AppError.noEncontrado(), 404, 'NO_ENCONTRADO'],
    [AppError.validacion([{ campo: 'x', mensaje: 'mal' }]), 400, 'VALIDACION'],
    [AppError.conflicto('choque'), 409, 'CONFLICTO'],
    [AppError.noImplementado(), 501, 'NO_IMPLEMENTADO'],
  ])('la fábrica crea el estado y el código correctos (%#)', (error, estado, codigo) => {
    expect(error).toBeInstanceOf(Error);
    expect(error.estado).toBe(estado);
    expect(error.codigo).toBe(codigo);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('normalizarError traduce el error de cuerpo demasiado grande a 413', () => {
    const error = normalizarError({ type: 'entity.too.large', status: 413 });
    expect(error.estado).toBe(413);
    expect(error.codigo).toBe('CUERPO_DEMASIADO_GRANDE');
  });
});

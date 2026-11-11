import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { crearApp } from '../src/app.js';
import {
  crearHealthRepository,
  type HealthRepository,
} from '../src/modules/health/health.repository.js';
import {
  crearHealthService,
  describirError,
  type Reloj,
} from '../src/modules/health/health.service.js';
import type { PrismaClient } from '../src/shared/database/prisma.js';
import { crearPrismaSinBaseDatos, envDePrueba } from './helpers.js';

const info = { servicio: 'CreaFácil API', version: '9.9.9', entorno: 'production' };
const relojFijo: Reloj = {
  ahora: () => new Date('2026-11-09T12:00:00.000Z'),
  tiempoActividadSegundos: () => 42.9,
};

function repositorio(comprobar: () => Promise<void>): HealthRepository {
  return { comprobarBaseDatos: comprobar };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('crearHealthService (repositorio simulado)', () => {
  it('devuelve estado ok y baseDatos ok cuando la base de datos responde', async () => {
    const registrarError = vi.fn();
    const servicio = crearHealthService(
      info,
      repositorio(() => Promise.resolve()),
      { reloj: relojFijo, registrarError },
    );

    await expect(servicio.obtenerEstado()).resolves.toEqual({
      estado: 'ok',
      servicio: 'CreaFácil API',
      version: '9.9.9',
      entorno: 'production',
      baseDatos: 'ok',
      marcaTiempo: '2026-11-09T12:00:00.000Z',
      tiempoActividadSegundos: 42,
    });
    expect(registrarError).not.toHaveBeenCalled();
  });

  it('devuelve degradado y baseDatos error si el repositorio falla, sin exponer el motivo', async () => {
    const registrarError = vi.fn();
    const servicio = crearHealthService(
      info,
      repositorio(() => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432'))),
      { reloj: relojFijo, registrarError },
    );

    const estado = await servicio.obtenerEstado();

    expect(estado).toMatchObject({ estado: 'degradado', baseDatos: 'error' });
    expect(JSON.stringify(estado)).not.toContain('ECONNREFUSED');
    // El motivo solo va al registro del servidor.
    expect(registrarError).toHaveBeenCalledWith('connect ECONNREFUSED 127.0.0.1:5432');
  });

  it('devuelve degradado si la base de datos no responde dentro del tiempo límite', async () => {
    const registrarError = vi.fn();
    const servicio = crearHealthService(
      info,
      repositorio(() => new Promise<void>(() => undefined)),
      { reloj: relojFijo, registrarError, tiempoLimiteMs: 20 },
    );

    await expect(servicio.obtenerEstado()).resolves.toMatchObject({
      estado: 'degradado',
      baseDatos: 'error',
    });
    expect(registrarError).toHaveBeenCalledWith('sin respuesta en 20 ms');
  });
});

describe('describirError', () => {
  it('incluye el código del error de Prisma cuando el mensaje no trae el motivo', () => {
    const error = Object.assign(new Error('\nInvalid `prisma.$queryRaw()` invocation:\n\n\n'), {
      code: 'ECONNREFUSED',
    });
    expect(describirError(error)).toBe('[ECONNREFUSED] Invalid `prisma.$queryRaw()` invocation:');
  });

  it('usa la primera línea del mensaje si no hay código', () => {
    expect(describirError(new Error('sin respuesta en 20 ms\nmás detalle'))).toBe(
      'sin respuesta en 20 ms',
    );
    expect(describirError('texto')).toBe('texto');
  });
});

describe('crearHealthRepository', () => {
  it('comprueba la base de datos con SELECT 1', async () => {
    const consulta = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const prisma = { $queryRaw: consulta } as unknown as Pick<PrismaClient, '$queryRaw'>;

    await crearHealthRepository(prisma).comprobarBaseDatos();

    expect(consulta).toHaveBeenCalledTimes(1);
    const [plantilla] = consulta.mock.calls[0] as [TemplateStringsArray];
    expect(plantilla.join('')).toBe('SELECT 1');
  });

  it('propaga el error si la consulta falla', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('sin conexión')),
    } as unknown as Pick<PrismaClient, '$queryRaw'>;

    await expect(crearHealthRepository(prisma).comprobarBaseDatos()).rejects.toThrow(
      'sin conexión',
    );
  });
});

describe('GET /api/v1/health sin base de datos', () => {
  const prisma = crearPrismaSinBaseDatos();
  const app = crearApp(envDePrueba, { prisma });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('responde 503 con estado degradado y baseDatos error, sin detalles internos', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      estado: 'degradado',
      servicio: 'CreaFácil API',
      version: '0.1.0',
      entorno: 'test',
      baseDatos: 'error',
      marcaTiempo: expect.any(String) as unknown,
      tiempoActividadSegundos: expect.any(Number) as unknown,
    });
    expect(res.text).not.toMatch(/5999|ECONNREFUSED|clave|prisma/i);
    expect(consola).toHaveBeenCalled();
  });
});

import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { crearApp } from '../../src/app.js';
import { crearPrismaDePrueba, envDeIntegracion } from './base-datos.js';

describe('GET /api/v1/health con PostgreSQL (integración)', () => {
  const prisma = crearPrismaDePrueba();
  const app = crearApp(envDeIntegracion(), { prisma });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('responde 200 con estado ok y baseDatos ok', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      estado: 'ok',
      servicio: 'CreaFácil API',
      version: '0.1.0',
      entorno: 'test',
      baseDatos: 'ok',
      marcaTiempo: expect.any(String) as unknown,
      tiempoActividadSegundos: expect.any(Number) as unknown,
    });
    const cuerpo = res.body as { marcaTiempo: string; tiempoActividadSegundos: number };
    expect(new Date(cuerpo.marcaTiempo).toISOString()).toBe(cuerpo.marcaTiempo);
    expect(cuerpo.tiempoActividadSegundos).toBeGreaterThanOrEqual(0);
  });
});

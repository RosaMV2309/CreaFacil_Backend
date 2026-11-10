import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { crearApp } from '../src/app.js';
import { crearHealthService } from '../src/modules/health/health.service.js';
import { envDePrueba } from './helpers.js';

const app = crearApp(envDePrueba);

describe('GET /api/v1/health', () => {
  it('responde 200 con el estado de la API en JSON', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      estado: 'ok',
      servicio: 'CreaFácil API',
      version: '0.1.0',
      entorno: 'test',
      marcaTiempo: expect.any(String) as unknown,
      tiempoActividadSegundos: expect.any(Number) as unknown,
    });
    const cuerpo = res.body as { marcaTiempo: string; tiempoActividadSegundos: number };
    expect(new Date(cuerpo.marcaTiempo).toISOString()).toBe(cuerpo.marcaTiempo);
    expect(cuerpo.tiempoActividadSegundos).toBeGreaterThanOrEqual(0);
  });
});

describe('crearHealthService', () => {
  it('calcula el estado con el reloj inyectado (sin depender de Express)', () => {
    const servicio = crearHealthService(
      { servicio: 'CreaFácil API', version: '9.9.9', entorno: 'production' },
      { ahora: () => new Date('2026-11-09T12:00:00.000Z'), tiempoActividadSegundos: () => 42.9 },
    );

    expect(servicio.obtenerEstado()).toEqual({
      estado: 'ok',
      servicio: 'CreaFácil API',
      version: '9.9.9',
      entorno: 'production',
      marcaTiempo: '2026-11-09T12:00:00.000Z',
      tiempoActividadSegundos: 42,
    });
  });
});

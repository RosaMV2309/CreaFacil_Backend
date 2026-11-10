import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { crearApp } from '../src/app.js';
import { cargarEnv } from '../src/config/env.js';

const app = crearApp(
  cargarEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://usuario:clave@localhost:5432/creafacil_test',
    JWT_SECRET: 'x'.repeat(32),
  }),
);

describe('app', () => {
  it('responde con la información de la API en JSON', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ nombre: 'CreaFácil API', version: '0.1.0' });
  });

  it('aplica cabeceras de seguridad y oculta x-powered-by', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

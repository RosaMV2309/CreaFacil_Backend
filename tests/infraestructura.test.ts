/**
 * Piezas de infraestructura (RNF-07): registro de peticiones y cliente Prisma único.
 * No necesitan base de datos: crear un cliente Prisma no abre conexiones.
 */
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { crearApp } from '../src/app.js';
import { cargarEnv } from '../src/config/env.js';
import { desconectarPrisma, obtenerPrisma } from '../src/shared/database/prisma.js';
import { crearPrismaSinBaseDatos, URL_SIN_BASE_DATOS } from './helpers.js';

afterEach(async () => {
  vi.restoreAllMocks();
  await desconectarPrisma();
});

describe('registro de peticiones (fuera de NODE_ENV=test)', () => {
  const envDesarrollo = cargarEnv({
    NODE_ENV: 'development',
    DATABASE_URL: URL_SIN_BASE_DATOS,
    JWT_SECRET: 'x'.repeat(32),
  });

  it('registra método, ruta sin query, estado y duración; nunca cabeceras (RNF-01)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const app = crearApp(envDesarrollo, { prisma: crearPrismaSinBaseDatos() });

    await request(app).get('/api/v1?token=secreto').set('Authorization', 'Bearer token-secreto');

    expect(info).toHaveBeenCalledOnce();
    const [linea] = info.mock.calls[0] as [string];
    expect(linea).toMatch(/^GET \/api\/v1 200 \d+\.\d ms$/);
    expect(linea).not.toContain('secreto');
  });

  it('no registra nada en NODE_ENV=test', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const app = crearApp(
      cargarEnv({ NODE_ENV: 'test', DATABASE_URL: URL_SIN_BASE_DATOS, JWT_SECRET: 'x'.repeat(32) }),
      { prisma: crearPrismaSinBaseDatos() },
    );
    await request(app).get('/api/v1');
    expect(info).not.toHaveBeenCalled();
  });
});

describe('cliente Prisma único', () => {
  it('obtenerPrisma devuelve siempre el mismo cliente', () => {
    const primero = obtenerPrisma(URL_SIN_BASE_DATOS);
    expect(obtenerPrisma(URL_SIN_BASE_DATOS)).toBe(primero);
  });

  it('desconectarPrisma lo cierra y el siguiente obtenerPrisma crea uno nuevo', async () => {
    const primero = obtenerPrisma(URL_SIN_BASE_DATOS);
    await desconectarPrisma();
    expect(obtenerPrisma(URL_SIN_BASE_DATOS)).not.toBe(primero);
  });

  it('desconectarPrisma no falla si no hay cliente', async () => {
    await desconectarPrisma();
    await expect(desconectarPrisma()).resolves.toBeUndefined();
  });
});

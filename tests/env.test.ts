import { describe, expect, it } from 'vitest';

import { cargarEnv } from '../src/config/env.js';

const envValido = {
  DATABASE_URL: 'postgresql://usuario:clave@localhost:5432/creafacil',
  JWT_SECRET: 'x'.repeat(32),
};

describe('cargarEnv', () => {
  it('acepta una configuración válida y aplica valores por defecto', () => {
    const env = cargarEnv(envValido);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGIN).toEqual(['http://localhost:5000']);
  });

  it('separa varios orígenes de CORS', () => {
    const env = cargarEnv({ ...envValido, CORS_ORIGIN: 'http://a.com, http://b.com' });
    expect(env.CORS_ORIGIN).toEqual(['http://a.com', 'http://b.com']);
  });

  it('falla con un mensaje claro si falta DATABASE_URL', () => {
    expect(() => cargarEnv({ JWT_SECRET: envValido.JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('rechaza un JWT_SECRET demasiado corto', () => {
    expect(() => cargarEnv({ ...envValido, JWT_SECRET: 'corto' })).toThrow(/32 caracteres/);
  });
});

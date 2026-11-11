import { describe, expect, it } from 'vitest';

import { cargarEnv, cargarEnvSeed } from '../src/config/env.js';

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

  it('no exige las variables ADMIN_* (solo las usa el seed)', () => {
    expect(() => cargarEnv(envValido)).not.toThrow();
  });
});

describe('cargarEnvSeed', () => {
  const envSeed = {
    DATABASE_URL: envValido.DATABASE_URL,
    ADMIN_EMAIL: '  Admin@CreaFacil.Local ',
    ADMIN_PASSWORD: 'Segura-2026',
  };

  it('normaliza el correo y aplica el nombre por defecto', () => {
    const env = cargarEnvSeed(envSeed);
    expect(env.ADMIN_EMAIL).toBe('admin@creafacil.local');
    expect(env.ADMIN_NOMBRE).toBe('Administradora');
  });

  it('exige ADMIN_EMAIL y ADMIN_PASSWORD', () => {
    expect(() => cargarEnvSeed({ DATABASE_URL: envValido.DATABASE_URL })).toThrow(
      /ADMIN_EMAIL es obligatoria[\s\S]*ADMIN_PASSWORD es obligatoria/,
    );
  });

  it('rechaza un correo inválido', () => {
    expect(() => cargarEnvSeed({ ...envSeed, ADMIN_EMAIL: 'no-es-un-correo' })).toThrow(
      /correo electrónico válido/,
    );
  });

  it('rechaza una contraseña de menos de 8 caracteres', () => {
    expect(() => cargarEnvSeed({ ...envSeed, ADMIN_PASSWORD: 'corta' })).toThrow(/8 caracteres/);
  });

  it('rechaza una contraseña de más de 72 caracteres (límite de bcrypt)', () => {
    expect(() => cargarEnvSeed({ ...envSeed, ADMIN_PASSWORD: 'x'.repeat(73) })).toThrow(/72/);
  });
});

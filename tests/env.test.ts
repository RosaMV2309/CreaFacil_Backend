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

  it('JWT_EXPIRES_IN es 8h por defecto y acepta otras duraciones válidas', () => {
    expect(cargarEnv(envValido).JWT_EXPIRES_IN).toBe('8h');
    expect(cargarEnv({ ...envValido, JWT_EXPIRES_IN: '30m' }).JWT_EXPIRES_IN).toBe('30m');
  });

  it.each(['ocho horas', '0h', '8x'])('rechaza JWT_EXPIRES_IN=%j', (valor) => {
    expect(() => cargarEnv({ ...envValido, JWT_EXPIRES_IN: valor })).toThrow(/JWT_EXPIRES_IN/);
  });

  it('límite de inicio de sesión: 5 intentos cada 15 minutos por defecto', () => {
    const env = cargarEnv(envValido);
    expect(env.LOGIN_MAX_INTENTOS).toBe(5);
    expect(env.LOGIN_VENTANA_MINUTOS).toBe(15);
  });

  it('en NODE_ENV=test el límite por defecto es alto para no bloquear las pruebas', () => {
    expect(cargarEnv({ ...envValido, NODE_ENV: 'test' }).LOGIN_MAX_INTENTOS).toBe(1000);
  });

  it('LOGIN_MAX_INTENTOS y LOGIN_VENTANA_MINUTOS se configuran por variables (también en test)', () => {
    const env = cargarEnv({
      ...envValido,
      NODE_ENV: 'test',
      LOGIN_MAX_INTENTOS: '2',
      LOGIN_VENTANA_MINUTOS: '1',
    });
    expect(env.LOGIN_MAX_INTENTOS).toBe(2);
    expect(env.LOGIN_VENTANA_MINUTOS).toBe(1);
  });

  it.each([
    ['LOGIN_MAX_INTENTOS', '0', /LOGIN_MAX_INTENTOS debe ser al menos 1/],
    ['LOGIN_MAX_INTENTOS', 'muchos', /LOGIN_MAX_INTENTOS debe ser un número entero/],
    ['LOGIN_MAX_INTENTOS', '2.5', /LOGIN_MAX_INTENTOS debe ser un número entero/],
    ['LOGIN_VENTANA_MINUTOS', '0', /LOGIN_VENTANA_MINUTOS debe ser al menos 1/],
    ['LOGIN_VENTANA_MINUTOS', '2000', /LOGIN_VENTANA_MINUTOS no puede superar 1440/],
  ])('rechaza %s=%j con un mensaje claro', (variable, valor, mensaje) => {
    expect(() => cargarEnv({ ...envValido, [variable]: valor })).toThrow(mensaje);
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

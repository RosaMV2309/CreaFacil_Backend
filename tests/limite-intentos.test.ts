import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import {
  crearLimitadorLogin,
  mensajeDemasiadosIntentos,
  minutosRestantes,
} from '../src/shared/middlewares/limite-intentos.js';
import { AppError } from '../src/shared/errors/index.js';
import { crearAppDePrueba, crearAppSinBaseDatos } from './helpers.js';

describe('límite de intentos de inicio de sesión (RNF-01)', () => {
  it('minutosRestantes redondea hacia arriba y nunca baja de 1', () => {
    const ahora = 1_000_000;
    expect(minutosRestantes(new Date(ahora + 14 * 60_000 + 1), ahora)).toBe(15);
    expect(minutosRestantes(new Date(ahora + 1000), ahora)).toBe(1);
    expect(minutosRestantes(new Date(ahora - 1000), ahora)).toBe(1);
    expect(minutosRestantes(undefined, ahora)).toBe(1);
  });

  it('el mensaje usa singular o plural', () => {
    expect(mensajeDemasiadosIntentos(1)).toBe(
      'Demasiados intentos de inicio de sesión. Inténtalo de nuevo en 1 minuto.',
    );
    expect(mensajeDemasiadosIntentos(15)).toMatch(/en 15 minutos\.$/);
  });

  function appConLimite(maxIntentos: number, estado: number) {
    const rutas = Router();
    rutas.post(
      '/login',
      crearLimitadorLogin({ maxIntentos, ventanaMinutos: 1 }),
      (_req, res, next) => {
        if (estado >= 400) {
          next(AppError.noAutorizado('Correo o contraseña incorrectos.', 'CREDENCIALES_INVALIDAS'));
          return;
        }
        res.status(estado).json({ ok: true });
      },
    );
    return crearAppDePrueba(rutas);
  }

  it('responde 429 DEMASIADOS_INTENTOS con Retry-After y RateLimit al superar el límite', async () => {
    const app = appConLimite(1, 401);
    expect((await request(app).post('/login')).status).toBe(401);
    const res = await request(app).post('/login');

    expect(res.status).toBe(429);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      error: {
        codigo: 'DEMASIADOS_INTENTOS',
        mensaje: 'Demasiados intentos de inicio de sesión. Inténtalo de nuevo en 1 minuto.',
      },
    });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.headers.ratelimit).toMatch(/"inicio-sesion"; ?r=0/);
    expect(res.headers['ratelimit-policy']).toMatch(/q=1; ?w=60/);
  });

  it('las peticiones correctas no cuentan como intentos', async () => {
    const app = appConLimite(1, 200);
    for (let i = 0; i < 4; i++) {
      expect((await request(app).post('/login')).status).toBe(200);
    }
  });

  it('la app real expone Retry-After y RateLimit a las apps web (CORS)', async () => {
    const res = await request(crearAppSinBaseDatos())
      .get('/api/v1')
      .set('Origin', 'http://localhost:5000');
    expect(res.headers['access-control-expose-headers']).toBe(
      'Retry-After,RateLimit,RateLimit-Policy',
    );
  });
});

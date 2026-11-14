import { Router } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import {
  crearAuth,
  exigirUsuario,
  extraerToken,
  guardarUsuario,
  type Rol,
  usuarioAutenticado,
} from '../src/shared/middlewares/auth.js';
import { requireRole } from '../src/shared/middlewares/require-role.js';
import { AUDIENCIA_JWT, crearServicioTokens, EMISOR_JWT } from '../src/shared/security/tokens.js';
import { crearAppDePrueba } from './helpers.js';

const SECRETO = 'k'.repeat(32);
const ID = '3f2a6c1e-8b4d-4e5f-9a7b-1c2d3e4f5a6b';

interface CuerpoError {
  error: { codigo: string; mensaje: string };
}

describe('extraerToken', () => {
  it('lee el token de una cabecera Bearer', () => {
    expect(extraerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('acepta el esquema en minúsculas', () => {
    expect(extraerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it.each([undefined, '', 'abc', 'Basic xyz', 'Bearer'])('devuelve null con %j', (cabecera) => {
    expect(extraerToken(cabecera)).toBeNull();
  });
});

describe('middleware auth con JWT (RF-01, RNF-01)', () => {
  let ahora = new Date('2026-11-13T12:00:00.000Z').getTime();
  const tokens = crearServicioTokens({
    secreto: SECRETO,
    duracion: '8h',
    reloj: () => new Date(ahora),
  });

  const rutas = Router();
  rutas.get('/privada', crearAuth(tokens), (_req, res) => {
    res.json({ usuario: exigirUsuario(res) });
  });
  const app = crearAppDePrueba(rutas);

  it('con un token válido deja pasar y guarda el id (UUID en texto) y el rol', async () => {
    const { token } = tokens.firmar({ id: ID, rol: 'CLIENTE' });
    const res = await request(app).get('/privada').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ usuario: { id: ID, rol: 'CLIENTE' } });
    expect(typeof (res.body as { usuario: { id: unknown } }).usuario.id).toBe('string');
  });

  it.each([
    ['sin cabecera', undefined],
    ['con un esquema que no es Bearer', 'Basic dXN1YXJpbzpjbGF2ZQ=='],
    ['con Bearer vacío', 'Bearer '],
  ])('responde 401 NO_AUTENTICADO %s', async (_caso, cabecera) => {
    const peticion = request(app).get('/privada');
    const res = await (cabecera === undefined ? peticion : peticion.set('Authorization', cabecera));
    expect(res.status).toBe(401);
    expect((res.body as CuerpoError).error).toEqual({
      codigo: 'NO_AUTENTICADO',
      mensaje: 'Debes iniciar sesión para continuar.',
    });
  });

  it('responde 401 TOKEN_INVALIDO con un token firmado con otro secreto', async () => {
    const falso = jwt.sign({ rol: 'ADMIN' }, 'otro'.repeat(10), {
      algorithm: 'HS256',
      subject: ID,
      issuer: EMISOR_JWT,
      audience: AUDIENCIA_JWT,
    });
    const res = await request(app).get('/privada').set('Authorization', `Bearer ${falso}`);
    expect(res.status).toBe(401);
    expect((res.body as CuerpoError).error.codigo).toBe('TOKEN_INVALIDO');
  });

  it('responde 401 TOKEN_INVALIDO con un token alterado', async () => {
    const { token } = tokens.firmar({ id: ID, rol: 'CLIENTE' });
    const alterado = `${token.slice(0, -2)}${token.endsWith('aa') ? 'bb' : 'aa'}`;
    const res = await request(app).get('/privada').set('Authorization', `Bearer ${alterado}`);
    expect(res.status).toBe(401);
    expect((res.body as CuerpoError).error.codigo).toBe('TOKEN_INVALIDO');
  });

  it('responde 401 TOKEN_EXPIRADO cuando pasan las 8 horas, sin registrar el token', async () => {
    const consola = vi.spyOn(console, 'error');
    const { token } = tokens.firmar({ id: ID, rol: 'CLIENTE' });
    ahora += 8 * 3600 * 1000;
    const res = await request(app).get('/privada').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect((res.body as CuerpoError).error).toEqual({
      codigo: 'TOKEN_EXPIRADO',
      mensaje: 'Tu sesión ha expirado. Inicia sesión de nuevo.',
    });
    // Es una respuesta prevista: no se registra como fallo (ni el token en los logs, RNF-01).
    expect(consola).not.toHaveBeenCalled();
    consola.mockRestore();
  });
});

describe('exigirUsuario', () => {
  it('lanza 401 si la ruta no pasó por auth', async () => {
    const rutas = Router();
    rutas.get('/sin-auth', (_req, res) => {
      res.json(exigirUsuario(res));
    });
    const res = await request(crearAppDePrueba(rutas)).get('/sin-auth');
    expect(res.status).toBe(401);
    expect((res.body as CuerpoError).error.codigo).toBe('NO_AUTENTICADO');
  });

  it('usuarioAutenticado devuelve null si no hay persona guardada', async () => {
    const rutas = Router();
    rutas.get('/x', (_req, res) => {
      res.json({ usuario: usuarioAutenticado(res) });
    });
    const res = await request(crearAppDePrueba(rutas)).get('/x');
    expect(res.body).toEqual({ usuario: null });
  });
});

describe('requireRole', () => {
  function appConRol(rol: Rol | null) {
    const rutas = Router();
    rutas.get(
      '/admin',
      (_req, res, next) => {
        if (rol) {
          guardarUsuario(res, { id: ID, rol });
        }
        next();
      },
      requireRole('ADMIN'),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    return crearAppDePrueba(rutas);
  }

  it('responde 401 si no hay persona autenticada', async () => {
    const res = await request(appConRol(null)).get('/admin');
    expect(res.status).toBe(401);
  });

  it('responde 403 PROHIBIDO a un CLIENTE en una ruta de ADMIN (RN-05)', async () => {
    const res = await request(appConRol('CLIENTE')).get('/admin');
    expect(res.status).toBe(403);
    expect((res.body as CuerpoError).error.codigo).toBe('PROHIBIDO');
  });

  it('deja pasar a una ADMIN', async () => {
    const res = await request(appConRol('ADMIN')).get('/admin');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('con el rol del token: un token de CLIENTE recibe 403 y uno de ADMIN pasa', async () => {
    const tokens = crearServicioTokens({ secreto: SECRETO, duracion: '1h' });
    const rutas = Router();
    rutas.get('/admin', crearAuth(tokens), requireRole('ADMIN'), (_req, res) => {
      res.json({ ok: true });
    });
    const app = crearAppDePrueba(rutas);
    const cliente = tokens.firmar({ id: ID, rol: 'CLIENTE' }).token;
    const admin = tokens.firmar({ id: ID, rol: 'ADMIN' }).token;

    expect(
      (await request(app).get('/admin').set('Authorization', `Bearer ${cliente}`)).status,
    ).toBe(403);
    expect((await request(app).get('/admin').set('Authorization', `Bearer ${admin}`)).status).toBe(
      200,
    );
  });
});

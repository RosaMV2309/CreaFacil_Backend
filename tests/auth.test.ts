import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { auth, extraerToken, guardarUsuario, type Rol } from '../src/shared/middlewares/auth.js';
import { requireRole } from '../src/shared/middlewares/require-role.js';
import { crearAppDePrueba } from './helpers.js';

describe('extraerToken', () => {
  it('lee el token de una cabecera Bearer', () => {
    expect(extraerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it.each([undefined, '', 'abc', 'Basic xyz', 'Bearer'])('devuelve null con %j', (cabecera) => {
    expect(extraerToken(cabecera)).toBeNull();
  });
});

describe('auth (esqueleto hasta RF-01)', () => {
  const rutas = Router();
  rutas.get('/privada', auth, (_req, res) => {
    res.json({ ok: true });
  });
  const app = crearAppDePrueba(rutas);

  it('responde 401 NO_AUTENTICADO sin token', async () => {
    const res = await request(app).get('/privada');
    expect(res.status).toBe(401);
    expect((res.body as { error: { codigo: string } }).error.codigo).toBe('NO_AUTENTICADO');
  });

  it('nunca concede acceso todavía: con token responde 501 NO_IMPLEMENTADO', async () => {
    const res = await request(app).get('/privada').set('Authorization', 'Bearer cualquiera');
    expect(res.status).toBe(501);
    expect((res.body as { error: { codigo: string } }).error.codigo).toBe('NO_IMPLEMENTADO');
  });
});

describe('requireRole', () => {
  function appConRol(rol: Rol | null) {
    const rutas = Router();
    rutas.get(
      '/admin',
      (_req, res, next) => {
        if (rol) {
          guardarUsuario(res, { id: 1, rol });
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
    expect((res.body as { error: { codigo: string } }).error.codigo).toBe('PROHIBIDO');
  });

  it('deja pasar a una ADMIN', async () => {
    const res = await request(appConRol('ADMIN')).get('/admin');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

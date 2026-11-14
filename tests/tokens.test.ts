import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { AppError } from '../src/shared/errors/index.js';
import {
  AUDIENCIA_JWT,
  crearServicioTokens,
  duracionEnSegundos,
  EMISOR_JWT,
} from '../src/shared/security/tokens.js';

const SECRETO = 's'.repeat(32);
const ID = '3f2a6c1e-8b4d-4e5f-9a7b-1c2d3e4f5a6b';
const INICIO = new Date('2026-11-13T12:00:00.000Z');

/** Reloj controlable: `avanzar(segundos)` simula el paso del tiempo sin esperar. */
function relojFalso(inicio = INICIO) {
  let ahora = inicio.getTime();
  return {
    reloj: () => new Date(ahora),
    avanzar: (segundos: number) => {
      ahora += segundos * 1000;
    },
  };
}

function capturarError(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Se esperaba un AppError');
}

describe('duracionEnSegundos', () => {
  it.each([
    ['8h', 28_800],
    ['30m', 1800],
    ['45s', 45],
    ['1d', 86_400],
    ['900', 900],
  ])('%s = %i segundos', (duracion, segundos) => {
    expect(duracionEnSegundos(duracion)).toBe(segundos);
  });

  it.each(['', '0h', '8x', 'h', '-1h', '1.5h'])('rechaza %j', (duracion) => {
    expect(() => duracionEnSegundos(duracion)).toThrow(/Duración de token no válida/);
  });
});

describe('servicio de tokens JWT (RNF-01)', () => {
  it('firma un token HS256 con sub, rol, iss, aud y expiración de 8 h', () => {
    const { reloj } = relojFalso();
    const tokens = crearServicioTokens({ secreto: SECRETO, duracion: '8h', reloj });

    const { token, expiraEn } = tokens.firmar({ id: ID, rol: 'CLIENTE' });

    expect(expiraEn.toISOString()).toBe('2026-11-13T20:00:00.000Z');
    const decodificado = jwt.decode(token, { complete: true });
    expect(decodificado?.header.alg).toBe('HS256');
    expect(decodificado?.payload).toEqual({
      sub: ID,
      rol: 'CLIENTE',
      iss: EMISOR_JWT,
      aud: AUDIENCIA_JWT,
      iat: INICIO.getTime() / 1000,
      exp: INICIO.getTime() / 1000 + 8 * 3600,
    });
  });

  it('verifica su propio token y devuelve el id (UUID en texto) y el rol', () => {
    const tokens = crearServicioTokens({ secreto: SECRETO, duracion: '8h' });
    const { token } = tokens.firmar({ id: ID, rol: 'ADMIN' });

    const usuario = tokens.verificar(token);

    expect(usuario).toEqual({ id: ID, rol: 'ADMIN' });
    expect(typeof usuario.id).toBe('string');
  });

  it('sigue siendo válido un segundo antes de expirar y caduca justo al llegar a la expiración', () => {
    const { reloj, avanzar } = relojFalso();
    const tokens = crearServicioTokens({ secreto: SECRETO, duracion: '8h', reloj });
    const { token } = tokens.firmar({ id: ID, rol: 'CLIENTE' });

    avanzar(8 * 3600 - 1);
    expect(tokens.verificar(token).id).toBe(ID);

    avanzar(1);
    const error = capturarError(() => tokens.verificar(token));
    expect(error.estado).toBe(401);
    expect(error.codigo).toBe('TOKEN_EXPIRADO');
    expect(error.message).toBe('Tu sesión ha expirado. Inicia sesión de nuevo.');
  });

  const casosInvalidos: [string, () => string][] = [
    ['firmado con otro secreto', () => jwt.sign({ rol: 'ADMIN' }, 'o'.repeat(32), opciones())],
    [
      'alterado (rol cambiado sin volver a firmar)',
      () => {
        const tokens = crearServicioTokens({ secreto: SECRETO, duracion: '8h' });
        const [cabecera, , firma] = tokens.firmar({ id: ID, rol: 'CLIENTE' }).token.split('.');
        const payload = Buffer.from(
          JSON.stringify({ sub: ID, rol: 'ADMIN', iss: EMISOR_JWT, aud: AUDIENCIA_JWT }),
        ).toString('base64url');
        return `${cabecera ?? ''}.${payload}.${firma ?? ''}`;
      },
    ],
    [
      'con el algoritmo none',
      () => jwt.sign({ rol: 'ADMIN' }, '', { ...opciones(), algorithm: 'none' }),
    ],
    [
      'con HS512 en lugar de HS256',
      () => jwt.sign({ rol: 'ADMIN' }, SECRETO, { ...opciones(), algorithm: 'HS512' }),
    ],
    [
      'de otro emisor',
      () => jwt.sign({ rol: 'ADMIN' }, SECRETO, { ...opciones(), issuer: 'otra-api' }),
    ],
    [
      'para otra audiencia',
      () => jwt.sign({ rol: 'ADMIN' }, SECRETO, { ...opciones(), audience: 'otra' }),
    ],
    [
      'sin sub',
      () =>
        jwt.sign({ rol: 'ADMIN' }, SECRETO, {
          algorithm: 'HS256',
          issuer: EMISOR_JWT,
          audience: AUDIENCIA_JWT,
          expiresIn: '1h',
        }),
    ],
    [
      'con un sub que no es UUID',
      () => jwt.sign({ rol: 'ADMIN' }, SECRETO, { ...opciones(), subject: '1' }),
    ],
    ['con un rol desconocido', () => jwt.sign({ rol: 'SUPERADMIN' }, SECRETO, opciones())],
    ['que no es un JWT', () => 'esto-no-es-un-token'],
  ];

  function opciones(): jwt.SignOptions {
    return {
      algorithm: 'HS256',
      subject: ID,
      issuer: EMISOR_JWT,
      audience: AUDIENCIA_JWT,
      expiresIn: '1h',
    };
  }

  it.each(casosInvalidos)('rechaza con 401 TOKEN_INVALIDO un token %s', (_caso, generar) => {
    const tokens = crearServicioTokens({ secreto: SECRETO, duracion: '8h' });
    const error = capturarError(() => tokens.verificar(generar()));
    expect(error.estado).toBe(401);
    expect(error.codigo).toBe('TOKEN_INVALIDO');
    expect(error.message).toBe('El token de sesión no es válido. Inicia sesión de nuevo.');
  });

  it('usa el reloj del sistema si no se inyecta ninguno', () => {
    const tokens = crearServicioTokens({ secreto: SECRETO, duracion: '1h' });
    const antes = Date.now();
    const { expiraEn } = tokens.firmar({ id: ID, rol: 'CLIENTE' });
    expect(expiraEn.getTime()).toBeGreaterThanOrEqual(Math.floor(antes / 1000) * 1000 + 3600_000);
    expect(expiraEn.getTime()).toBeLessThanOrEqual(antes + 3600_000 + 1000);
  });

  it('falla al crearse con una duración no válida', () => {
    expect(() => crearServicioTokens({ secreto: SECRETO, duracion: 'ocho horas' })).toThrow(
      /Duración de token no válida/,
    );
  });
});

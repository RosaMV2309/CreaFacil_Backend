import { describe, expect, it, vi } from 'vitest';

import {
  type AuthRepository,
  crearAuthRepository,
  esCorreoDuplicado,
  type NuevoCliente,
  type UsuarioConCredenciales,
} from '../src/modules/auth/auth.repository.js';
import { esquemasLogin, esquemasRegistro } from '../src/modules/auth/auth.schemas.js';
import {
  type Contrasenas,
  crearAuthService,
  HASH_FICTICIO,
} from '../src/modules/auth/auth.service.js';
import type { PrismaClient } from '../src/shared/database/prisma.js';
import { AppError } from '../src/shared/errors/index.js';
import { crearServicioTokens } from '../src/shared/security/tokens.js';

const ID = '3f2a6c1e-8b4d-4e5f-9a7b-1c2d3e4f5a6b';
const tokens = crearServicioTokens({
  secreto: 'z'.repeat(32),
  duracion: '8h',
  reloj: () => new Date('2026-11-13T12:00:00.000Z'),
});

const cuenta: UsuarioConCredenciales = {
  id: ID,
  nombre: 'Ana',
  email: 'ana@creafacil.test',
  telefono: null,
  rol: 'CLIENTE',
  activo: true,
  passwordHash: 'hash:Clave-2026',
};

/** bcrypt falso e instantáneo: el "hash" es `hash:<contraseña>`. */
function contrasenasFalsas() {
  const verificar = vi.fn((password: string, hash: string) =>
    Promise.resolve(hash === `hash:${password}`),
  );
  return {
    generarHash: (password: string) => Promise.resolve(`hash:${password}`),
    verificar,
  };
}

function repositorioFalso(cambios: Partial<AuthRepository> = {}): AuthRepository {
  return {
    crearCliente: (datos) =>
      Promise.resolve({
        id: ID,
        nombre: datos.nombre,
        email: datos.email,
        telefono: datos.telefono,
        rol: 'CLIENTE',
      }),
    buscarCredenciales: (email) => Promise.resolve(email === cuenta.email ? cuenta : null),
    buscarPorId: (id) => Promise.resolve(id === ID ? cuenta : null),
    ...cambios,
  };
}

async function capturar(promesa: Promise<unknown>): Promise<AppError> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Se esperaba un AppError');
}

describe('servicio de autenticación', () => {
  it('registrar devuelve token Bearer, expiración ISO y solo los campos públicos', async () => {
    const falso = repositorioFalso();
    const crearCliente = vi.fn((datos: NuevoCliente) => falso.crearCliente(datos));
    const servicio = crearAuthService({
      repositorio: repositorioFalso({ crearCliente }),
      tokens,
      contrasenas: contrasenasFalsas(),
    });

    const sesion = await servicio.registrar({
      nombre: 'Ana',
      email: 'ana@creafacil.test',
      password: 'Clave-2026',
    });

    expect(crearCliente).toHaveBeenCalledWith({
      nombre: 'Ana',
      email: 'ana@creafacil.test',
      passwordHash: 'hash:Clave-2026',
      telefono: null,
    });
    expect(sesion.tipo).toBe('Bearer');
    expect(sesion.expiraEn).toBe('2026-11-13T20:00:00.000Z');
    expect(sesion.usuario).toEqual({
      id: ID,
      nombre: 'Ana',
      email: 'ana@creafacil.test',
      telefono: null,
      rol: 'CLIENTE',
    });
    expect(tokens.verificar(sesion.token)).toEqual({ id: ID, rol: 'CLIENTE' });
  });

  it('registrar con un correo existente lanza 409 CONFLICTO', async () => {
    const servicio = crearAuthService({
      repositorio: repositorioFalso({ crearCliente: () => Promise.resolve(null) }),
      tokens,
      contrasenas: contrasenasFalsas(),
    });
    const error = await capturar(
      servicio.registrar({ nombre: 'Ana', email: cuenta.email, password: 'x'.repeat(8) }),
    );
    expect([error.estado, error.codigo, error.message]).toEqual([
      409,
      'CONFLICTO',
      'Ya existe una cuenta con ese correo.',
    ]);
  });

  it('iniciarSesion con credenciales correctas no devuelve el hash ni el estado', async () => {
    const servicio = crearAuthService({
      repositorio: repositorioFalso(),
      tokens,
      contrasenas: contrasenasFalsas(),
    });
    const sesion = await servicio.iniciarSesion({ email: cuenta.email, password: 'Clave-2026' });
    expect(sesion.usuario).toEqual({
      id: ID,
      nombre: 'Ana',
      email: cuenta.email,
      telefono: null,
      rol: 'CLIENTE',
    });
    expect(JSON.stringify(sesion)).not.toMatch(/passwordHash|activo|hash:/);
  });

  it('con un correo inexistente compara igualmente contra el hash ficticio (mismo tiempo) y lanza 401', async () => {
    const contrasenas = contrasenasFalsas();
    const servicio = crearAuthService({ repositorio: repositorioFalso(), tokens, contrasenas });
    const error = await capturar(
      servicio.iniciarSesion({ email: 'nadie@creafacil.test', password: 'Clave-2026' }),
    );
    expect(contrasenas.verificar).toHaveBeenCalledWith('Clave-2026', HASH_FICTICIO);
    expect([error.estado, error.codigo, error.message]).toEqual([
      401,
      'CREDENCIALES_INVALIDAS',
      'Correo o contraseña incorrectos.',
    ]);
  });

  it('el hash ficticio es un hash bcrypt real de coste 12', () => {
    expect(HASH_FICTICIO).toMatch(/^\$2b\$12\$.{53}$/);
  });

  it('con una contraseña incorrecta lanza el mismo 401', async () => {
    const servicio = crearAuthService({
      repositorio: repositorioFalso(),
      tokens,
      contrasenas: contrasenasFalsas(),
    });
    const error = await capturar(servicio.iniciarSesion({ email: cuenta.email, password: 'otra' }));
    expect(error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('rechaza una contraseña de más de 72 bytes aunque bcrypt la diera por buena (truncado)', async () => {
    const siempreCoincide: Contrasenas = {
      generarHash: () => Promise.resolve('x'),
      verificar: () => Promise.resolve(true),
    };
    const servicio = crearAuthService({
      repositorio: repositorioFalso(),
      tokens,
      contrasenas: siempreCoincide,
    });
    const error = await capturar(
      servicio.iniciarSesion({ email: cuenta.email, password: 'ñ'.repeat(37) }),
    );
    expect(error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('una cuenta desactivada con la contraseña correcta recibe 403 CUENTA_DESACTIVADA', async () => {
    const servicio = crearAuthService({
      repositorio: repositorioFalso({
        buscarCredenciales: () => Promise.resolve({ ...cuenta, activo: false }),
      }),
      tokens,
      contrasenas: contrasenasFalsas(),
    });
    const error = await capturar(
      servicio.iniciarSesion({ email: cuenta.email, password: 'Clave-2026' }),
    );
    expect([error.estado, error.codigo]).toEqual([403, 'CUENTA_DESACTIVADA']);
  });

  it('obtenerPerfil devuelve los datos públicos y 401 si la cuenta no existe o está desactivada', async () => {
    const servicio = crearAuthService({
      repositorio: repositorioFalso(),
      tokens,
      contrasenas: contrasenasFalsas(),
    });
    await expect(servicio.obtenerPerfil(ID)).resolves.toEqual({
      id: ID,
      nombre: 'Ana',
      email: cuenta.email,
      telefono: null,
      rol: 'CLIENTE',
    });
    expect(
      (await capturar(servicio.obtenerPerfil('00000000-0000-4000-8000-000000000000'))).estado,
    ).toBe(401);

    const desactivada = crearAuthService({
      repositorio: repositorioFalso({
        buscarPorId: () => Promise.resolve({ ...cuenta, activo: false }),
      }),
      tokens,
      contrasenas: contrasenasFalsas(),
    });
    expect((await capturar(desactivada.obtenerPerfil(ID))).estado).toBe(401);
  });

  it('por defecto usa bcrypt real (verifica contra el hash ficticio sin lanzar)', async () => {
    const servicio = crearAuthService({ repositorio: repositorioFalso(), tokens });
    const error = await capturar(
      servicio.iniciarSesion({ email: 'nadie@creafacil.test', password: 'x' }),
    );
    expect(error.codigo).toBe('CREDENCIALES_INVALIDAS');
  }, 20_000);
});

describe('repositorio de autenticación', () => {
  it('esCorreoDuplicado reconoce el error P2002 de Prisma', () => {
    expect(esCorreoDuplicado({ code: 'P2002' })).toBe(true);
    expect(esCorreoDuplicado({ code: 'P2025' })).toBe(false);
    expect(esCorreoDuplicado(new Error('x'))).toBe(false);
    expect(esCorreoDuplicado(null)).toBe(false);
  });

  it('crearCliente devuelve null con un correo duplicado y relanza cualquier otro error', async () => {
    const datos = { nombre: 'Ana', email: 'ana@creafacil.test', passwordHash: 'h', telefono: null };
    const duplicado = crearAuthRepository({
      usuario: {
        create: () => Promise.reject(Object.assign(new Error('único'), { code: 'P2002' })),
      },
    } as unknown as Pick<PrismaClient, 'usuario'>);
    await expect(duplicado.crearCliente(datos)).resolves.toBeNull();

    const caido = crearAuthRepository({
      usuario: { create: () => Promise.reject(new Error('conexión perdida')) },
    } as unknown as Pick<PrismaClient, 'usuario'>);
    await expect(caido.crearCliente(datos)).rejects.toThrow('conexión perdida');
  });

  it('crearCliente fija siempre el rol CLIENTE', async () => {
    const create = vi.fn(() => Promise.resolve({ id: ID }));
    const repositorio = crearAuthRepository({ usuario: { create } } as unknown as Pick<
      PrismaClient,
      'usuario'
    >);
    await repositorio.crearCliente({
      nombre: 'Ana',
      email: 'a@b.co',
      passwordHash: 'h',
      telefono: null,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rol: 'CLIENTE', activo: true }) as unknown,
      }),
    );
  });
});

describe('esquemas de autenticación', () => {
  const valido = { nombre: 'Ana', email: 'ana@creafacil.test', password: 'Clave-2026' };

  it.each([
    ['0991234567', '0991234567'],
    ['+593 99 123 4567', '+593991234567'],
    ['(04) 234-5678', '042345678'],
  ])('normaliza el teléfono %j a %j', (telefono, esperado) => {
    expect(esquemasRegistro.body.parse({ ...valido, telefono }).telefono).toBe(esperado);
  });

  it.each([null, '', '   ', undefined])('acepta el teléfono ausente (%j)', (telefono) => {
    const resultado = esquemasRegistro.body.parse({ ...valido, telefono });
    expect(resultado.telefono ?? null).toBeNull();
  });

  it.each(['123', '1234567890123456', '+59 3a', 12345678])('rechaza el teléfono %j', (telefono) => {
    expect(esquemasRegistro.body.safeParse({ ...valido, telefono }).success).toBe(false);
  });

  it('rechaza una contraseña de 72 caracteres que ocupa más de 72 bytes', () => {
    const resultado = esquemasRegistro.body.safeParse({ ...valido, password: 'ñ'.repeat(40) });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toMatch(/72 bytes/);
  });

  it('acepta exactamente 8 y 72 caracteres', () => {
    expect(esquemasRegistro.body.safeParse({ ...valido, password: 'x'.repeat(8) }).success).toBe(
      true,
    );
    expect(esquemasRegistro.body.safeParse({ ...valido, password: 'x'.repeat(72) }).success).toBe(
      true,
    );
  });

  it.each(['CLIENTE', 'ADMIN', null])('rechaza cualquier rol enviado (%j)', (rol) => {
    expect(esquemasRegistro.body.safeParse({ ...valido, rol }).success).toBe(false);
  });

  it('descarta otros campos desconocidos', () => {
    expect(esquemasRegistro.body.parse({ ...valido, activo: false })).not.toHaveProperty('activo');
  });

  it('el login normaliza el correo y exige la contraseña', () => {
    expect(esquemasLogin.body.parse({ email: ' Ana@CreaFacil.TEST ', password: 'x' }).email).toBe(
      'ana@creafacil.test',
    );
    expect(
      esquemasLogin.body.safeParse({ email: 'ana@creafacil.test', password: '' }).success,
    ).toBe(false);
  });
});

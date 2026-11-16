import { describe, expect, it, vi } from 'vitest';

import {
  type ClienteAdmin,
  crearUsuariosRepository,
  escaparLike,
  type UsuariosRepository,
} from '../src/modules/usuarios/usuarios.repository.js';
import { esquemasListarClientes } from '../src/modules/usuarios/usuarios.schemas.js';
import {
  calcularPaginacion,
  crearUsuariosService,
} from '../src/modules/usuarios/usuarios.service.js';
import type { PrismaClient } from '../src/shared/database/prisma.js';

const ID = '3f2a6c1e-8b4d-4e5f-9a7b-1c2d3e4f5a6b';
const cliente: ClienteAdmin = {
  id: ID,
  nombre: 'Ana',
  email: 'ana@creafacil.test',
  telefono: null,
  activo: true,
  creadoEn: new Date('2026-11-13T12:00:00.000Z'),
};

describe('esquema de GET /admin/clientes', () => {
  const query = esquemasListarClientes.query;

  it('aplica los valores por defecto (página 1, 20 por página, sin búsqueda)', () => {
    expect(query.parse({})).toEqual({ pagina: 1, porPagina: 20 });
  });

  it('convierte los números de la query y recorta la búsqueda', () => {
    expect(query.parse({ pagina: '3', porPagina: '100', q: '  Ana ' })).toEqual({
      pagina: 3,
      porPagina: 100,
      q: 'Ana',
    });
  });

  it('una búsqueda vacía equivale a no filtrar', () => {
    expect(query.parse({ q: '   ' }).q).toBeUndefined();
  });

  it('ignora los parámetros desconocidos', () => {
    expect(query.parse({ orden: 'x' })).toEqual({ pagina: 1, porPagina: 20 });
  });

  it.each([
    [{ pagina: '0' }, 'La página debe ser un número entero mayor o igual que 1'],
    [{ pagina: '-1' }, 'La página debe ser un número entero mayor o igual que 1'],
    [{ pagina: '1.5' }, 'La página debe ser un número entero mayor o igual que 1'],
    [{ pagina: 'abc' }, 'La página debe ser un número entero mayor o igual que 1'],
    [{ pagina: '' }, 'La página debe ser un número entero mayor o igual que 1'],
    [{ pagina: ['1', '2'] }, 'La página debe ser un número entero mayor o igual que 1'],
    [{ porPagina: '101' }, 'porPagina debe ser un número entero entre 1 y 100'],
    [{ porPagina: '0' }, 'porPagina debe ser un número entero entre 1 y 100'],
    [{ q: 'x'.repeat(101) }, 'La búsqueda no puede superar 100 caracteres'],
    [{ q: ['a', 'b'] }, 'La búsqueda debe ser un único texto'],
  ])('rechaza %j', (entrada, mensaje) => {
    const resultado = query.safeParse(entrada);
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe(mensaje);
  });
});

describe('servicio de usuarios', () => {
  it('calcularPaginacion redondea hacia arriba y da 0 páginas sin resultados', () => {
    expect(calcularPaginacion(1, 20, 0)).toEqual({
      pagina: 1,
      porPagina: 20,
      total: 0,
      totalPaginas: 0,
    });
    expect(calcularPaginacion(2, 20, 41).totalPaginas).toBe(3);
    expect(calcularPaginacion(1, 20, 40).totalPaginas).toBe(2);
  });

  it('traduce la página a saltar/tomar y responde { datos, paginacion } sin campos extra', async () => {
    const listarClientes = vi.fn<UsuariosRepository['listarClientes']>(() =>
      Promise.resolve({
        clientes: [{ ...cliente, passwordHash: '$2b$12$x' } as ClienteAdmin],
        total: 21,
      }),
    );
    const servicio = crearUsuariosService({ listarClientes });

    const resultado = await servicio.listarClientes({ pagina: 2, porPagina: 10, q: 'ana' });

    expect(listarClientes).toHaveBeenCalledWith({ saltar: 10, tomar: 10, q: 'ana' });
    expect(resultado).toEqual({
      datos: [
        {
          id: ID,
          nombre: 'Ana',
          email: 'ana@creafacil.test',
          telefono: null,
          activo: true,
          creadoEn: '2026-11-13T12:00:00.000Z',
        },
      ],
      paginacion: { pagina: 2, porPagina: 10, total: 21, totalPaginas: 3 },
    });
    expect(JSON.stringify(resultado)).not.toMatch(/passwordHash|\$2b\$/);
  });
});

describe('repositorio de usuarios', () => {
  it('escaparLike escapa %, _ y la barra invertida', () => {
    expect(escaparLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
    expect(escaparLike('ana')).toBe('ana');
  });

  function prismaFalso() {
    const findMany = vi.fn((_args: unknown) =>
      Promise.resolve([
        {
          id: ID,
          nombre: 'Ana',
          email: 'ana@creafacil.test',
          telefono: null,
          activo: true,
          createdAt: cliente.creadoEn,
        },
      ]),
    );
    const count = vi.fn((_args: unknown) => Promise.resolve(1));
    const prisma = {
      usuario: { findMany, count },
      $transaction: (consultas: Promise<unknown>[]) => Promise.all(consultas),
    } as unknown as Pick<PrismaClient, 'usuario' | '$transaction'>;
    return { prisma, findMany, count };
  }

  it('lista solo clientes, sin hash, ordenados y paginados; renombra createdAt a creadoEn', async () => {
    const { prisma, findMany, count } = prismaFalso();
    const resultado = await crearUsuariosRepository(prisma).listarClientes({
      saltar: 20,
      tomar: 10,
    });

    expect(resultado).toEqual({ clientes: [cliente], total: 1 });
    const args = findMany.mock.calls[0]?.[0] as {
      where: unknown;
      select: Record<string, boolean>;
      skip: number;
      take: number;
      orderBy: unknown;
    };
    expect(args.where).toEqual({ rol: 'CLIENTE' });
    expect(args.select).not.toHaveProperty('passwordHash');
    expect([args.skip, args.take]).toEqual([20, 10]);
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
    expect(count).toHaveBeenCalledWith({ where: { rol: 'CLIENTE' } });
  });

  it('con búsqueda filtra por nombre o correo sin distinguir mayúsculas y con comodines escapados', async () => {
    const { prisma, findMany } = prismaFalso();
    await crearUsuariosRepository(prisma).listarClientes({ saltar: 0, tomar: 20, q: '50%' });
    expect((findMany.mock.calls[0]?.[0] as { where: unknown }).where).toEqual({
      rol: 'CLIENTE',
      OR: [
        { nombre: { contains: '50\\%', mode: 'insensitive' } },
        { email: { contains: '50\\%', mode: 'insensitive' } },
      ],
    });
  });
});

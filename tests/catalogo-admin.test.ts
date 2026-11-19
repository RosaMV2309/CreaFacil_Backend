/**
 * Gestión de categorías y materiales de la administradora (RF-22, RF-08): partes sin base de datos.
 * - Validación (Zod) de los cuerpos, la query y el formato exacto del precio.
 * - Reglas de los servicios con repositorios falsos (409, 404 y las carreras con la BD).
 * - Helpers de errores de Prisma.
 * El CRUD completo contra PostgreSQL está en `tests/integracion/catalogo-admin.integracion.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import type { CategoriasRepository } from '../src/modules/categorias/categorias.repository.js';
import {
  esquemasActualizarCategoria,
  esquemasCrearCategoria,
  esquemasListarCategorias,
} from '../src/modules/categorias/categorias.schemas.js';
import { crearCategoriasService } from '../src/modules/categorias/categorias.service.js';
import {
  mapearMaterial,
  type MaterialesRepository,
} from '../src/modules/materiales/materiales.repository.js';
import {
  esquemaPrecio,
  esquemasActualizarMaterial,
  esquemasCrearMaterial,
  esquemasListarMateriales,
  MENSAJE_PRECIO_CERO,
  MENSAJE_PRECIO_FORMATO,
  normalizarPrecio,
} from '../src/modules/materiales/materiales.schemas.js';
import { crearMaterialesService } from '../src/modules/materiales/materiales.service.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { escribirConControl, sinIndefinidos } from '../src/shared/database/errores-prisma.js';

const { Decimal } = Prisma;
import { AppError } from '../src/shared/errors/index.js';
import { normalizarEspacios } from '../src/shared/utils/consultas.js';

const ID = '3f2a6c1e-8b4d-4e5f-9a7b-1c2d3e4f5a6b';
const FECHA = new Date('2026-11-18T10:00:00.000Z');

describe('precio unitario: formato exacto (RF-07, RF-08)', () => {
  it.each([
    [0.75, '0.75'],
    ['0.75', '0.75'],
    [12.5, '12.50'],
    ['7', '7.00'],
    [3, '3.00'],
    ['  0.5 ', '0.50'],
    ['007.25', '7.25'],
    ['0.01', '0.01'],
    [99999.99, '99999.99'],
    ['99999.99', '99999.99'],
    [0.3, '0.30'],
  ])('%j → «%s»', (entrada, esperado) => {
    expect(esquemaPrecio.parse(entrada)).toBe(esperado);
  });

  it('0.1 + 0.2 calculado en JavaScript NO se redondea en silencio: se rechaza', () => {
    const suma = 0.1 + 0.2; // 0.30000000000000004
    const resultado = esquemaPrecio.safeParse(suma);
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe(MENSAJE_PRECIO_FORMATO);
  });

  it('con Decimal (como en la BD) 0.10 + 0.20 da exactamente 0.30', () => {
    const suma = new Decimal(esquemaPrecio.parse('0.1')).plus(esquemaPrecio.parse(0.2));
    expect(suma.toFixed(2)).toBe('0.30');
    expect(suma.equals(new Decimal('0.3'))).toBe(true);
  });

  it.each([
    1.234,
    '1.234',
    '0,75',
    '-1',
    -1,
    '100000',
    100000,
    '1e3',
    1e21,
    '',
    ' ',
    'abc',
    '.5',
    '5.',
    '+5',
  ])('%j → 400 con el mensaje de formato', (entrada) => {
    const resultado = esquemaPrecio.safeParse(entrada);
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe(MENSAJE_PRECIO_FORMATO);
  });

  it.each([0, '0', '0.00', '000.0', -0])('%j → 400 «mayor que 0»', (entrada) => {
    const resultado = esquemaPrecio.safeParse(entrada);
    expect(resultado.error?.issues[0]?.message).toBe(MENSAJE_PRECIO_CERO);
  });

  it.each([
    [null, 'El precio unitario debe ser un número o un texto como "0.75"'],
    [true, 'El precio unitario debe ser un número o un texto como "0.75"'],
    // NaN e Infinity no existen en JSON; si llegaran, z.number() los rechaza como tipo.
    [Number.NaN, 'El precio unitario debe ser un número o un texto como "0.75"'],
    [Number.POSITIVE_INFINITY, 'El precio unitario debe ser un número o un texto como "0.75"'],
    [undefined, 'El precio unitario es obligatorio'],
  ])('%j → 400 de tipo', (entrada, mensaje) => {
    expect(esquemaPrecio.safeParse(entrada).error?.issues[0]?.message).toBe(mensaje);
  });

  it('normalizarPrecio solo usa texto', () => {
    expect(normalizarPrecio('0')).toBe('0.00');
    expect(normalizarPrecio('10.5')).toBe('10.50');
  });

  it('el repositorio formatea el Decimal de la BD con 2 decimales', () => {
    const material = mapearMaterial({
      id: ID,
      nombre: 'Fomix',
      descripcion: null,
      unidad: 'plancha',
      precioUnitario: new Decimal('0.7'),
      activo: true,
      createdAt: FECHA,
      updatedAt: FECHA,
    });
    expect(material.precioUnitario).toBe('0.70');
    expect(Object.keys(material)).not.toContain('createdAt');
  });
});

describe('esquemas de categorías', () => {
  const crear = esquemasCrearCategoria.body;
  const actualizar = esquemasActualizarCategoria.body;

  it('normaliza el nombre y la descripción', () => {
    expect(crear.parse({ nombre: '  Murales   grandes ', descripcion: '  Hola  ' })).toEqual({
      nombre: 'Murales grandes',
      descripcion: 'Hola',
    });
    expect(normalizarEspacios(' a \t b ')).toBe('a b');
  });

  it('descripcion "" o null la borran', () => {
    expect(actualizar.parse({ descripcion: '' })).toEqual({ descripcion: null });
    expect(actualizar.parse({ descripcion: null })).toEqual({ descripcion: null });
  });

  it.each([
    [undefined, 'nombre', 'El nombre es obligatorio'],
    [{}, 'nombre', 'El nombre es obligatorio'],
    [{ nombre: 5 }, 'nombre', 'El nombre debe ser un texto'],
    [{ nombre: ' A ' }, 'nombre', 'El nombre debe tener al menos 2 caracteres'],
    [{ nombre: 'x'.repeat(81) }, 'nombre', 'El nombre no puede superar 80 caracteres'],
    [{ nombre: 'Ok', descripcion: 'x'.repeat(501) }, 'descripcion', 'no puede superar 500'],
    [{ nombre: 'Ok', orden: -1 }, 'orden', 'entre 0 y 9999'],
    [{ nombre: 'Ok', orden: 1.5 }, 'orden', 'entre 0 y 9999'],
    [{ nombre: 'Ok', orden: '1' }, 'orden', 'entre 0 y 9999'],
    [{ nombre: 'Ok', orden: 10000 }, 'orden', 'entre 0 y 9999'],
    [{ nombre: 'Ok', activa: 'si' }, 'activa', 'activa debe ser true o false'],
    [{ nombre: 'Ok', id: ID }, 'id', 'no está permitido'],
    [[], '', 'El cuerpo debe ser un objeto JSON'],
  ])('crear %j → error en «%s»', (cuerpo, campo, mensaje) => {
    const resultado = crear.safeParse(cuerpo);
    expect(resultado.success).toBe(false);
    const issue = resultado.error?.issues[0];
    expect(issue?.message).toContain(mensaje);
    if (campo && issue?.code !== 'unrecognized_keys') {
      expect(issue?.path).toEqual([campo]);
    }
  });

  it('PATCH sin campos → «al menos un campo»', () => {
    for (const cuerpo of [undefined, {}]) {
      expect(actualizar.safeParse(cuerpo).error?.issues[0]?.message).toBe(
        'Envía al menos un campo para actualizar: nombre, descripcion, orden o activa',
      );
    }
  });

  it('query: activa solo admite true o false', () => {
    const query = esquemasListarCategorias.query;
    expect(query.parse({ activa: 'true' })).toEqual({ activa: true, q: undefined });
    expect(query.parse({ activa: 'false', q: ' ' })).toEqual({ activa: false, q: undefined });
    expect(query.safeParse({ activa: 'sí' }).error?.issues[0]?.message).toBe(
      'activa debe ser true o false',
    );
  });
});

describe('esquemas de materiales', () => {
  it('crear exige nombre, unidad y precio', () => {
    const resultado = esquemasCrearMaterial.body.safeParse({});
    expect(resultado.error?.issues.map((i) => i.path.join('.'))).toEqual([
      'nombre',
      'unidad',
      'precioUnitario',
    ]);
  });

  it('crear normaliza los textos y el precio', () => {
    expect(
      esquemasCrearMaterial.body.parse({ nombre: ' Pintura  ', unidad: ' m² ', precioUnitario: 2 }),
    ).toEqual({ nombre: 'Pintura', unidad: 'm²', precioUnitario: '2.00' });
  });

  it.each([
    [{ unidad: '' }, 'La unidad debe tener al menos 1 caracter'],
    [{ unidad: 'x'.repeat(31) }, 'La unidad no puede superar 30 caracteres'],
    [{ activo: 1 }, 'activo debe ser true o false'],
    [{ precioUnitario: '1.999' }, MENSAJE_PRECIO_FORMATO],
    [{ stock: 3 }, 'Este campo no está permitido'],
    [{}, 'Envía al menos un campo para actualizar'],
  ])('PATCH %j → 400', (cuerpo, mensaje) => {
    const resultado = esquemasActualizarMaterial.body.safeParse(cuerpo);
    expect(resultado.error?.issues[0]?.message).toContain(mensaje);
  });

  it('query: paginación, búsqueda y activo', () => {
    expect(esquemasListarMateriales.query.parse({ activo: 'false', porPagina: '5' })).toEqual({
      pagina: 1,
      porPagina: 5,
      q: undefined,
      activo: false,
    });
    expect(esquemasListarMateriales.query.safeParse({ porPagina: '101' }).success).toBe(false);
  });
});

/** Categoría guardada de ejemplo. */
const categoria = {
  id: ID,
  nombre: 'Murales',
  descripcion: null,
  activa: true,
  orden: 3,
  serviciosActivos: 1,
  serviciosTotales: 2,
  creadoEn: FECHA,
  actualizadoEn: FECHA,
};

function repoCategorias(cambios: Partial<CategoriasRepository> = {}): CategoriasRepository {
  return {
    listar: vi.fn(() => Promise.resolve([categoria])),
    obtener: vi.fn(() => Promise.resolve(categoria)),
    existeNombre: vi.fn(() => Promise.resolve(false)),
    crear: vi.fn(() => Promise.resolve({ ok: true as const, valor: categoria })),
    actualizar: vi.fn(() => Promise.resolve({ ok: true as const, valor: categoria })),
    ...cambios,
  };
}

async function errorDe(promesa: Promise<unknown>): Promise<AppError> {
  const error = await promesa.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('servicio de categorías', () => {
  it('lista con fechas ISO y sin campos extra', async () => {
    const repo = repoCategorias({
      listar: () => Promise.resolve([{ ...categoria, secreto: 'x' } as typeof categoria]),
    });
    const { datos } = await crearCategoriasService(repo).listar({
      activa: undefined,
      q: undefined,
    });
    expect(datos).toEqual([
      { ...categoria, creadoEn: FECHA.toISOString(), actualizadoEn: FECHA.toISOString() },
    ]);
  });

  it('crear con un nombre existente → 409 sin escribir', async () => {
    const crear = vi.fn();
    const repo = repoCategorias({ existeNombre: () => Promise.resolve(true), crear });
    const error = await errorDe(crearCategoriasService(repo).crear({ nombre: 'murales' }));
    expect([error.estado, error.codigo, error.message]).toEqual([
      409,
      'CONFLICTO',
      'Ya existe una categoría con ese nombre.',
    ]);
    expect(error.detalles).toEqual([
      { campo: 'nombre', ubicacion: 'body', mensaje: 'Ya existe una categoría con ese nombre.' },
    ]);
    expect(crear).not.toHaveBeenCalled();
  });

  it('carrera: el índice único de la BD también da 409', async () => {
    const repo = repoCategorias({
      crear: () => Promise.resolve({ ok: false as const, motivo: 'duplicado' as const }),
    });
    expect((await errorDe(crearCategoriasService(repo).crear({ nombre: 'X' }))).estado).toBe(409);
  });

  it('obtener o actualizar una inexistente → 404 «La categoría no existe.»', async () => {
    const servicio = crearCategoriasService(
      repoCategorias({ obtener: () => Promise.resolve(null) }),
    );
    for (const promesa of [servicio.obtener(ID), servicio.actualizar(ID, { nombre: 'Otra' })]) {
      const error = await errorDe(promesa);
      expect([error.estado, error.message]).toEqual([404, 'La categoría no existe.']);
    }
  });

  it('carrera: si desaparece entre la comprobación y la escritura → 404', async () => {
    const repo = repoCategorias({
      actualizar: () => Promise.resolve({ ok: false as const, motivo: 'no-existe' as const }),
    });
    expect((await errorDe(crearCategoriasService(repo).actualizar(ID, { orden: 1 }))).estado).toBe(
      404,
    );
  });

  it('actualizar el nombre comprueba duplicados excluyendo la propia categoría', async () => {
    const existeNombre = vi.fn(() => Promise.resolve(false));
    const servicio = crearCategoriasService(repoCategorias({ existeNombre }));
    await servicio.actualizar(ID, { nombre: 'MURALES' });
    expect(existeNombre).toHaveBeenCalledWith('MURALES', ID);
    existeNombre.mockClear();
    await servicio.actualizar(ID, { activa: false });
    expect(existeNombre).not.toHaveBeenCalled();
  });
});

const material = {
  id: ID,
  nombre: 'Fomix',
  descripcion: null,
  unidad: 'plancha',
  precioUnitario: '0.75',
  activo: true,
  creadoEn: FECHA,
  actualizadoEn: FECHA,
};

function repoMateriales(cambios: Partial<MaterialesRepository> = {}): MaterialesRepository {
  return {
    listar: vi.fn(() => Promise.resolve({ materiales: [material], total: 41 })),
    obtener: vi.fn(() => Promise.resolve(material)),
    existeNombre: vi.fn(() => Promise.resolve(false)),
    crear: vi.fn(() => Promise.resolve({ ok: true as const, valor: material })),
    actualizar: vi.fn(() => Promise.resolve({ ok: true as const, valor: material })),
    ...cambios,
  };
}

describe('servicio de materiales', () => {
  it('lista paginado: calcula saltar/tomar y la paginación', async () => {
    const listar = vi.fn(() => Promise.resolve({ materiales: [material], total: 41 }));
    const resultado = await crearMaterialesService(repoMateriales({ listar })).listar({
      pagina: 3,
      porPagina: 20,
      q: 'fo',
      activo: true,
    });
    expect(listar).toHaveBeenCalledWith({ saltar: 40, tomar: 20, q: 'fo', activo: true });
    expect(resultado.paginacion).toEqual({ pagina: 3, porPagina: 20, total: 41, totalPaginas: 3 });
    expect(resultado.datos[0]?.precioUnitario).toBe('0.75');
  });

  it('409 por nombre duplicado (comprobación y carrera)', async () => {
    const datos = { nombre: 'fomix', unidad: 'plancha', precioUnitario: '1.00' };
    const conNombre = repoMateriales({ existeNombre: () => Promise.resolve(true) });
    const carrera = repoMateriales({
      crear: () => Promise.resolve({ ok: false as const, motivo: 'duplicado' as const }),
    });
    for (const repo of [conNombre, carrera]) {
      const error = await errorDe(crearMaterialesService(repo).crear(datos));
      expect([error.estado, error.message]).toEqual([409, 'Ya existe un material con ese nombre.']);
    }
    const enEdicion = await errorDe(
      crearMaterialesService(conNombre).actualizar(ID, { nombre: 'Otro' }),
    );
    expect(enEdicion.estado).toBe(409);
  });

  it('404 «El material no existe.» (obtener, actualizar y carrera)', async () => {
    const sinMaterial = crearMaterialesService(
      repoMateriales({ obtener: () => Promise.resolve(null) }),
    );
    const carrera = crearMaterialesService(
      repoMateriales({
        actualizar: () => Promise.resolve({ ok: false as const, motivo: 'no-existe' as const }),
      }),
    );
    for (const promesa of [
      sinMaterial.obtener(ID),
      sinMaterial.actualizar(ID, { activo: false }),
      carrera.actualizar(ID, { precioUnitario: '2.00' }),
    ]) {
      const error = await errorDe(promesa);
      expect([error.estado, error.message]).toEqual([404, 'El material no existe.']);
    }
  });
});

describe('errores de Prisma', () => {
  it('P2002 → duplicado, P2025 → no-existe, el resto se relanza', async () => {
    const fallo = (code: unknown) => () => Promise.reject(Object.assign(new Error('x'), { code }));
    await expect(escribirConControl(fallo('P2002'))).resolves.toEqual({
      ok: false,
      motivo: 'duplicado',
    });
    await expect(escribirConControl(fallo('P2025'))).resolves.toEqual({
      ok: false,
      motivo: 'no-existe',
    });
    await expect(escribirConControl(fallo('P1001'))).rejects.toThrow('x');
    await expect(escribirConControl(fallo(42))).rejects.toThrow('x');
    await expect(escribirConControl(() => Promise.reject(new Error('sin código')))).rejects.toThrow(
      'sin código',
    );
    await expect(escribirConControl(() => Promise.resolve(7))).resolves.toEqual({
      ok: true,
      valor: 7,
    });
  });

  it('sinIndefinidos quita solo las claves undefined', () => {
    expect(sinIndefinidos({ a: 1, b: undefined, c: null, d: false })).toEqual({
      a: 1,
      c: null,
      d: false,
    });
  });
});

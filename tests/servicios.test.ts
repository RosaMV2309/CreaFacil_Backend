/**
 * Servicios del catálogo y sus fotos (RF-22, RF-04, RF-05): partes sin base de datos.
 * - Detección del tipo de imagen por su firma, nombres aleatorios y almacenamiento en disco
 *   (carpeta temporal) con la ruta pública /uploads.
 * - Validación (Zod) de los cuerpos y la query.
 * - Reglas de los servicios con repositorios falsos (404, 409, materiales, carreras con la BD).
 * - Errores de la subida (multer).
 * El flujo completo contra PostgreSQL está en `tests/integracion/servicios-admin.integracion.test.ts`.
 */
/* eslint-disable @typescript-eslint/unbound-method -- se comprueban los vi.fn() de los repositorios falsos */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Router } from 'express';
import multer from 'multer';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { crearApp } from '../src/app.js';
import { cargarEnv } from '../src/config/env.js';
import type { FotosRepository } from '../src/modules/servicios/fotos.repository.js';
import {
  crearFotosService,
  MENSAJE_DEMASIADO_GRANDE,
  MENSAJE_FOTO_NO_EXISTE,
  MENSAJE_LIMITE,
  MENSAJE_NO_ES_IMAGEN,
  MENSAJE_ORDEN_NO_COINCIDE,
  MENSAJE_SIN_FOTO,
} from '../src/modules/servicios/fotos.service.js';
import { crearRecepcionFoto, traducirErrorSubida } from '../src/modules/servicios/fotos.subida.js';
import type {
  ServicioGuardado,
  ServiciosRepository,
} from '../src/modules/servicios/servicios.repository.js';
import {
  esquemasActualizarServicio,
  esquemasBorrarFoto,
  esquemasCrearServicio,
  esquemasListarServicios,
  esquemasOrdenarFotos,
} from '../src/modules/servicios/servicios.schemas.js';
import {
  crearServiciosService,
  MENSAJE_CATEGORIA_NO_EXISTE,
  MENSAJE_DUPLICADO,
  MENSAJE_NO_EXISTE,
} from '../src/modules/servicios/servicios.service.js';
import {
  detectarTipoImagen,
  esClaveValida,
  generarClave,
  TAMANO_MAXIMO_FOTO,
} from '../src/shared/almacenamiento/almacenamiento.js';
import { crearAlmacenamientoDisco } from '../src/shared/almacenamiento/disco.js';
import { AppError } from '../src/shared/errors/index.js';
import {
  crearAlmacenamientoMemoria,
  crearAppDePrueba,
  crearPrismaSinBaseDatos,
  envDePrueba,
} from './helpers.js';

const ID = '3f2a6c1e-8b4d-4e5f-9a7b-1c2d3e4f5a6b';
const ID2 = '9c1b2a3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const UUID_FIJO = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FECHA = new Date('2026-11-19T10:00:00.000Z');

/** Contenido mínimo con la firma de cada tipo (el servidor solo mira la firma). */
export const BYTES = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]),
  jpg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
};

describe('detectarTipoImagen: por la firma, no por la extensión', () => {
  it.each([
    ['png', 'image/png', 'png'],
    ['jpg', 'image/jpeg', 'jpg'],
    ['webp', 'image/webp', 'webp'],
  ] as const)('%s → %s', (tipo, mime, extension) => {
    expect(detectarTipoImagen(BYTES[tipo])).toEqual({ tipoMime: mime, extension });
  });

  it.each([
    ['texto', Buffer.from('hola, no soy una imagen')],
    ['ejecutable de Windows (MZ)', Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])],
    ['RIFF que no es WebP (WAVE)', Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1')],
    ['vacío', Buffer.alloc(0)],
    ['PNG truncado', BYTES.png.subarray(0, 7)],
    ['RIFF truncado', Buffer.from('RIFF')],
    ['GIF', Buffer.from('GIF89a')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
  ])('%s → null', (_caso, contenido) => {
    expect(detectarTipoImagen(contenido)).toBeNull();
  });
});

describe('nombres de archivo aleatorios y seguros', () => {
  it('generarClave usa el UUID y la extensión del tipo DETECTADO', () => {
    expect(generarClave({ tipoMime: 'image/png', extension: 'png' }, () => UUID_FIJO)).toBe(
      `${UUID_FIJO}.png`,
    );
    expect(
      generarClave({ tipoMime: 'image/jpeg', extension: 'jpg' }, () => UUID_FIJO.toUpperCase()),
    ).toBe(`${UUID_FIJO}.jpg`);
  });

  it('si el generador devuelve algo que no es un UUID v4, falla', () => {
    expect(() =>
      generarClave({ tipoMime: 'image/png', extension: 'png' }, () => '../../etc/passwd'),
    ).toThrow('identificador no válido');
  });

  it.each([
    '../secreto.png',
    `../${UUID_FIJO}.png`,
    `${UUID_FIJO}.png/..`,
    `${UUID_FIJO}.PNG`,
    `${UUID_FIJO}.gif`,
    `${UUID_FIJO}.png.exe`,
    `sub/${UUID_FIJO}.png`,
    `sub\\${UUID_FIJO}.png`,
    '.env',
    '',
    'foto.png',
  ])('«%s» no es una clave válida', (clave) => {
    expect(esClaveValida(clave)).toBe(false);
  });
});

describe('almacenamiento en disco (carpeta temporal) y GET /uploads', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'creafacil-disco-'));
  const almacenamiento = crearAlmacenamientoDisco({
    carpeta: join(carpeta, 'subidas'),
    urlBase: 'http://localhost:3000',
  });
  const app = crearApp(envDePrueba, { prisma: crearPrismaSinBaseDatos(), almacenamiento });
  const clave = `${UUID_FIJO}.png`;
  // Un archivo FUERA de la carpeta de subidas que nunca se debe poder leer ni borrar.
  writeFileSync(join(carpeta, 'secreto.png'), BYTES.png);

  afterAll(() => {
    rmSync(carpeta, { recursive: true, force: true });
  });

  it('guarda (creando la carpeta), da la URL absoluta y no sobrescribe', async () => {
    await almacenamiento.guardar({ clave, contenido: BYTES.png, tipoMime: 'image/png' });
    expect(readFileSync(join(almacenamiento.carpeta, clave))).toEqual(BYTES.png);
    expect(almacenamiento.urlPublica(clave)).toBe(`http://localhost:3000/uploads/${clave}`);
    await expect(
      almacenamiento.guardar({ clave, contenido: BYTES.jpg, tipoMime: 'image/jpeg' }),
    ).rejects.toThrow();
  });

  it('GET /uploads/<clave> → 200 sin token, image/png, nosniff, CORP cross-origin y caché', async () => {
    const res = await request(app).get(`/uploads/${clave}`).set('Origin', 'http://localhost:5000');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5000');
    expect(Buffer.from(res.body as Buffer)).toEqual(BYTES.png);
  });

  it('HEAD también funciona; la API sigue con CORP same-origin fuera de /uploads', async () => {
    const head = await request(app).head(`/uploads/${clave}`);
    const api = await request(app).get('/api/v1');
    expect(head.status).toBe(200);
    expect(api.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it.each([
    ['la carpeta (sin listado de directorios)', '/uploads/'],
    ['la carpeta sin barra', '/uploads'],
    ['un nombre que no es una clave', '/uploads/foto.png'],
    ['path traversal codificado', '/uploads/..%2Fsecreto.png'],
    ['path traversal doble', '/uploads/%2e%2e%2fsecreto.png'],
    ['un archivo oculto', '/uploads/.env'],
    ['una clave válida que no existe', `/uploads/${UUID_FIJO}.jpg`],
    ['una subcarpeta', `/uploads/x/${clave}`],
  ])('%s → 404 JSON', async (_caso, ruta) => {
    const res = await request(app).get(ruta);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('POST /uploads/<clave> no sube nada (404)', async () => {
    const res = await request(app).post(`/uploads/${clave}`).send({});
    expect(res.status).toBe(404);
  });

  it('eliminar borra el archivo, es idempotente y rechaza claves peligrosas', async () => {
    await almacenamiento.eliminar(clave);
    expect(existsSync(join(almacenamiento.carpeta, clave))).toBe(false);
    await expect(almacenamiento.eliminar(clave)).resolves.toBeUndefined();
    await expect(almacenamiento.eliminar('../secreto.png')).rejects.toThrow('Clave de archivo');
    await expect(
      almacenamiento.guardar({ clave: '../x.png', contenido: BYTES.png, tipoMime: 'image/png' }),
    ).rejects.toThrow('Clave de archivo');
    expect(existsSync(join(carpeta, 'secreto.png'))).toBe(true);
  });

  it('un almacenamiento sin manejadorPublico (p. ej. Cloudinary) no monta /uploads', async () => {
    const appMemoria = crearApp(envDePrueba, {
      prisma: crearPrismaSinBaseDatos(),
      almacenamiento: crearAlmacenamientoMemoria(),
    });
    expect((await request(appMemoria).get(`/uploads/${clave}`)).status).toBe(404);
  });
});

describe('variables de entorno de las fotos', () => {
  const base = { DATABASE_URL: 'postgresql://u:c@localhost/x', JWT_SECRET: 'x'.repeat(32) };

  it('por defecto: UPLOADS_DIR=uploads y PUBLIC_BASE_URL=http://localhost:<PORT>', () => {
    const env = cargarEnv({ ...base, PORT: '4000' });
    expect(env.UPLOADS_DIR).toBe('uploads');
    expect(env.PUBLIC_BASE_URL).toBe('http://localhost:4000');
  });

  it('acepta un origen y quita la barra final', () => {
    const env = cargarEnv({
      ...base,
      UPLOADS_DIR: ' C:/datos/fotos ',
      PUBLIC_BASE_URL: 'https://api.creafacil.ec/',
    });
    expect(env.UPLOADS_DIR).toBe('C:/datos/fotos');
    expect(env.PUBLIC_BASE_URL).toBe('https://api.creafacil.ec');
  });

  it.each([
    ['PUBLIC_BASE_URL', 'ftp://x.test', 'PUBLIC_BASE_URL debe ser una URL http(s)'],
    ['PUBLIC_BASE_URL', 'no es url', 'PUBLIC_BASE_URL debe ser una URL http(s)'],
    ['PUBLIC_BASE_URL', 'http://x.test/api', 'solo debe tener el origen'],
    ['PUBLIC_BASE_URL', 'http://x.test?a=1', 'solo debe tener el origen'],
    ['UPLOADS_DIR', '   ', 'UPLOADS_DIR no puede estar vacía'],
    ['UPLOADS_DIR', 'a\0b', 'UPLOADS_DIR no es una ruta válida'],
  ])('%s=%j → error', (clave, valor, mensaje) => {
    expect(() => cargarEnv({ ...base, [clave]: valor })).toThrow(mensaje);
  });
});

describe('validación de los servicios (Zod)', () => {
  const crear = esquemasCrearServicio.body;

  it('normaliza el nombre, vacía textos con "" y formatea el precio', () => {
    expect(
      crear.parse({
        categoriaId: ID,
        nombre: '  Mural   infantil ',
        descripcion: '',
        dimensionesOrientativas: ' 2 x 3 m ',
        observaciones: null,
        precioBaseReferencial: 45,
        materialIds: [ID2],
      }),
    ).toEqual({
      categoriaId: ID,
      nombre: 'Mural infantil',
      descripcion: null,
      dimensionesOrientativas: '2 x 3 m',
      observaciones: null,
      precioBaseReferencial: '45.00',
      materialIds: [ID2],
    });
  });

  it('precioBaseReferencial: null lo quita y los errores nombran el campo', () => {
    expect(crear.parse({ categoriaId: ID, nombre: 'Ab', precioBaseReferencial: null })).toEqual({
      categoriaId: ID,
      nombre: 'Ab',
      precioBaseReferencial: null,
    });
    const error = crear.safeParse({ categoriaId: ID, nombre: 'Ab', precioBaseReferencial: 1.234 });
    expect(error.error?.issues[0]?.message).toMatch(
      /^El precio base referencial debe ser un número/,
    );
    const cero = crear.safeParse({ categoriaId: ID, nombre: 'Ab', precioBaseReferencial: '0' });
    expect(cero.error?.issues[0]?.message).toBe('El precio base referencial debe ser mayor que 0');
  });

  it.each([
    [{}, ['categoriaId', 'nombre']],
    [{ categoriaId: 'x', nombre: 'A' }, ['categoriaId', 'nombre']],
    [{ categoriaId: ID, nombre: 'Ab', id: ID }, ['']],
    [{ categoriaId: ID, nombre: 'x'.repeat(121) }, ['nombre']],
    [{ categoriaId: ID, nombre: 'Ab', descripcion: 'x'.repeat(2001) }, ['descripcion']],
    [
      { categoriaId: ID, nombre: 'Ab', dimensionesOrientativas: 'x'.repeat(201) },
      ['dimensionesOrientativas'],
    ],
    [{ categoriaId: ID, nombre: 'Ab', observaciones: 5 }, ['observaciones']],
    [{ categoriaId: ID, nombre: 'Ab', materialIds: [ID, ID] }, ['materialIds']],
    [{ categoriaId: ID, nombre: 'Ab', materialIds: ['x'] }, ['materialIds']],
    [{ categoriaId: ID, nombre: 'Ab', materialIds: ID }, ['materialIds']],
    [
      { categoriaId: ID, nombre: 'Ab', materialIds: Array.from({ length: 51 }, () => ID) },
      ['materialIds'],
    ],
    [{ categoriaId: ID, nombre: 'Ab', activo: 'si' }, ['activo']],
  ])('%j → error en %j', (cuerpo, campos) => {
    const resultado = crear.safeParse(cuerpo);
    expect(resultado.success).toBe(false);
    expect([...new Set(resultado.error?.issues.map((i) => String(i.path[0] ?? '')))]).toEqual(
      campos,
    );
  });

  it('mensajes claros de categoriaId', () => {
    const faltan = crear.safeParse({ nombre: 'Ab' });
    expect(faltan.error?.issues[0]?.message).toBe('La categoría es obligatoria (categoriaId)');
    const mal = crear.safeParse({ nombre: 'Ab', categoriaId: 'x' });
    expect(mal.error?.issues[0]?.message).toBe('categoriaId debe ser un UUID válido');
  });

  it('PATCH: al menos un campo; materialIds [] vacía la lista', () => {
    const patch = esquemasActualizarServicio.body;
    expect(patch.safeParse({}).error?.issues[0]?.message).toMatch(/^Envía al menos un campo/);
    expect(patch.safeParse(undefined).success).toBe(false);
    expect(patch.parse({ materialIds: [] })).toEqual({ materialIds: [] });
    expect(patch.parse({ activo: false })).toEqual({ activo: false });
  });

  it('listado: categoriaId UUID y activo true|false', () => {
    const query = esquemasListarServicios.query;
    expect(query.parse({ categoriaId: ID, activo: 'false', q: ' mural ' })).toEqual({
      pagina: 1,
      porPagina: 20,
      categoriaId: ID,
      activo: false,
      q: 'mural',
    });
    expect(query.safeParse({ categoriaId: 'x' }).success).toBe(false);
    expect(query.safeParse({ activo: 'si' }).success).toBe(false);
  });

  it('orden de fotos: lista de UUID sin repetir, de 1 a 8', () => {
    const orden = esquemasOrdenarFotos.body;
    expect(orden.parse({ fotoIds: [ID, ID2] })).toEqual({ fotoIds: [ID, ID2] });
    expect(orden.safeParse({}).error?.issues[0]?.message).toMatch(/^fotoIds es obligatorio/);
    expect(orden.safeParse({ fotoIds: 'x' }).error?.issues[0]?.message).toBe(
      'fotoIds debe ser una lista de ids de fotos',
    );
    expect(orden.safeParse({ fotoIds: [] }).success).toBe(false);
    expect(orden.safeParse({ fotoIds: [ID, ID] }).error?.issues[0]?.message).toBe(
      'fotoIds no puede repetir fotos',
    );
    expect(orden.safeParse({ fotoIds: Array.from({ length: 9 }, () => ID) }).success).toBe(false);
    expect(orden.safeParse({ fotoIds: [ID], extra: 1 }).success).toBe(false);
  });

  it('borrar foto: los dos ids deben ser UUID', () => {
    const params = esquemasBorrarFoto.params;
    expect(params.safeParse({ id: ID, fotoId: '..' }).error?.issues[0]?.message).toBe(
      'El id de la foto debe ser un UUID válido',
    );
    expect(params.parse({ id: ID, fotoId: ID2 })).toEqual({ id: ID, fotoId: ID2 });
  });
});

// ---------------------------------------------------------------------------
// Reglas de negocio con repositorios falsos
// ---------------------------------------------------------------------------

function servicioGuardado(cambios: Partial<ServicioGuardado> = {}): ServicioGuardado {
  return {
    id: ID,
    nombre: 'Mural',
    categoria: { id: ID2, nombre: 'Murales', activa: true },
    activo: true,
    precioBaseReferencial: null,
    portada: null,
    numeroFotos: 0,
    creadoEn: FECHA,
    actualizadoEn: FECHA,
    descripcion: null,
    dimensionesOrientativas: null,
    observaciones: null,
    materiales: [],
    fotos: [],
    ...cambios,
  };
}

function repoServicios(cambios: Partial<ServiciosRepository> = {}): ServiciosRepository {
  return {
    listar: vi.fn(() => Promise.resolve({ servicios: [], total: 0 })),
    obtener: vi.fn(() => Promise.resolve(servicioGuardado())),
    existeCategoria: vi.fn(() => Promise.resolve(true)),
    buscarMateriales: vi.fn(() => Promise.resolve([])),
    existeNombre: vi.fn(() => Promise.resolve(false)),
    crear: vi.fn(() => Promise.resolve({ ok: true as const, valor: servicioGuardado() })),
    actualizar: vi.fn(() => Promise.resolve({ ok: true as const, valor: servicioGuardado() })),
    ...cambios,
  };
}

async function errorDe(promesa: Promise<unknown>): Promise<AppError> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }
    throw error;
  }
  throw new Error('Se esperaba un AppError');
}

describe('reglas de los servicios (repositorio falso)', () => {
  const almacenamiento = crearAlmacenamientoMemoria('http://cdn.test');
  const material = (id: string, activo: boolean) => ({ id, nombre: `Material ${id}`, activo });

  it('la respuesta usa la URL del almacenamiento (si hay clave) o la guardada, y nunca la clave', async () => {
    const fotos = [
      { id: ID, clave: `${UUID_FIJO}.png`, url: 'http://viejo/x.png', orden: 0 },
      { id: ID2, clave: null, url: 'https://externa.test/y.png', orden: 1 },
    ];
    const servicio = crearServiciosService(
      repoServicios({
        obtener: () =>
          Promise.resolve(servicioGuardado({ fotos, portada: fotos[0] ?? null, numeroFotos: 2 })),
      }),
      almacenamiento,
    );
    const ficha = await servicio.obtener(ID);
    expect(ficha.portadaUrl).toBe(`http://cdn.test/${UUID_FIJO}.png`);
    expect(ficha.fotos).toEqual([
      { id: ID, url: `http://cdn.test/${UUID_FIJO}.png`, orden: 0 },
      { id: ID2, url: 'https://externa.test/y.png', orden: 1 },
    ]);
    expect(JSON.stringify(ficha)).not.toContain('clave');
    expect(ficha.creadoEn).toBe('2026-11-19T10:00:00.000Z');
  });

  it('listar pagina y resume (portadaUrl null sin fotos)', async () => {
    const repo = repoServicios({
      listar: vi.fn(() => Promise.resolve({ servicios: [servicioGuardado()], total: 21 })),
    });
    const resultado = await crearServiciosService(repo, almacenamiento).listar({
      pagina: 2,
      porPagina: 20,
      q: 'mu',
      categoriaId: ID2,
      activo: true,
    });
    expect(repo.listar).toHaveBeenCalledWith({
      saltar: 20,
      tomar: 20,
      q: 'mu',
      categoriaId: ID2,
      activo: true,
    });
    expect(resultado.paginacion).toEqual({ pagina: 2, porPagina: 20, total: 21, totalPaginas: 2 });
    expect(resultado.datos[0]).toMatchObject({ portadaUrl: null, numeroFotos: 0 });
    expect(Object.keys(resultado.datos[0] ?? {})).not.toContain('descripcion');
  });

  it('obtener / actualizar un servicio inexistente → 404', async () => {
    const servicio = crearServiciosService(
      repoServicios({ obtener: () => Promise.resolve(null) }),
      almacenamiento,
    );
    expect((await errorDe(servicio.obtener(ID))).message).toBe(MENSAJE_NO_EXISTE);
    expect((await errorDe(servicio.actualizar(ID, { activo: false }))).estado).toBe(404);
  });

  it('crear con una categoría inexistente → 400 en categoriaId', async () => {
    const error = await errorDe(
      crearServiciosService(
        repoServicios({ existeCategoria: () => Promise.resolve(false) }),
        almacenamiento,
      ).crear({ categoriaId: ID2, nombre: 'Mural' }),
    );
    expect(error.estado).toBe(400);
    expect(error.detalles).toEqual([
      { campo: 'categoriaId', ubicacion: 'body', mensaje: MENSAJE_CATEGORIA_NO_EXISTE },
    ]);
  });

  it('materiales: inexistentes y desactivados nuevos → 400 en materialIds', async () => {
    const inexistente = await errorDe(
      crearServiciosService(
        repoServicios({ buscarMateriales: () => Promise.resolve([material(ID, true)]) }),
        almacenamiento,
      ).crear({ categoriaId: ID2, nombre: 'Mural', materialIds: [ID, ID2] }),
    );
    expect(inexistente.detalles?.[0]).toEqual({
      campo: 'materialIds',
      ubicacion: 'body',
      mensaje: `No existen estos materiales: ${ID2}.`,
    });
    const inactivo = await errorDe(
      crearServiciosService(
        repoServicios({ buscarMateriales: () => Promise.resolve([material(ID, false)]) }),
        almacenamiento,
      ).crear({ categoriaId: ID2, nombre: 'Mural', materialIds: [ID] }),
    );
    expect(inactivo.detalles?.[0]?.mensaje).toBe(
      `Estos materiales están desactivados y no se pueden añadir: Material ${ID}.`,
    );
  });

  it('al editar se puede CONSERVAR un material ya asociado aunque esté desactivado', async () => {
    const repo = repoServicios({
      obtener: () =>
        Promise.resolve(
          servicioGuardado({
            materiales: [{ id: ID, nombre: 'Viejo', unidad: 'u', activo: false }],
          }),
        ),
      buscarMateriales: () => Promise.resolve([material(ID, false), material(ID2, true)]),
    });
    await crearServiciosService(repo, almacenamiento).actualizar(ID, { materialIds: [ID, ID2] });
    expect(repo.actualizar).toHaveBeenCalledWith(ID, { materialIds: [ID, ID2] });
  });

  it('nombre duplicado en la categoría → 409 (comprobación previa y carrera con la BD)', async () => {
    const previo = await errorDe(
      crearServiciosService(
        repoServicios({ existeNombre: () => Promise.resolve(true) }),
        almacenamiento,
      ).crear({ categoriaId: ID2, nombre: 'Mural' }),
    );
    expect([previo.estado, previo.message]).toEqual([409, MENSAJE_DUPLICADO]);
    const carrera = await errorDe(
      crearServiciosService(
        repoServicios({ crear: () => Promise.resolve({ ok: false, motivo: 'duplicado' }) }),
        almacenamiento,
      ).crear({ categoriaId: ID2, nombre: 'Mural' }),
    );
    expect(carrera.estado).toBe(409);
    const borrado = await errorDe(
      crearServiciosService(
        repoServicios({ actualizar: () => Promise.resolve({ ok: false, motivo: 'no-existe' }) }),
        almacenamiento,
      ).actualizar(ID, { activo: false }),
    );
    expect(borrado.estado).toBe(404);
  });

  it('al cambiar de categoría comprueba el nombre ACTUAL en la categoría de destino', async () => {
    const repo = repoServicios();
    await crearServiciosService(repo, almacenamiento).actualizar(ID, { categoriaId: ID });
    expect(repo.existeCategoria).toHaveBeenCalledWith(ID);
    expect(repo.existeNombre).toHaveBeenCalledWith(ID, 'Mural', ID);
  });

  it('si solo cambia el precio o activo, no comprueba el nombre', async () => {
    const repo = repoServicios();
    await crearServiciosService(repo, almacenamiento).actualizar(ID, {
      precioBaseReferencial: '10.00',
      activo: false,
    });
    expect(repo.existeNombre).not.toHaveBeenCalled();
    expect(repo.existeCategoria).not.toHaveBeenCalled();
  });
});

describe('reglas de las fotos (repositorio y almacenamiento falsos)', () => {
  const foto = (id: string, orden: number) => ({
    id,
    clave: `${UUID_FIJO}.png`,
    url: 'http://viejo/x.png',
    orden,
  });

  function preparar(cambios: Partial<FotosRepository> = {}) {
    const almacenamiento = crearAlmacenamientoMemoria('http://cdn.test');
    const repositorio: FotosRepository = {
      contar: vi.fn(() => Promise.resolve(0)),
      agregar: vi.fn(() => Promise.resolve({ ok: true as const, foto: foto(ID, 0) })),
      ordenar: vi.fn(() => Promise.resolve({ ok: true as const, fotos: [foto(ID, 0)] })),
      eliminar: vi.fn(() =>
        Promise.resolve({ ok: true as const, borrada: foto(ID, 0), fotos: [foto(ID2, 0)] }),
      ),
      ...cambios,
    };
    const avisar = vi.fn();
    const servicio = crearFotosService({
      repositorio,
      almacenamiento,
      uuid: () => UUID_FIJO,
      avisar,
    });
    return { servicio, repositorio, almacenamiento, avisar };
  }

  it('sube: guarda con nombre aleatorio + extensión del tipo detectado y responde la URL', async () => {
    const { servicio, repositorio, almacenamiento } = preparar();
    await expect(servicio.subir(ID, { contenido: BYTES.webp })).resolves.toEqual({
      id: ID,
      url: `http://cdn.test/${UUID_FIJO}.png`,
      orden: 0,
    });
    expect([...almacenamiento.archivos.keys()]).toEqual([`${UUID_FIJO}.webp`]);
    expect(repositorio.agregar).toHaveBeenCalledWith(
      ID,
      {
        clave: `${UUID_FIJO}.webp`,
        url: `http://cdn.test/${UUID_FIJO}.webp`,
        tipoMime: 'image/webp',
        tamanoBytes: BYTES.webp.length,
      },
      8,
    );
  });

  it.each([
    ['sin archivo', undefined, 400, MENSAJE_SIN_FOTO],
    ['archivo vacío', { contenido: Buffer.alloc(0) }, 400, MENSAJE_SIN_FOTO],
    [
      'texto con extensión .png',
      { contenido: Buffer.from('no soy png') },
      400,
      MENSAJE_NO_ES_IMAGEN,
    ],
    [
      'más de 5 MB',
      { contenido: Buffer.concat([BYTES.png, Buffer.alloc(TAMANO_MAXIMO_FOTO)]) },
      413,
      MENSAJE_DEMASIADO_GRANDE,
    ],
  ])('%s → %i sin guardar nada', async (_caso, archivo, estado, mensaje) => {
    const { servicio, almacenamiento } = preparar();
    const error = await errorDe(servicio.subir(ID, archivo));
    expect([error.estado, error.message]).toEqual([estado, mensaje]);
    expect(almacenamiento.archivos.size).toBe(0);
  });

  it('con 8 fotos → 409 antes de guardar el archivo', async () => {
    const { servicio, almacenamiento } = preparar({ contar: () => Promise.resolve(8) });
    const error = await errorDe(servicio.subir(ID, { contenido: BYTES.png }));
    expect([error.estado, error.message]).toEqual([409, MENSAJE_LIMITE]);
    expect(almacenamiento.archivos.size).toBe(0);
  });

  it.each([
    ['limite', 409],
    ['no-existe', 404],
  ] as const)('si la transacción dice «%s» → %i y el archivo se borra', async (motivo, estado) => {
    const { servicio, almacenamiento } = preparar({
      agregar: () => Promise.resolve({ ok: false, motivo }),
    });
    expect((await errorDe(servicio.subir(ID, { contenido: BYTES.jpg }))).estado).toBe(estado);
    expect(almacenamiento.archivos.size).toBe(0);
  });

  it('si la BD falla, el archivo se borra y el error sigue', async () => {
    const { servicio, almacenamiento } = preparar({
      agregar: () => Promise.reject(new Error('BD caída')),
    });
    await expect(servicio.subir(ID, { contenido: BYTES.png })).rejects.toThrow('BD caída');
    expect(almacenamiento.archivos.size).toBe(0);
  });

  it('ordenar: 404 sin servicio, 400 si los ids no coinciden, y la lista nueva si todo va bien', async () => {
    const noExiste = preparar({
      ordenar: () => Promise.resolve({ ok: false, motivo: 'no-existe' }),
    });
    expect((await errorDe(noExiste.servicio.ordenar(ID, [ID]))).estado).toBe(404);
    const noCoinciden = preparar({
      ordenar: () => Promise.resolve({ ok: false, motivo: 'no-coinciden' }),
    });
    const error = await errorDe(noCoinciden.servicio.ordenar(ID, [ID]));
    expect(error.detalles).toEqual([
      { campo: 'fotoIds', ubicacion: 'body', mensaje: MENSAJE_ORDEN_NO_COINCIDE },
    ]);
    await expect(preparar().servicio.ordenar(ID, [ID])).resolves.toEqual([
      { id: ID, url: `http://cdn.test/${UUID_FIJO}.png`, orden: 0 },
    ]);
  });

  it('eliminar: 404 (servicio o foto) y, si va bien, borra el archivo', async () => {
    for (const [motivo, mensaje] of [
      ['no-existe', MENSAJE_NO_EXISTE],
      ['foto-no-existe', MENSAJE_FOTO_NO_EXISTE],
    ] as const) {
      const { servicio } = preparar({ eliminar: () => Promise.resolve({ ok: false, motivo }) });
      const error = await errorDe(servicio.eliminar(ID, ID2));
      expect([error.estado, error.message]).toEqual([404, mensaje]);
    }
    const { servicio, almacenamiento } = preparar();
    almacenamiento.archivos.set(`${UUID_FIJO}.png`, BYTES.png);
    await expect(servicio.eliminar(ID, ID)).resolves.toHaveLength(1);
    expect(almacenamiento.archivos.size).toBe(0);
  });

  it('si el archivo no se puede borrar, avisa pero la petición termina bien', async () => {
    const { servicio, almacenamiento, avisar } = preparar();
    vi.spyOn(almacenamiento, 'eliminar').mockRejectedValue(new Error('EPERM'));
    await expect(servicio.eliminar(ID, ID)).resolves.toHaveLength(1);
    expect(avisar).toHaveBeenCalledWith(
      `No se pudo borrar el archivo ${UUID_FIJO}.png del almacenamiento.`,
      expect.any(Error),
    );
  });

  it('una imagen externa (sin clave) no intenta borrar ningún archivo; el aviso por defecto usa console.warn', async () => {
    const almacenamiento = crearAlmacenamientoMemoria();
    const eliminar = vi.spyOn(almacenamiento, 'eliminar');
    const servicio = crearFotosService({
      repositorio: {
        contar: () => Promise.resolve(0),
        agregar: () => Promise.resolve({ ok: false, motivo: 'limite' }),
        ordenar: () => Promise.resolve({ ok: false, motivo: 'no-existe' }),
        eliminar: () =>
          Promise.resolve({
            ok: true,
            borrada: { id: ID, clave: null, url: 'https://x.test/a.png', orden: 0 },
            fotos: [],
          }),
      },
      almacenamiento,
      uuid: () => UUID_FIJO,
    });
    await expect(servicio.eliminar(ID, ID)).resolves.toEqual([]);
    expect(eliminar).not.toHaveBeenCalled();

    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    eliminar.mockRejectedValue(new Error('EPERM'));
    await expect(servicio.subir(ID, { contenido: BYTES.png })).rejects.toThrow(MENSAJE_LIMITE);
    expect(aviso).toHaveBeenCalledOnce();
    aviso.mockRestore();
  });
});

describe('subida multipart (multer en memoria)', () => {
  const app = crearAppDePrueba(
    Router().post('/subir', crearRecepcionFoto(64), (req, res) => {
      res.json({ bytes: req.file?.size ?? null });
    }),
  );

  it('un archivo dentro del límite llega en memoria', async () => {
    const res = await request(app).post('/subir').attach('foto', BYTES.png, 'a.png');
    expect(res.body).toEqual({ bytes: BYTES.png.length });
  });

  it('por encima del límite → 413 ARCHIVO_DEMASIADO_GRANDE', async () => {
    const res = await request(app).post('/subir').attach('foto', Buffer.alloc(200), 'a.png');
    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { codigo: 'ARCHIVO_DEMASIADO_GRANDE', mensaje: MENSAJE_DEMASIADO_GRANDE },
    });
  });

  it.each([
    ['otro nombre de campo', (r: request.Test) => r.attach('imagen', BYTES.png, 'a.png')],
    [
      'dos archivos',
      (r: request.Test) => r.attach('foto', BYTES.png, 'a.png').attach('foto', BYTES.png, 'b.png'),
    ],
    [
      'un campo de texto',
      (r: request.Test) => r.field('nombre', 'x').attach('foto', BYTES.png, 'a.png'),
    ],
  ])('%s → 400 VALIDACION en el campo foto', async (_caso, preparar) => {
    const res = await preparar(request(app).post('/subir'));
    expect(res.status).toBe(400);
    const cuerpo = res.body as { error: { codigo: string; detalles: { campo: string }[] } };
    expect(cuerpo.error.codigo).toBe('VALIDACION');
    expect(cuerpo.error.detalles[0]?.campo).toBe('foto');
  });

  it('un formulario multipart mal formado → 400 SOLICITUD_INVALIDA', async () => {
    const res = await request(app)
      .post('/subir')
      .set('Content-Type', 'multipart/form-data; boundary=xyz')
      .send('--xyz\r\nContent-Disposition: form-data; name="foto"; filename="a.png"\r\n\r\nabc');
    expect(res.status).toBe(400);
    expect((res.body as { error: { codigo: string } }).error.codigo).toBe('SOLICITUD_INVALIDA');
  });

  it('traducirErrorSubida: un código de multer sin mensaje propio da uno genérico', () => {
    const error = traducirErrorSubida(new multer.MulterError('LIMIT_FIELD_KEY'));
    expect([error.estado, error.message]).toEqual([400, 'No se pudo leer la foto enviada.']);
  });
});

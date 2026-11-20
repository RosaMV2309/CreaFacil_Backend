/**
 * Servicios del catálogo y sus fotos contra PostgreSQL y un disco real (carpeta temporal)
 * (RF-22, RF-04, RF-05). Usa la app real con la base de datos de pruebas.
 * Datos de este archivo: nombres con el prefijo `[servicios-test] ` y usuarios del dominio
 * `servicios.creafacil.test`. Se borran al empezar y al terminar, igual que la carpeta temporal.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearApp } from '../../src/app.js';
import { crearAlmacenamientoDisco } from '../../src/shared/almacenamiento/disco.js';
import { generarHashPassword } from '../../src/shared/security/password.js';
import { crearPrismaDePrueba, envDeIntegracion } from './base-datos.js';

const P = '[servicios-test] ';
const DOMINIO = '@servicios.creafacil.test';
const PASSWORD = 'Clave-Servicios-2026';
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const URL_BASE = 'http://api.servicios.test';

/** PNG real de 1×1 (el mismo que usa Postman en postman/fixtures). */
const PNG = readFileSync(join(import.meta.dirname, '../../postman/fixtures/foto-prueba.png'));
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);

interface CuerpoError {
  error: {
    codigo: string;
    mensaje: string;
    detalles?: { campo: string; ubicacion: string; mensaje: string }[];
  };
}
interface Foto {
  id: string;
  url: string;
  orden: number;
}
interface Servicio {
  id: string;
  nombre: string;
  categoria: { id: string; nombre: string; activa: boolean };
  activo: boolean;
  precioBaseReferencial: string | null;
  portadaUrl: string | null;
  numeroFotos: number;
  descripcion: string | null;
  dimensionesOrientativas: string | null;
  observaciones: string | null;
  materiales: { id: string; nombre: string; unidad: string; activo: boolean }[];
  fotos: Foto[];
  creadoEn: string;
  actualizadoEn: string;
}
interface Listado {
  datos: Servicio[];
  paginacion: { pagina: number; porPagina: number; total: number; totalPaginas: number };
}

const CLAVES_FICHA = [
  'activo',
  'actualizadoEn',
  'categoria',
  'creadoEn',
  'descripcion',
  'dimensionesOrientativas',
  'fotos',
  'id',
  'materiales',
  'nombre',
  'numeroFotos',
  'observaciones',
  'portadaUrl',
  'precioBaseReferencial',
];

describe('servicios del catálogo y fotos (integración)', () => {
  const prisma = crearPrismaDePrueba();
  const carpetaTemporal = mkdtempSync(join(tmpdir(), 'creafacil-servicios-'));
  const almacenamiento = crearAlmacenamientoDisco({
    carpeta: join(carpetaTemporal, 'uploads'),
    urlBase: URL_BASE,
  });
  const app = crearApp(envDeIntegracion(), { prisma, almacenamiento });
  let tokenAdmin = '';
  let tokenCliente = '';
  let categoriaId = '';
  let categoria2Id = '';
  let materialA = '';
  let materialB = '';
  let materialInactivo = '';
  let servicioId = '';

  const archivosEnDisco = () =>
    existsSync(almacenamiento.carpeta) ? readdirSync(almacenamiento.carpeta).sort() : [];
  const claveDe = (url: string) => url.slice(`${URL_BASE}/uploads/`.length);

  async function limpiar(): Promise<void> {
    const prefijo = { nombre: { startsWith: P } };
    await prisma.servicio.deleteMany({ where: { categoria: prefijo } });
    await prisma.categoria.deleteMany({ where: prefijo });
    await prisma.material.deleteMany({ where: prefijo });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: DOMINIO } } });
  }

  async function iniciarSesion(email: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return (res.body as { token: string }).token;
  }

  function peticion(
    metodo: 'get' | 'post' | 'patch' | 'delete' | 'put',
    ruta: string,
    token: string | null = tokenAdmin,
  ) {
    const p = request(app)[metodo](`/api/v1/admin${ruta}`);
    return token ? p.set('Authorization', `Bearer ${token}`) : p;
  }

  function subir(id: string, contenido: Buffer, nombre: string, contentType = 'image/png') {
    return peticion('post', `/servicios/${id}/fotos`).attach('foto', contenido, {
      filename: nombre,
      contentType,
    });
  }

  beforeAll(async () => {
    await limpiar();
    const passwordHash = await generarHashPassword(PASSWORD);
    await prisma.usuario.create({
      data: { nombre: 'Admin Servicios', email: `admin${DOMINIO}`, passwordHash, rol: 'ADMIN' },
    });
    await prisma.usuario.create({
      data: { nombre: 'Cliente Servicios', email: `cliente${DOMINIO}`, passwordHash },
    });
    tokenAdmin = await iniciarSesion(`admin${DOMINIO}`);
    tokenCliente = await iniciarSesion(`cliente${DOMINIO}`);
    categoriaId = (await prisma.categoria.create({ data: { nombre: `${P}Murales` } })).id;
    categoria2Id = (
      await prisma.categoria.create({ data: { nombre: `${P}Cuadros`, activa: false } })
    ).id;
    const material = (nombre: string, activo = true) =>
      prisma.material.create({
        data: { nombre: `${P}${nombre}`, unidad: 'unidad', precioUnitario: '1.00', activo },
      });
    materialA = (await material('Pintura acrílica')).id;
    materialB = (await material('Pincel')).id;
    materialInactivo = (await material('Barniz viejo', false)).id;
  });

  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
    rmSync(carpetaTemporal, { recursive: true, force: true });
  });

  describe('permisos heredados del grupo /admin', () => {
    it('401 sin token y 403 con token de cliente; no se crea nada', async () => {
      const sinToken = await peticion('get', '/servicios', null);
      const cliente = await peticion('post', '/servicios', tokenCliente).send({
        categoriaId,
        nombre: `${P}Hack`,
      });
      const fotoCliente = await peticion(
        'post',
        `/servicios/${ID_INEXISTENTE}/fotos`,
        tokenCliente,
      ).attach('foto', PNG, 'a.png');
      expect([sinToken.status, cliente.status, fotoCliente.status]).toEqual([401, 403, 403]);
      expect((sinToken.body as CuerpoError).error.codigo).toBe('NO_AUTENTICADO');
      expect((cliente.body as CuerpoError).error.codigo).toBe('PROHIBIDO');
      await expect(prisma.servicio.count({ where: { nombre: `${P}Hack` } })).resolves.toBe(0);
      expect(archivosEnDisco()).toEqual([]);
    });
  });

  describe('alta, consulta y edición', () => {
    it('POST → 201 con la ficha completa, materiales ordenados y precio en texto', async () => {
      const res = await peticion('post', '/servicios').send({
        categoriaId,
        nombre: `  ${P}Mural   infantil `,
        descripcion: 'Mural para habitación infantil',
        dimensionesOrientativas: 'Pared de hasta 3 m',
        observaciones: 'Incluye boceto previo',
        precioBaseReferencial: 120.5,
        materialIds: [materialA, materialB],
      });
      expect(res.status).toBe(201);
      const servicio = (res.body as { servicio: Servicio }).servicio;
      servicioId = servicio.id;
      expect(Object.keys(servicio).sort()).toEqual(CLAVES_FICHA);
      expect(servicio).toMatchObject({
        nombre: `${P}Mural infantil`,
        categoria: { id: categoriaId, nombre: `${P}Murales`, activa: true },
        activo: true,
        precioBaseReferencial: '120.50',
        portadaUrl: null,
        numeroFotos: 0,
        fotos: [],
      });
      expect(servicio.materiales).toEqual([
        { id: materialB, nombre: `${P}Pincel`, unidad: 'unidad', activo: true },
        { id: materialA, nombre: `${P}Pintura acrílica`, unidad: 'unidad', activo: true },
      ]);
    });

    it('solo con lo mínimo: descripción, precio y materiales vacíos', async () => {
      const res = await peticion('post', '/servicios').send({
        categoriaId: categoria2Id,
        nombre: `${P}Mural infantil`,
        activo: false,
      });
      // Mismo nombre en OTRA categoría (desactivada): se permite.
      expect(res.status).toBe(201);
      expect((res.body as { servicio: Servicio }).servicio).toMatchObject({
        descripcion: null,
        precioBaseReferencial: null,
        materiales: [],
        activo: false,
        categoria: { activa: false },
      });
    });

    it('nombre duplicado en la misma categoría (mayúsculas y espacios) → 409', async () => {
      const res = await peticion('post', '/servicios').send({
        categoriaId,
        nombre: ` ${P}MURAL INFANTIL `,
      });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: {
          codigo: 'CONFLICTO',
          mensaje: 'Ya existe un servicio con ese nombre en esta categoría.',
          detalles: [
            {
              campo: 'nombre',
              ubicacion: 'body',
              mensaje: 'Ya existe un servicio con ese nombre en esta categoría.',
            },
          ],
        },
      });
    });

    it.each([
      [
        'categoría inexistente',
        () => ({ categoriaId: ID_INEXISTENTE, nombre: `${P}X` }),
        'categoriaId',
        'La categoría no existe.',
      ],
      [
        'material desactivado',
        () => ({ categoriaId, nombre: `${P}X`, materialIds: [materialInactivo] }),
        'materialIds',
        `Estos materiales están desactivados y no se pueden añadir: ${P}Barniz viejo.`,
      ],
      [
        'material inexistente',
        () => ({ categoriaId, nombre: `${P}X`, materialIds: [ID_INEXISTENTE] }),
        'materialIds',
        `No existen estos materiales: ${ID_INEXISTENTE}.`,
      ],
    ])('%s → 400 VALIDACION', async (_caso, cuerpo, campo, mensaje) => {
      const res = await peticion('post', '/servicios').send(cuerpo());
      expect(res.status).toBe(400);
      expect((res.body as CuerpoError).error.detalles).toEqual([
        { campo, ubicacion: 'body', mensaje },
      ]);
    });

    it('cuerpo con campos no permitidos o inválidos → 400 con un detalle por campo', async () => {
      const res = await peticion('post', '/servicios').send({
        categoriaId,
        nombre: 'A',
        precioBaseReferencial: '1,5',
        id: ID_INEXISTENTE,
      });
      expect(res.status).toBe(400);
      expect((res.body as CuerpoError).error.detalles?.map((d) => d.campo).sort()).toEqual([
        'id',
        'nombre',
        'precioBaseReferencial',
      ]);
    });

    it('GET /:id → ficha; 404 si no existe; 400 si el id no es UUID', async () => {
      const ficha = await peticion('get', `/servicios/${servicioId}`);
      const noExiste = await peticion('get', `/servicios/${ID_INEXISTENTE}`);
      const malId = await peticion('get', '/servicios/abc');
      expect([ficha.status, noExiste.status, malId.status]).toEqual([200, 404, 400]);
      expect((noExiste.body as CuerpoError).error.mensaje).toBe('El servicio no existe.');
    });

    it('PATCH cambia el precio y REEMPLAZA los materiales', async () => {
      const res = await peticion('patch', `/servicios/${servicioId}`).send({
        precioBaseReferencial: '99.9',
        materialIds: [materialA],
        observaciones: '',
      });
      expect(res.status).toBe(200);
      const servicio = (res.body as { servicio: Servicio }).servicio;
      expect(servicio.precioBaseReferencial).toBe('99.90');
      expect(servicio.observaciones).toBeNull();
      expect(servicio.materiales.map((m) => m.id)).toEqual([materialA]);
      await expect(prisma.servicioMaterial.count({ where: { servicioId } })).resolves.toBe(1);
    });

    it('un material que se desactiva DESPUÉS se puede conservar al editar', async () => {
      await prisma.material.update({ where: { id: materialA }, data: { activo: false } });
      const res = await peticion('patch', `/servicios/${servicioId}`).send({
        materialIds: [materialA, materialB],
      });
      await prisma.material.update({ where: { id: materialA }, data: { activo: true } });
      expect(res.status).toBe(200);
      expect(
        (res.body as { servicio: Servicio }).servicio.materiales.find((m) => m.id === materialA)
          ?.activo,
      ).toBe(false);
    });

    it('PATCH: 400 vacío, 404 inexistente y 409 si se mueve a una categoría donde ya existe el nombre', async () => {
      const vacio = await peticion('patch', `/servicios/${servicioId}`).send({});
      const noExiste = await peticion('patch', `/servicios/${ID_INEXISTENTE}`).send({
        activo: true,
      });
      const choque = await peticion('patch', `/servicios/${servicioId}`).send({
        categoriaId: categoria2Id,
      });
      expect([vacio.status, noExiste.status, choque.status]).toEqual([400, 404, 409]);
    });

    it('desactivar (RF-05): sigue en el sistema y se puede filtrar y reactivar', async () => {
      const desactivar = await peticion('patch', `/servicios/${servicioId}`).send({
        activo: false,
      });
      expect((desactivar.body as { servicio: Servicio }).servicio.activo).toBe(false);
      const inactivos = await peticion('get', `/servicios?activo=false&q=${encodeURIComponent(P)}`);
      expect((inactivos.body as Listado).datos.map((s) => s.id)).toContain(servicioId);
      const reactivar = await peticion('patch', `/servicios/${servicioId}`).send({ activo: true });
      expect((reactivar.body as { servicio: Servicio }).servicio.activo).toBe(true);
    });

    it('no existe DELETE de servicios (solo se desactivan)', async () => {
      const res = await peticion('delete', `/servicios/${servicioId}`);
      expect(res.status).toBe(404);
      expect((res.body as CuerpoError).error.codigo).toBe('RUTA_NO_ENCONTRADA');
      await expect(prisma.servicio.count({ where: { id: servicioId } })).resolves.toBe(1);
    });

    it('GET paginado con q, categoriaId y activo; cada elemento es un resumen', async () => {
      const res = await peticion(
        'get',
        `/servicios?q=${encodeURIComponent(P)}&categoriaId=${categoriaId}&activo=true&porPagina=5`,
      );
      expect(res.status).toBe(200);
      const listado = res.body as Listado;
      expect(listado.paginacion).toEqual({ pagina: 1, porPagina: 5, total: 1, totalPaginas: 1 });
      expect(Object.keys(listado.datos[0] ?? {}).sort()).toEqual([
        'activo',
        'actualizadoEn',
        'categoria',
        'creadoEn',
        'id',
        'nombre',
        'numeroFotos',
        'portadaUrl',
        'precioBaseReferencial',
      ]);
      const todos = await peticion('get', `/servicios?q=${encodeURIComponent(P)}`);
      expect((todos.body as Listado).paginacion.total).toBe(2);
      const mal = await peticion('get', '/servicios?categoriaId=x&activo=si');
      expect(mal.status).toBe(400);
    });
  });

  describe('fotos', () => {
    const fotos: Foto[] = [];

    it.each([
      ['PNG', PNG, 'mi foto.png', 'image/png', 'png'],
      ['JPG', JPG, 'foto.jpg', 'image/jpeg', 'jpg'],
      ['WebP', WEBP, 'foto.webp', 'image/webp', 'webp'],
    ])(
      'sube un %s → 201 con URL absoluta y nombre aleatorio',
      async (_t, bytes, nombre, mime, ext) => {
        const res = await subir(servicioId, bytes, nombre, mime);
        expect(res.status).toBe(201);
        const foto = (res.body as { foto: Foto }).foto;
        fotos.push(foto);
        expect(Object.keys(foto).sort()).toEqual(['id', 'orden', 'url']);
        expect(foto.orden).toBe(fotos.length - 1);
        expect(foto.url).toMatch(new RegExp(`^${URL_BASE}/uploads/[0-9a-f-]{36}\\.${ext}$`));
        expect(foto.url).not.toContain('foto');
        expect(readFileSync(join(almacenamiento.carpeta, claveDe(foto.url)))).toEqual(bytes);
        const fila = await prisma.imagenServicio.findUniqueOrThrow({ where: { id: foto.id } });
        expect([fila.clave, fila.tipoMime, fila.tamanoBytes]).toEqual([
          claveDe(foto.url),
          mime,
          bytes.length,
        ]);
      },
    );

    it('GET /uploads/<archivo> sin token → 200 con el Content-Type real', async () => {
      const png = fotos[0];
      const res = await request(app).get(`/uploads/${claveDe(png?.url ?? '')}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('un archivo DISFRAZADO (.png que es texto o un ejecutable) se rechaza sin guardar nada', async () => {
      const antes = archivosEnDisco();
      const texto = await subir(servicioId, Buffer.from('esto es texto'), 'foto.png', 'image/png');
      const exe = await subir(servicioId, Buffer.from([0x4d, 0x5a, 0x90, 0, 3]), 'foto.png');
      for (const res of [texto, exe]) {
        expect(res.status).toBe(400);
        expect((res.body as CuerpoError).error).toMatchObject({
          codigo: 'VALIDACION',
          detalles: [{ campo: 'foto', ubicacion: 'body' }],
        });
      }
      expect(archivosEnDisco()).toEqual(antes);
    });

    it('más de 5 MB → 413 sin guardar nada', async () => {
      const antes = archivosEnDisco();
      const grande = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
      const res = await subir(servicioId, grande, 'grande.png');
      expect(res.status).toBe(413);
      expect((res.body as CuerpoError).error.codigo).toBe('ARCHIVO_DEMASIADO_GRANDE');
      expect(archivosEnDisco()).toEqual(antes);
    });

    it('un nombre con path traversal no sale de la carpeta: se guarda con nombre aleatorio', async () => {
      const res = await subir(servicioId, PNG, '../../../fuera.png');
      expect(res.status).toBe(201);
      fotos.push((res.body as { foto: Foto }).foto);
      expect(existsSync(join(carpetaTemporal, 'fuera.png'))).toBe(false);
      expect(archivosEnDisco().every((n) => /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(n))).toBe(true);
    });

    it('sin archivo, servicio inexistente o id no UUID → 400 / 404 / 400', async () => {
      const sinArchivo = await peticion('post', `/servicios/${servicioId}/fotos`).send({});
      const noExiste = await subir(ID_INEXISTENTE, PNG, 'a.png');
      const malId = await subir('abc', PNG, 'a.png');
      expect([sinArchivo.status, noExiste.status, malId.status]).toEqual([400, 404, 400]);
      expect(archivosEnDisco()).toHaveLength(fotos.length);
    });

    it('máximo 8 fotos: la novena → 409 y no queda archivo', async () => {
      while (fotos.length < 8) {
        const res = await subir(servicioId, PNG, 'relleno.png');
        expect(res.status).toBe(201);
        fotos.push((res.body as { foto: Foto }).foto);
      }
      const novena = await subir(servicioId, PNG, 'novena.png');
      expect(novena.status).toBe(409);
      expect((novena.body as CuerpoError).error.mensaje).toBe(
        'El servicio ya tiene 8 fotos, el máximo. Borra alguna antes de subir otra.',
      );
      expect(archivosEnDisco()).toHaveLength(8);
    });

    it('reordenar: la última pasa a ser la portada; ids incompletos → 400', async () => {
      const nuevoOrden = [...fotos].reverse().map((f) => f.id);
      const res = await peticion('patch', `/servicios/${servicioId}/fotos/orden`).send({
        fotoIds: nuevoOrden,
      });
      expect(res.status).toBe(200);
      const ordenadas = (res.body as { fotos: Foto[] }).fotos;
      expect(ordenadas.map((f) => f.id)).toEqual(nuevoOrden);
      expect(ordenadas.map((f) => f.orden)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      const ficha = (await peticion('get', `/servicios/${servicioId}`)).body as {
        servicio: Servicio;
      };
      expect(ficha.servicio.portadaUrl).toBe(ordenadas[0]?.url);
      expect(ficha.servicio.numeroFotos).toBe(8);

      const incompleto = await peticion('patch', `/servicios/${servicioId}/fotos/orden`).send({
        fotoIds: nuevoOrden.slice(1),
      });
      expect(incompleto.status).toBe(400);
      expect((incompleto.body as CuerpoError).error.detalles?.[0]?.campo).toBe('fotoIds');
      const ajeno = await peticion('patch', `/servicios/${ID_INEXISTENTE}/fotos/orden`).send({
        fotoIds: nuevoOrden,
      });
      expect(ajeno.status).toBe(404);
    });

    it('borrar una foto: desaparecen el registro y el archivo, y se reordena sin huecos', async () => {
      const ficha = (await peticion('get', `/servicios/${servicioId}`)).body as {
        servicio: Servicio;
      };
      const intermedia = ficha.servicio.fotos[3];
      const res = await peticion('delete', `/servicios/${servicioId}/fotos/${intermedia?.id}`);
      expect(res.status).toBe(200);
      const restantes = (res.body as { fotos: Foto[] }).fotos;
      expect(restantes.map((f) => f.orden)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(restantes.map((f) => f.id)).not.toContain(intermedia?.id);
      expect(existsSync(join(almacenamiento.carpeta, claveDe(intermedia?.url ?? '')))).toBe(false);
      expect(archivosEnDisco()).toHaveLength(7);
      const publico = await request(app).get(`/uploads/${claveDe(intermedia?.url ?? '')}`);
      expect(publico.status).toBe(404);
    });

    it('borrar una foto inexistente o de otro servicio → 404', async () => {
      const otro = await prisma.servicio.findFirstOrThrow({
        where: { categoriaId: categoria2Id },
      });
      const deOtro = await peticion('delete', `/servicios/${otro.id}/fotos/${fotos[0]?.id}`);
      const inexistente = await peticion(
        'delete',
        `/servicios/${servicioId}/fotos/${ID_INEXISTENTE}`,
      );
      const sinServicio = await peticion(
        'delete',
        `/servicios/${ID_INEXISTENTE}/fotos/${ID_INEXISTENTE}`,
      );
      expect([deOtro.status, inexistente.status, sinServicio.status]).toEqual([404, 404, 404]);
      expect((deOtro.body as CuerpoError).error.mensaje).toBe(
        'La foto no existe en este servicio.',
      );
      expect(archivosEnDisco()).toHaveLength(7);
    });

    it('el listado muestra la portada y el número de fotos', async () => {
      const res = await peticion('get', `/servicios?categoriaId=${categoriaId}`);
      const servicio = (res.body as Listado).datos.find((s) => s.id === servicioId);
      expect(servicio?.numeroFotos).toBe(7);
      expect(servicio?.portadaUrl).toMatch(new RegExp(`^${URL_BASE}/uploads/`));
    });
  });
});

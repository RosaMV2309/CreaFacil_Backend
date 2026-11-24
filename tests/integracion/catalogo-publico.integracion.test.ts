/**
 * Catálogo PÚBLICO contra PostgreSQL (RF-03, RF-04, RF-05, RN-01). App real con la BD de pruebas y
 * almacenamiento en memoria (las fotos se insertan como registros).
 * Datos: nombres con el prefijo `[catalogo-publico-test] `; se borran al empezar y al terminar.
 */
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearApp } from '../../src/app.js';
import { MENSAJE_NO_DISPONIBLE } from '../../src/modules/catalogo/catalogo.service.js';
import { crearServicioTokens } from '../../src/shared/security/tokens.js';
import { crearAlmacenamientoMemoria } from '../helpers.js';
import {
  CLAVES_CATALOGO,
  CLAVES_FICHA,
  CLAVES_PROHIBIDAS,
  nombresDeClaves,
  rutasDeClaves,
} from '../lista-blanca.js';
import { crearPrismaDePrueba, envDeIntegracion } from './base-datos.js';

const P = '[catalogo-publico-test] ';
const URL_BASE = 'http://archivos.catalogo.test';
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const CACHE = 'public, max-age=60';

interface ServicioResumen {
  id: string;
  nombre: string;
  portadaUrl: string | null;
  precioReferencial: { desde: string; esReferencial: true } | null;
}
interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  servicios: ServicioResumen[];
}
interface Catalogo {
  categorias: Categoria[];
}

describe('catálogo público (integración)', () => {
  const prisma = crearPrismaDePrueba();
  const env = envDeIntegracion();
  const app = crearApp(env, { prisma, almacenamiento: crearAlmacenamientoMemoria(URL_BASE) });
  const ids = {
    catMurales: '',
    catCuadros: '',
    catVacia: '',
    catSoloInactivos: '',
    catInactiva: '',
    mural: '',
    muralSinFoto: '',
    cuadro: '',
    inactivo: '',
    deCategoriaInactiva: '',
    materialActivo: '',
  };

  async function limpiar(): Promise<void> {
    const prefijo = { nombre: { startsWith: P } };
    await prisma.servicio.deleteMany({ where: { categoria: prefijo } });
    await prisma.categoria.deleteMany({ where: prefijo });
    await prisma.material.deleteMany({ where: prefijo });
  }

  const catalogo = async (query = ''): Promise<Catalogo> => {
    const res = await request(app).get(`/api/v1/catalogo${query}`);
    expect(res.status).toBe(200);
    return res.body as Catalogo;
  };
  /** Solo las categorías de este archivo (la BD de pruebas puede tener otras). */
  const propias = (cuerpo: Catalogo) => cuerpo.categorias.filter((c) => c.nombre.startsWith(P));
  const ficha = (id: string) => request(app).get(`/api/v1/catalogo/servicios/${id}`);

  beforeAll(async () => {
    await limpiar();
    const categoria = async (nombre: string, orden: number, activa = true) =>
      (
        await prisma.categoria.create({
          data: { nombre: P + nombre, descripcion: `Descripción de ${nombre}`, orden, activa },
        })
      ).id;
    // Orden esperado: Cuadros y Murales (orden 1, por nombre). Las de orden 0 no tienen visibles.
    ids.catMurales = await categoria('Murales', 1);
    ids.catCuadros = await categoria('Cuadros', 1);
    ids.catVacia = await categoria('A vacía', 0);
    ids.catSoloInactivos = await categoria('B solo inactivos', 0);
    ids.catInactiva = await categoria('Inactiva', 0, false);

    ids.materialActivo = (
      await prisma.material.create({
        data: { nombre: `${P}Pintura acrílica`, unidad: 'litro', precioUnitario: '12.34' },
      })
    ).id;
    const materialInactivo = (
      await prisma.material.create({
        data: {
          nombre: `${P}Barniz viejo`,
          unidad: 'frasco',
          precioUnitario: '5.00',
          activo: false,
        },
      })
    ).id;

    const servicio = async (nombre: string, categoriaId: string, extra: object = {}) =>
      (
        await prisma.servicio.create({
          data: { nombre: P + nombre, categoriaId, horasManoObraReferencia: '4.50', ...extra },
        })
      ).id;
    const foto = (letra: string, orden: number) => ({
      url: 'ignorada',
      clave: `${randomUUID()}-${letra}.png`,
      orden,
      tipoMime: 'image/png',
      tamanoBytes: 10,
    });
    ids.mural = await servicio('Mural infantil', ids.catMurales, {
      descripcion: 'Mural para habitaciones infantiles',
      dimensionesOrientativas: 'Pared de hasta 3 m',
      observaciones: 'Incluye boceto previo',
      precioBaseReferencial: '120.5',
      materialesHabituales: {
        create: [
          { materialId: ids.materialActivo, cantidadReferencial: '2' },
          { materialId: materialInactivo },
        ],
      },
      imagenes: {
        create: [foto('b', 1), foto('a', 0), { url: 'https://externa.test/c.jpg', orden: 2 }],
      },
    });
    ids.muralSinFoto = await servicio('Abstracto sin foto', ids.catMurales);
    ids.cuadro = await servicio('Cuadro floral', ids.catCuadros, { precioBaseReferencial: '45' });
    ids.inactivo = await servicio('Mural retirado', ids.catMurales, { activo: false });
    await servicio('Solo inactivo', ids.catSoloInactivos, { activo: false });
    ids.deCategoriaInactiva = await servicio('Oculto por categoría', ids.catInactiva);
  });

  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  describe('GET /catalogo (RF-03)', () => {
    it('solo servicios activos de categorías activas; sin categorías vacías; en orden', async () => {
      const cuerpo = await catalogo();
      expect(cuerpo.categorias.every((c) => c.servicios.length > 0)).toBe(true);
      const mias = propias(cuerpo);
      expect(mias.map((c) => c.nombre)).toEqual([`${P}Cuadros`, `${P}Murales`]);
      expect(mias[1]?.servicios.map((s) => s.nombre)).toEqual([
        `${P}Abstracto sin foto`,
        `${P}Mural infantil`,
      ]);
      const todos = cuerpo.categorias.flatMap((c) => c.servicios.map((s) => s.id));
      expect(todos).not.toContain(ids.inactivo);
      expect(todos).not.toContain(ids.deCategoriaInactiva);
    });

    it('cada categoría y cada servicio traen solo los campos públicos', async () => {
      const mias = propias(await catalogo());
      expect(mias[1]).toEqual({
        id: ids.catMurales,
        nombre: `${P}Murales`,
        descripcion: 'Descripción de Murales',
        servicios: [
          {
            id: ids.muralSinFoto,
            nombre: `${P}Abstracto sin foto`,
            portadaUrl: null,
            precioReferencial: null,
          },
          {
            id: ids.mural,
            nombre: `${P}Mural infantil`,
            portadaUrl: expect.stringMatching(
              /^http:\/\/archivos\.catalogo\.test\/.+-a\.png$/,
            ) as string,
            precioReferencial: { desde: '120.50', esReferencial: true },
          },
        ],
      });
    });

    it('LISTA BLANCA: las claves del JSON son exactamente las permitidas', async () => {
      const cuerpo = { categorias: propias(await catalogo()) };
      expect(rutasDeClaves(cuerpo).sort()).toEqual(CLAVES_CATALOGO);
      for (const prohibida of CLAVES_PROHIBIDAS) {
        expect(nombresDeClaves(cuerpo)).not.toContain(prohibida);
      }
    });

    it('?q= busca por el nombre del servicio sin distinguir mayúsculas y escapa % y _', async () => {
      const mias = propias(await catalogo(`?q=${encodeURIComponent('MURAL INF')}`));
      expect(mias.map((c) => c.nombre)).toEqual([`${P}Murales`]);
      expect(mias[0]?.servicios.map((s) => s.id)).toEqual([ids.mural]);
      expect(propias(await catalogo('?q=%25'))).toEqual([]);
      expect(propias(await catalogo('?q=_'))).toEqual([]);
      // Un servicio inactivo no sale aunque coincida.
      expect(propias(await catalogo('?q=retirado'))).toEqual([]);
    });

    it('?categoriaId= limita a esa categoría; una inactiva o sin visibles da la lista vacía', async () => {
      const cuerpo = await catalogo(`?categoriaId=${ids.catCuadros}`);
      expect(cuerpo.categorias.map((c) => c.id)).toEqual([ids.catCuadros]);
      expect(cuerpo.categorias[0]?.servicios[0]?.precioReferencial).toEqual({
        desde: '45.00',
        esReferencial: true,
      });
      for (const id of [ids.catInactiva, ids.catVacia, ids.catSoloInactivos, ID_INEXISTENTE]) {
        expect((await catalogo(`?categoriaId=${id}`)).categorias).toEqual([]);
      }
    });

    it('una categoría desactivada oculta sus servicios sin desactivarlos', async () => {
      await prisma.categoria.update({ where: { id: ids.catCuadros }, data: { activa: false } });
      try {
        expect(propias(await catalogo()).map((c) => c.nombre)).toEqual([`${P}Murales`]);
        expect((await ficha(ids.cuadro)).status).toBe(404);
        const cuadro = await prisma.servicio.findUniqueOrThrow({ where: { id: ids.cuadro } });
        expect(cuadro.activo).toBe(true);
      } finally {
        await prisma.categoria.update({ where: { id: ids.catCuadros }, data: { activa: true } });
      }
      expect((await ficha(ids.cuadro)).status).toBe(200);
    });

    it('funciona sin token y un token (válido o no) no cambia la respuesta', async () => {
      const tokens = crearServicioTokens({ secreto: env.JWT_SECRET, duracion: '1h' });
      const tokenAdmin = tokens.firmar({ id: randomUUID(), rol: 'ADMIN' }).token;
      const sinToken = await request(app).get('/api/v1/catalogo');
      const conBasura = await request(app)
        .get('/api/v1/catalogo')
        .set('Authorization', 'Bearer basura');
      const conAdmin = await request(app)
        .get('/api/v1/catalogo')
        .set('Authorization', `Bearer ${tokenAdmin}`);
      for (const res of [sinToken, conBasura, conAdmin]) {
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe(CACHE);
      }
      expect(conBasura.body).toEqual(sinToken.body);
      expect(conAdmin.body).toEqual(sinToken.body);
    });

    it('CORS: responde a los orígenes permitidos de las apps', async () => {
      const origen = env.CORS_ORIGIN[0] ?? '';
      const res = await request(app).get('/api/v1/catalogo').set('Origin', origen);
      expect(res.headers['access-control-allow-origin']).toBe(origen);
    });
  });

  describe('GET /catalogo/servicios/:id (RF-04, RF-05)', () => {
    it('devuelve la ficha completa con fotos ordenadas y materiales activos sin precio', async () => {
      const res = await ficha(ids.mural);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe(CACHE);
      const { servicio } = res.body as { servicio: { fotos: { url: string }[] } };
      expect(servicio).toEqual({
        id: ids.mural,
        nombre: `${P}Mural infantil`,
        categoria: { id: ids.catMurales, nombre: `${P}Murales` },
        descripcion: 'Mural para habitaciones infantiles',
        dimensionesOrientativas: 'Pared de hasta 3 m',
        observaciones: 'Incluye boceto previo',
        materialesHabituales: [`${P}Pintura acrílica`],
        fotos: [
          { url: expect.stringMatching(/-a\.png$/) as string },
          { url: expect.stringMatching(/-b\.png$/) as string },
          { url: 'https://externa.test/c.jpg' },
        ],
        precioReferencial: { desde: '120.50', esReferencial: true },
      });
      // La portada del catálogo es la primera foto de la ficha.
      const mural = propias(await catalogo())
        .flatMap((c) => c.servicios)
        .find((s) => s.id === ids.mural);
      expect(mural?.portadaUrl).toBe(servicio.fotos[0]?.url);
    });

    it('LISTA BLANCA: claves exactas y ningún dato interno (precios, claves, estados)', async () => {
      const res = await ficha(ids.mural);
      expect(rutasDeClaves(res.body).sort()).toEqual(CLAVES_FICHA);
      for (const prohibida of CLAVES_PROHIBIDAS) {
        expect(nombresDeClaves(res.body)).not.toContain(prohibida);
      }
      const texto = JSON.stringify(res.body);
      expect(texto).not.toContain('12.34');
      expect(texto).not.toContain('4.50');
      expect(texto).not.toContain(ids.materialActivo);
    });

    it('un servicio sin fotos ni precio devuelve listas vacías y null', async () => {
      const res = await ficha(ids.muralSinFoto);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        servicio: {
          fotos: [],
          materialesHabituales: [],
          precioReferencial: null,
          descripcion: null,
        },
      });
    });

    it('inactivo, de categoría inactiva o inexistente → el MISMO 404', async () => {
      const cuerpos: unknown[] = [];
      for (const id of [ids.inactivo, ids.deCategoriaInactiva, ID_INEXISTENTE]) {
        const res = await ficha(id);
        expect(res.status).toBe(404);
        expect(res.headers['cache-control']).not.toBe(CACHE);
        cuerpos.push(res.body);
      }
      expect(cuerpos[0]).toEqual({
        error: { codigo: 'NO_ENCONTRADO', mensaje: MENSAJE_NO_DISPONIBLE },
      });
      expect(cuerpos[1]).toEqual(cuerpos[0]);
      expect(cuerpos[2]).toEqual(cuerpos[0]);
    });

    it('un id que no es UUID → 400 VALIDACION', async () => {
      const res = await ficha('123');
      expect(res.status).toBe(400);
      expect((res.body as { error: { codigo: string } }).error.codigo).toBe('VALIDACION');
    });

    it('desactivar el servicio lo saca de la ficha y del catálogo', async () => {
      await prisma.servicio.update({ where: { id: ids.cuadro }, data: { activo: false } });
      try {
        expect((await ficha(ids.cuadro)).status).toBe(404);
        expect(propias(await catalogo()).map((c) => c.nombre)).toEqual([`${P}Murales`]);
      } finally {
        await prisma.servicio.update({ where: { id: ids.cuadro }, data: { activo: true } });
      }
    });
  });
});

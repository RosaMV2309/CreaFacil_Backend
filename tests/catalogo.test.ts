/**
 * Catálogo público sin base de datos (RF-03, RF-04, RF-05, RN-01): reglas del servicio con un
 * repositorio falso, capa HTTP y validación de la query y del id.
 */
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import {
  CACHE_CATALOGO,
  crearCatalogoController,
} from '../src/modules/catalogo/catalogo.controller.js';
import type {
  CatalogoRepository,
  CategoriaCatalogoGuardada,
  FichaPublicaGuardada,
} from '../src/modules/catalogo/catalogo.repository.js';
import {
  aPrecioReferencial,
  crearCatalogoService,
  MENSAJE_NO_DISPONIBLE,
} from '../src/modules/catalogo/catalogo.service.js';
import { validate } from '../src/shared/middlewares/validate.js';
import {
  esquemasCatalogo,
  esquemasFichaPublica,
} from '../src/modules/catalogo/catalogo.schemas.js';
import { crearAlmacenamientoMemoria, crearAppDePrueba, crearAppSinBaseDatos } from './helpers.js';
import {
  CLAVES_CATALOGO,
  CLAVES_FICHA,
  CLAVES_PROHIBIDAS,
  nombresDeClaves,
  rutasDeClaves,
} from './lista-blanca.js';

const ID = '11111111-1111-4111-8111-111111111111';
const almacenamiento = crearAlmacenamientoMemoria('http://archivos.test');

const foto = (clave: string | null, url = 'https://externa.test/f.jpg', orden = 0) => ({
  id: `foto-${orden}`,
  clave,
  url,
  orden,
});

/** Datos guardados con campos internos «colados» para comprobar que el servicio no los copia. */
const CATEGORIAS: CategoriaCatalogoGuardada[] = [
  {
    id: 'cat-1',
    nombre: 'Murales',
    descripcion: 'Paredes pintadas',
    servicios: [
      {
        id: 'srv-1',
        nombre: 'Mural infantil',
        precioBaseReferencial: '120.50',
        portada: foto('a.png'),
        ...({ activo: true, horasManoObraReferencia: '3.00' } as object),
      },
      { id: 'srv-2', nombre: 'Mural sin foto', precioBaseReferencial: null, portada: null },
    ],
    ...({ activa: true, orden: 0 } as object),
  },
  { id: 'cat-vacia', nombre: 'Vacía', descripcion: null, servicios: [] },
];

const FICHA: FichaPublicaGuardada = {
  id: ID,
  nombre: 'Mural infantil',
  categoria: { id: 'cat-1', nombre: 'Murales', ...({ activa: true } as object) },
  descripcion: 'Descripción',
  dimensionesOrientativas: 'Pared de 3 m',
  observaciones: null,
  precioBaseReferencial: '120.50',
  materiales: ['Pintura acrílica'],
  fotos: [foto('a.png'), foto(null, 'https://externa.test/b.jpg', 1)],
  ...({ precioUnitario: '9.99', activo: true } as object),
};

function repositorioFalso(ficha: FichaPublicaGuardada | null = FICHA) {
  const llamadas: unknown[] = [];
  const repositorio: CatalogoRepository = {
    listar: (consulta) => {
      llamadas.push(consulta);
      return Promise.resolve(CATEGORIAS);
    },
    obtenerFicha: () => Promise.resolve(ficha),
  };
  return { repositorio, llamadas };
}

describe('catálogo público: servicio', () => {
  it('RN-01: el precio base se publica como referencial o null', () => {
    expect(aPrecioReferencial('120.50')).toEqual({ desde: '120.50', esReferencial: true });
    expect(aPrecioReferencial(null)).toBeNull();
  });

  it('lista las categorías con servicios, sin las vacías y solo con los campos públicos', async () => {
    const { repositorio, llamadas } = repositorioFalso();
    const catalogo = await crearCatalogoService(repositorio, almacenamiento).listar({
      q: 'mural',
      categoriaId: undefined,
    });
    expect(llamadas).toEqual([{ q: 'mural', categoriaId: undefined }]);
    expect(catalogo).toEqual({
      categorias: [
        {
          id: 'cat-1',
          nombre: 'Murales',
          descripcion: 'Paredes pintadas',
          servicios: [
            {
              id: 'srv-1',
              nombre: 'Mural infantil',
              portadaUrl: 'http://archivos.test/a.png',
              precioReferencial: { desde: '120.50', esReferencial: true },
            },
            { id: 'srv-2', nombre: 'Mural sin foto', portadaUrl: null, precioReferencial: null },
          ],
        },
      ],
    });
    expect(rutasDeClaves(catalogo).sort()).toEqual(CLAVES_CATALOGO);
  });

  it('la ficha copia solo la lista blanca y calcula las URL de las fotos', async () => {
    const ficha = await crearCatalogoService(
      repositorioFalso().repositorio,
      almacenamiento,
    ).obtenerFicha(ID);
    expect(ficha.fotos).toEqual([
      { url: 'http://archivos.test/a.png' },
      { url: 'https://externa.test/b.jpg' },
    ]);
    expect(ficha.materialesHabituales).toEqual(['Pintura acrílica']);
    expect(rutasDeClaves({ servicio: ficha }).sort()).toEqual(CLAVES_FICHA);
    for (const prohibida of CLAVES_PROHIBIDAS) {
      expect(nombresDeClaves(ficha)).not.toContain(prohibida);
    }
  });

  it('RF-05: un servicio no visible es un 404 con un mensaje que no revela nada', async () => {
    const servicio = crearCatalogoService(repositorioFalso(null).repositorio, almacenamiento);
    await expect(servicio.obtenerFicha(ID)).rejects.toMatchObject({
      estado: 404,
      codigo: 'NO_ENCONTRADO',
      message: MENSAJE_NO_DISPONIBLE,
    });
  });
});

describe('catálogo público: capa HTTP', () => {
  const app = crearAppDePrueba(
    Router()
      .get(
        '/',
        validate(esquemasCatalogo),
        crearCatalogoController(
          crearCatalogoService(repositorioFalso().repositorio, almacenamiento),
        ).listar,
      )
      .get(
        '/servicios/:id',
        validate(esquemasFichaPublica),
        crearCatalogoController(
          crearCatalogoService(repositorioFalso().repositorio, almacenamiento),
        ).obtenerFicha,
      ),
  );

  it('responde 200 con caché pública corta en el catálogo y en la ficha', async () => {
    const lista = await request(app).get('/?q=mural');
    expect(lista.status).toBe(200);
    expect(lista.headers['cache-control']).toBe(CACHE_CATALOGO);
    const ficha = await request(app).get(`/servicios/${ID}`);
    expect(ficha.status).toBe(200);
    expect(ficha.headers['cache-control']).toBe('public, max-age=60');
    expect(Object.keys(ficha.body as object)).toEqual(['servicio']);
  });
});

describe('catálogo público: validación (sin base de datos)', () => {
  const app = crearAppSinBaseDatos();

  it('un id que no es UUID → 400 VALIDACION sin consultar la base de datos', async () => {
    const res = await request(app).get('/api/v1/catalogo/servicios/no-es-uuid');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        codigo: 'VALIDACION',
        mensaje: expect.any(String) as string,
        detalles: [{ campo: 'id', ubicacion: 'params', mensaje: 'El id debe ser un UUID válido' }],
      },
    });
    expect(res.headers['cache-control']).not.toBe(CACHE_CATALOGO);
  });

  it('categoriaId inválido o q demasiado largo → 400 en la query', async () => {
    const res = await request(app).get(`/api/v1/catalogo?categoriaId=abc&q=${'x'.repeat(101)}`);
    expect(res.status).toBe(400);
    const campos = (
      res.body as { error: { detalles: { campo: string; ubicacion: string }[] } }
    ).error.detalles
      .map((d) => `${d.ubicacion}.${d.campo}`)
      .sort();
    expect(campos).toEqual(['query.categoriaId', 'query.q']);
  });

  it('no exige token: sin base de datos falla con 500, nunca con 401', async () => {
    const res = await request(app).get('/api/v1/catalogo');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

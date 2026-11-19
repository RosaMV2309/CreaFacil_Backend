/**
 * Gestión de categorías y materiales de la administradora contra PostgreSQL (RF-22, RF-08, RF-05,
 * RN-02). Usa la app real con la base de datos de pruebas.
 * Datos de este archivo: nombres con el prefijo `[catalogo-test] `, usuarios del dominio
 * `catalogo.creafacil.test` y una configuración de precios cerrada con costo 876.54. Se borran al
 * empezar y al terminar.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearApp } from '../../src/app.js';
import { generarHashPassword } from '../../src/shared/security/password.js';
import { crearPrismaDePrueba, envDeIntegracion } from './base-datos.js';

const P = '[catalogo-test] ';
const DOMINIO = '@catalogo.creafacil.test';
const PASSWORD = 'Clave-Catalogo-2026';
const COSTO_CONFIG = '876.54';
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

interface CuerpoError {
  error: {
    codigo: string;
    mensaje: string;
    detalles?: { campo: string; ubicacion: string; mensaje: string }[];
  };
}
interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  orden: number;
  serviciosActivos: number;
  serviciosTotales: number;
  creadoEn: string;
  actualizadoEn: string;
}
interface Material {
  id: string;
  nombre: string;
  descripcion: string | null;
  unidad: string;
  precioUnitario: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}
interface ListadoMateriales {
  datos: Material[];
  paginacion: { pagina: number; porPagina: number; total: number; totalPaginas: number };
}

const CLAVES_CATEGORIA = [
  'activa',
  'actualizadoEn',
  'creadoEn',
  'descripcion',
  'id',
  'nombre',
  'orden',
  'serviciosActivos',
  'serviciosTotales',
];
const CLAVES_MATERIAL = [
  'activo',
  'actualizadoEn',
  'creadoEn',
  'descripcion',
  'id',
  'nombre',
  'precioUnitario',
  'unidad',
];

describe('gestión del catálogo por la administradora (integración)', () => {
  const prisma = crearPrismaDePrueba();
  const app = crearApp(envDeIntegracion(), { prisma });
  let tokenAdmin = '';
  let tokenCliente = '';
  let clienteId = '';

  async function limpiar(): Promise<void> {
    const prefijo = { nombre: { startsWith: P } };
    await prisma.cotizacion.deleteMany({ where: { cliente: { email: { endsWith: DOMINIO } } } });
    await prisma.servicio.deleteMany({ where: { categoria: prefijo } });
    await prisma.categoria.deleteMany({ where: prefijo });
    await prisma.material.deleteMany({ where: prefijo });
    await prisma.configuracionPrecios.deleteMany({ where: { costoManoObraHora: COSTO_CONFIG } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: DOMINIO } } });
  }

  async function iniciarSesion(email: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return (res.body as { token: string }).token;
  }

  /** Petición autenticada como administradora (o con otro token, o sin él si es null). */
  function peticion(
    metodo: 'get' | 'post' | 'patch' | 'delete' | 'put',
    ruta: string,
    token: string | null = tokenAdmin,
  ) {
    const p = request(app)[metodo](`/api/v1/admin${ruta}`);
    return token ? p.set('Authorization', `Bearer ${token}`) : p;
  }

  beforeAll(async () => {
    await limpiar();
    const passwordHash = await generarHashPassword(PASSWORD);
    await prisma.usuario.create({
      data: { nombre: 'Admin Catálogo', email: `admin${DOMINIO}`, passwordHash, rol: 'ADMIN' },
    });
    const cliente = await prisma.usuario.create({
      data: { nombre: 'Cliente Catálogo', email: `cliente${DOMINIO}`, passwordHash },
    });
    clienteId = cliente.id;
    tokenAdmin = await iniciarSesion(`admin${DOMINIO}`);
    tokenCliente = await iniciarSesion(`cliente${DOMINIO}`);
  });

  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  describe('permisos heredados del grupo /admin', () => {
    it.each(['/categorias', '/materiales'])(
      '%s: 401 sin token y 403 con token de cliente',
      async (ruta) => {
        const sinToken = await peticion('get', ruta, null);
        const cliente = await peticion('post', ruta, tokenCliente).send({ nombre: `${P}Hack` });
        expect([sinToken.status, cliente.status]).toEqual([401, 403]);
        expect((sinToken.body as CuerpoError).error.codigo).toBe('NO_AUTENTICADO');
        expect((cliente.body as CuerpoError).error.codigo).toBe('PROHIBIDO');
        await expect(prisma.categoria.count({ where: { nombre: `${P}Hack` } })).resolves.toBe(0);
      },
    );
  });

  describe('categorías', () => {
    let murales: Categoria;

    it('POST crea con 201, normaliza el nombre y aplica los valores por defecto', async () => {
      const res = await peticion('post', '/categorias').send({
        nombre: `  ${P}Murales   Grandes `,
        descripcion: 'Murales pintados a mano',
      });
      expect(res.status).toBe(201);
      murales = (res.body as { categoria: Categoria }).categoria;
      expect(Object.keys(res.body as object)).toEqual(['categoria']);
      expect(Object.keys(murales).sort()).toEqual(CLAVES_CATEGORIA);
      expect(murales).toMatchObject({
        nombre: `${P}Murales Grandes`,
        descripcion: 'Murales pintados a mano',
        activa: true,
        orden: 0,
        serviciosActivos: 0,
        serviciosTotales: 0,
      });
      expect(new Date(murales.creadoEn).toISOString()).toBe(murales.creadoEn);
      expect(new Date(murales.actualizadoEn).toISOString()).toBe(murales.actualizadoEn);
    });

    it.each([`${P}murales grandes`, `  ${P.toUpperCase()}MURALES   GRANDES  `])(
      'nombre duplicado «%s» (mayúsculas/espacios) → 409 CONFLICTO',
      async (nombre) => {
        const res = await peticion('post', '/categorias').send({ nombre });
        expect(res.status).toBe(409);
        expect(res.body).toEqual({
          error: {
            codigo: 'CONFLICTO',
            mensaje: 'Ya existe una categoría con ese nombre.',
            detalles: [
              {
                campo: 'nombre',
                ubicacion: 'body',
                mensaje: 'Ya existe una categoría con ese nombre.',
              },
            ],
          },
        });
      },
    );

    it('los comodines % y _ del nombre no se interpretan al buscar duplicados', async () => {
      const a = await peticion('post', '/categorias').send({ nombre: `${P}Rebaja 100%_x` });
      const b = await peticion('post', '/categorias').send({ nombre: `${P}REBAJA 100%_X` });
      const c = await peticion('post', '/categorias').send({ nombre: `${P}Rebaja 1000ax` });
      expect([a.status, b.status, c.status]).toEqual([201, 409, 201]);
    });

    it('POST inválido → 400 VALIDACION con un detalle por campo', async () => {
      const res = await peticion('post', '/categorias').send({
        nombre: 'A',
        orden: -1,
        activa: 'no',
        id: ID_INEXISTENTE,
      });
      expect(res.status).toBe(400);
      const campos = (res.body as CuerpoError).error.detalles?.map((d) => d.campo).sort();
      expect(campos).toEqual(['activa', 'id', 'nombre', 'orden']);
    });

    it('GET /:id → 200; id no UUID → 400; inexistente → 404', async () => {
      const ok = await peticion('get', `/categorias/${murales.id}`);
      expect(ok.status).toBe(200);
      expect((ok.body as { categoria: Categoria }).categoria).toEqual(murales);

      const malId = await peticion('get', '/categorias/123');
      expect(malId.status).toBe(400);
      expect((malId.body as CuerpoError).error.detalles).toEqual([
        { campo: 'id', ubicacion: 'params', mensaje: 'El id debe ser un UUID válido' },
      ]);

      const noExiste = await peticion('get', `/categorias/${ID_INEXISTENTE}`);
      expect(noExiste.status).toBe(404);
      expect(noExiste.body).toEqual({
        error: { codigo: 'NO_ENCONTRADO', mensaje: 'La categoría no existe.' },
      });
    });

    it('PATCH edita un subconjunto de campos (200) y descripcion null la borra', async () => {
      const res = await peticion('patch', `/categorias/${murales.id}`).send({
        orden: 5,
        descripcion: null,
      });
      expect(res.status).toBe(200);
      const editada = (res.body as { categoria: Categoria }).categoria;
      expect(editada).toMatchObject({ nombre: murales.nombre, orden: 5, descripcion: null });
      expect(editada.actualizadoEn >= murales.actualizadoEn).toBe(true);
    });

    it('PATCH puede cambiar las mayúsculas de su propio nombre (no es un duplicado)', async () => {
      const res = await peticion('patch', `/categorias/${murales.id}`).send({
        nombre: `${P}MURALES grandes`,
      });
      expect(res.status).toBe(200);
      expect((res.body as { categoria: Categoria }).categoria.nombre).toBe(`${P}MURALES grandes`);
    });

    it('PATCH con el nombre de OTRA categoría → 409', async () => {
      const res = await peticion('patch', `/categorias/${murales.id}`).send({
        nombre: `${P}rebaja 1000AX`,
      });
      expect(res.status).toBe(409);
    });

    it('PATCH sin campos, con un campo prohibido o inexistente → 400 / 404', async () => {
      const vacio = await peticion('patch', `/categorias/${murales.id}`).send({});
      expect(vacio.status).toBe(400);
      expect((vacio.body as CuerpoError).error.detalles?.[0]?.mensaje).toBe(
        'Envía al menos un campo para actualizar: nombre, descripcion, orden o activa',
      );
      const prohibido = await peticion('patch', `/categorias/${murales.id}`).send({
        creadoEn: '2020-01-01',
      });
      expect(prohibido.status).toBe(400);
      const noExiste = await peticion('patch', `/categorias/${ID_INEXISTENTE}`).send({ orden: 1 });
      expect([noExiste.status, (noExiste.body as CuerpoError).error.mensaje]).toEqual([
        404,
        'La categoría no existe.',
      ]);
    });

    it('desactivar y volver a activar (sin borrar nada)', async () => {
      const desactivada = await peticion('patch', `/categorias/${murales.id}`).send({
        activa: false,
      });
      expect(desactivada.status).toBe(200);
      expect((desactivada.body as { categoria: Categoria }).categoria.activa).toBe(false);
      await expect(
        prisma.categoria.findUniqueOrThrow({ where: { id: murales.id } }),
      ).resolves.toMatchObject({ activa: false });

      const activada = await peticion('patch', `/categorias/${murales.id}`).send({ activa: true });
      expect((activada.body as { categoria: Categoria }).categoria.activa).toBe(true);
    });

    it('no existe DELETE: responde 404 RUTA_NO_ENCONTRADA y la categoría sigue', async () => {
      const res = await peticion('delete', `/categorias/${murales.id}`);
      expect(res.status).toBe(404);
      expect((res.body as CuerpoError).error.codigo).toBe('RUTA_NO_ENCONTRADA');
      const put = await peticion('put', `/categorias/${murales.id}`).send({ nombre: 'x' });
      expect(put.status).toBe(404);
      await expect(prisma.categoria.count({ where: { id: murales.id } })).resolves.toBe(1);
    });

    it('el listado incluye serviciosActivos y serviciosTotales', async () => {
      await prisma.servicio.createMany({
        data: [
          { categoriaId: murales.id, nombre: 'Mural infantil', descripcion: 'x' },
          { categoriaId: murales.id, nombre: 'Mural paisaje', descripcion: 'x' },
          { categoriaId: murales.id, nombre: 'Mural retirado', descripcion: 'x', activo: false },
        ],
      });
      const res = await peticion('get', `/categorias?q=${encodeURIComponent(P)}`);
      expect(res.status).toBe(200);
      const { datos } = res.body as { datos: Categoria[] };
      expect(Object.keys(res.body as object)).toEqual(['datos']);
      const fila = datos.find((c) => c.id === murales.id);
      expect(fila).toMatchObject({ serviciosActivos: 2, serviciosTotales: 3 });
      for (const categoria of datos) {
        expect(Object.keys(categoria).sort()).toEqual(CLAVES_CATEGORIA);
        if (categoria.id !== murales.id) {
          expect([categoria.serviciosActivos, categoria.serviciosTotales]).toEqual([0, 0]);
        }
      }
      // GET /:id también los trae.
      const una = await peticion('get', `/categorias/${murales.id}`);
      expect((una.body as { categoria: Categoria }).categoria.serviciosTotales).toBe(3);
    });

    it('desactivar una categoría NO desactiva sus servicios (los oculta el catálogo, 2.3)', async () => {
      const res = await peticion('patch', `/categorias/${murales.id}`).send({ activa: false });
      expect((res.body as { categoria: Categoria }).categoria).toMatchObject({
        activa: false,
        serviciosActivos: 2,
      });
      await expect(
        prisma.servicio.count({ where: { categoriaId: murales.id, activo: true } }),
      ).resolves.toBe(2);
    });

    it('ordena por «orden» y después por nombre; filtra por activa y q', async () => {
      await peticion('post', '/categorias').send({ nombre: `${P}Zeta`, orden: 1 });
      await peticion('post', '/categorias').send({ nombre: `${P}Alfa`, orden: 1 });
      const q = `q=${encodeURIComponent(P)}`;

      const todas = (await peticion('get', `/categorias?${q}`)).body as { datos: Categoria[] };
      // (El orden relativo de «Rebaja 100%_x» y «Rebaja 1000ax» depende de la collation: no se fija.)
      expect(todas.datos.map((c) => c.orden)).toEqual([0, 0, 1, 1, 5]);
      expect(todas.datos.slice(2).map((c) => c.nombre.replace(P, ''))).toEqual([
        'Alfa',
        'Zeta',
        'MURALES grandes',
      ]);

      const inactivas = (await peticion('get', `/categorias?${q}&activa=false`)).body as {
        datos: Categoria[];
      };
      expect(inactivas.datos.map((c) => c.id)).toEqual([murales.id]);
      const activas = (await peticion('get', `/categorias?${q}&activa=true`)).body as {
        datos: Categoria[];
      };
      expect(activas.datos).toHaveLength(4);

      const porNombre = (await peticion('get', `/categorias?q=${encodeURIComponent('100%')}`))
        .body as { datos: Categoria[] };
      expect(porNombre.datos.map((c) => c.nombre)).toEqual([`${P}Rebaja 100%_x`]);

      const vacia = await peticion('get', '/categorias?q=nada-se-llama-asi');
      expect(vacia.body).toEqual({ datos: [] });

      const malFiltro = await peticion('get', '/categorias?activa=1');
      expect(malFiltro.status).toBe(400);
    });
  });

  describe('materiales', () => {
    let fomix: Material;

    it('POST con precio numérico → 201 y precio como texto «0.75»', async () => {
      const res = await peticion('post', '/materiales').send({
        nombre: `${P}Fomix`,
        unidad: 'plancha',
        precioUnitario: 0.75,
      });
      expect(res.status).toBe(201);
      fomix = (res.body as { material: Material }).material;
      expect(Object.keys(res.body as object)).toEqual(['material']);
      expect(Object.keys(fomix).sort()).toEqual(CLAVES_MATERIAL);
      expect(fomix).toMatchObject({
        nombre: `${P}Fomix`,
        unidad: 'plancha',
        precioUnitario: '0.75',
        activo: true,
        descripcion: null,
      });
    });

    it('POST con precio en texto → se guarda exacto en Decimal(12,2)', async () => {
      const res = await peticion('post', '/materiales').send({
        nombre: `${P}Pintura`,
        unidad: 'litro',
        precioUnitario: '12.5',
        descripcion: 'Acrílica',
        activo: false,
      });
      expect(res.status).toBe(201);
      const pintura = (res.body as { material: Material }).material;
      expect(pintura).toMatchObject({ precioUnitario: '12.50', activo: false });
      const guardado = await prisma.material.findUniqueOrThrow({ where: { id: pintura.id } });
      expect(guardado.precioUnitario.toFixed(2)).toBe('12.50');
    });

    it.each([
      [0.1 + 0.2, 'El precio unitario debe ser un número positivo con hasta 2 decimales'],
      ['1.234', 'El precio unitario debe ser un número positivo con hasta 2 decimales'],
      ['0,75', 'usa punto decimal'],
      [0, 'El precio unitario debe ser mayor que 0'],
      [-3, 'El precio unitario debe ser un número positivo'],
      [100000, 'como máximo 99999.99'],
      [null, 'El precio unitario debe ser un número o un texto'],
    ])('precio %j → 400 en precioUnitario', async (precioUnitario, mensaje) => {
      const res = await peticion('post', '/materiales').send({
        nombre: `${P}Precio malo`,
        unidad: 'unidad',
        precioUnitario,
      });
      expect(res.status).toBe(400);
      const detalle = (res.body as CuerpoError).error.detalles?.[0];
      expect(detalle?.campo).toBe('precioUnitario');
      expect(detalle?.mensaje).toContain(mensaje);
      await expect(prisma.material.count({ where: { nombre: `${P}Precio malo` } })).resolves.toBe(
        0,
      );
    });

    it('nombre duplicado (sin distinguir mayúsculas) → 409', async () => {
      const res = await peticion('post', '/materiales').send({
        nombre: ` ${P}FOMIX `,
        unidad: 'plancha',
        precioUnitario: 1,
      });
      expect(res.status).toBe(409);
      expect((res.body as CuerpoError).error.mensaje).toBe('Ya existe un material con ese nombre.');
    });

    it('RN-02: cambiar el precio NO toca la copia guardada en una cotización', async () => {
      // Cotización guardada con el precio de ese momento (0.75).
      const categoria = await prisma.categoria.create({ data: { nombre: `${P}Para cotizar` } });
      const servicio = await prisma.servicio.create({
        data: { categoriaId: categoria.id, nombre: 'Letrero', descripcion: 'x' },
      });
      const configuracion = await prisma.configuracionPrecios.create({
        data: {
          costoManoObraHora: COSTO_CONFIG,
          factorComplejidadBaja: '1.00',
          factorComplejidadMedia: '1.25',
          factorComplejidadAlta: '1.50',
          vigenteDesde: new Date('2020-01-01'),
          vigenteHasta: new Date('2020-01-02'),
        },
      });
      const cotizacion = await prisma.cotizacion.create({
        data: {
          clienteId,
          servicioId: servicio.id,
          configuracionPreciosId: configuracion.id,
          detallesDiseno: 'x',
          complejidad: 'BAJA',
          horasManoObra: '1',
          costoManoObraHora: COSTO_CONFIG,
          factorComplejidad: '1.00',
          subtotalMateriales: '1.50',
          costoManoObra: COSTO_CONFIG,
          valorEstimado: '878.04',
          materiales: {
            create: {
              materialId: fomix.id,
              cantidad: '2',
              precioUnitario: '0.75',
              subtotal: '1.50',
            },
          },
        },
      });

      const res = await peticion('patch', `/materiales/${fomix.id}`).send({ precioUnitario: 0.3 });
      expect(res.status).toBe(200);
      expect((res.body as { material: Material }).material.precioUnitario).toBe('0.30');

      const detalle = await prisma.detalleCotizacionMaterial.findFirstOrThrow({
        where: { cotizacionId: cotizacion.id },
      });
      expect([detalle.precioUnitario.toFixed(2), detalle.subtotal.toFixed(2)]).toEqual([
        '0.75',
        '1.50',
      ]);
      const guardada = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacion.id } });
      expect(guardada.valorEstimado.toFixed(2)).toBe('878.04');
    });

    it('PATCH: unidad, desactivar y reactivar; 400/404 como en categorías', async () => {
      const unidad = await peticion('patch', `/materiales/${fomix.id}`).send({ unidad: 'm²' });
      expect((unidad.body as { material: Material }).material).toMatchObject({
        unidad: 'm²',
        precioUnitario: '0.30',
      });
      const desactivado = await peticion('patch', `/materiales/${fomix.id}`).send({
        activo: false,
      });
      expect((desactivado.body as { material: Material }).material.activo).toBe(false);
      const reactivado = await peticion('patch', `/materiales/${fomix.id}`).send({ activo: true });
      expect((reactivado.body as { material: Material }).material.activo).toBe(true);

      const vacio = await peticion('patch', `/materiales/${fomix.id}`).send({});
      const malId = await peticion('patch', '/materiales/abc').send({ activo: true });
      const noExiste = await peticion('patch', `/materiales/${ID_INEXISTENTE}`).send({
        activo: true,
      });
      expect([vacio.status, malId.status, noExiste.status]).toEqual([400, 400, 404]);
      expect((noExiste.body as CuerpoError).error.mensaje).toBe('El material no existe.');

      const otro = await peticion('patch', `/materiales/${fomix.id}`).send({
        nombre: `${P}pintura`,
      });
      expect(otro.status).toBe(409);
    });

    it('GET /:id → 200 y 404', async () => {
      const ok = await peticion('get', `/materiales/${fomix.id}`);
      expect((ok.body as { material: Material }).material.id).toBe(fomix.id);
      const noExiste = await peticion('get', `/materiales/${ID_INEXISTENTE}`);
      expect(noExiste.status).toBe(404);
    });

    it('listado paginado, ordenado por nombre, con q y activo', async () => {
      for (const nombre of ['Cartulina', 'Silicona', 'Barniz']) {
        await peticion('post', '/materiales').send({
          nombre: `${P}${nombre}`,
          unidad: 'unidad',
          precioUnitario: '1.10',
        });
      }
      const q = `q=${encodeURIComponent(P)}`;
      const p1 = (await peticion('get', `/materiales?${q}&porPagina=2`)).body as ListadoMateriales;
      const p3 = (await peticion('get', `/materiales?${q}&porPagina=2&pagina=3`))
        .body as ListadoMateriales;
      expect(p1.paginacion).toEqual({ pagina: 1, porPagina: 2, total: 5, totalPaginas: 3 });
      expect(p1.datos.map((m) => m.nombre.replace(P, ''))).toEqual(['Barniz', 'Cartulina']);
      expect(p3.datos.map((m) => m.nombre.replace(P, ''))).toEqual(['Silicona']);
      for (const material of p1.datos) {
        expect(Object.keys(material).sort()).toEqual(CLAVES_MATERIAL);
        expect(material.precioUnitario).toMatch(/^\d+\.\d{2}$/);
      }

      const inactivos = (await peticion('get', `/materiales?${q}&activo=false`))
        .body as ListadoMateriales;
      expect(inactivos.datos.map((m) => m.nombre)).toEqual([`${P}Pintura`]);

      // Sin q ni activo: todos, con la paginación por defecto.
      const sinFiltros = (await peticion('get', '/materiales')).body as ListadoMateriales;
      expect(sinFiltros.paginacion).toMatchObject({ pagina: 1, porPagina: 20 });
      expect(sinFiltros.paginacion.total).toBeGreaterThanOrEqual(5);

      const malos = await Promise.all(
        ['?porPagina=101', '?pagina=0', '?activo=si'].map((query) =>
          peticion('get', `/materiales${query}`),
        ),
      );
      expect(malos.map((r) => r.status)).toEqual([400, 400, 400]);
    });

    it('no existe DELETE: 404 RUTA_NO_ENCONTRADA y el material sigue', async () => {
      const res = await peticion('delete', `/materiales/${fomix.id}`);
      expect(res.status).toBe(404);
      expect((res.body as CuerpoError).error.codigo).toBe('RUTA_NO_ENCONTRADA');
      await expect(prisma.material.count({ where: { id: fomix.id } })).resolves.toBe(1);
    });
  });
});

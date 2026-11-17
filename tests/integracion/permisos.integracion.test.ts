/**
 * Permisos por rol y edición del perfil contra PostgreSQL (RF-01, RF-02, RNF-03, RN-05).
 * Usa la app real con la base de datos de pruebas. Los usuarios creados aquí tienen correos del
 * dominio `permisos.creafacil.test` y se borran al empezar y al terminar.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearApp } from '../../src/app.js';
import { generarHashPassword } from '../../src/shared/security/password.js';
import { crearPrismaDePrueba, envDeIntegracion } from './base-datos.js';

const DOMINIO = '@permisos.creafacil.test';
const PASSWORD = 'Clave-Permisos-2026';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: 'ADMIN' | 'CLIENTE';
}
interface Sesion {
  token: string;
  usuario: Usuario;
}
interface CuerpoError {
  error: {
    codigo: string;
    mensaje: string;
    detalles?: { campo: string; ubicacion: string; mensaje: string }[];
  };
}
interface ClienteListado {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  activo: boolean;
  creadoEn: string;
}
interface Listado {
  datos: ClienteListado[];
  paginacion: { pagina: number; porPagina: number; total: number; totalPaginas: number };
}

describe('permisos por rol y perfil con PostgreSQL (integración)', () => {
  const prisma = crearPrismaDePrueba();
  const app = crearApp(envDeIntegracion(), { prisma });

  let ana: Sesion;
  let beto: Sesion;
  let admin: Sesion;

  async function limpiar(): Promise<void> {
    await prisma.usuario.deleteMany({ where: { email: { endsWith: DOMINIO } } });
  }

  async function registrar(nombre: string, local: string): Promise<Sesion> {
    const res = await request(app)
      .post('/api/v1/auth/registro')
      .send({ nombre, email: `${local}${DOMINIO}`, password: PASSWORD, telefono: '0991234567' });
    expect(res.status).toBe(201);
    return res.body as Sesion;
  }

  function patchPerfil(token: string | null, cuerpo?: unknown) {
    const peticion = request(app).patch('/api/v1/auth/perfil');
    if (token) peticion.set('Authorization', `Bearer ${token}`);
    return cuerpo === undefined ? peticion : peticion.send(cuerpo as object);
  }

  function listar(token: string | null, query = '') {
    const peticion = request(app).get(`/api/v1/admin/clientes${query}`);
    return token ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
  }

  beforeAll(async () => {
    await limpiar();
    ana = await registrar('Ana Permisos', 'ana');
    beto = await registrar('Beto Permisos', 'beto');
    // Más clientes para la paginación y la búsqueda (uno con un % en el nombre y otro desactivado).
    for (let i = 1; i <= 3; i++) {
      await registrar(`Cliente Extra ${i}`, `extra${i}`);
    }
    await registrar('Rebaja 100% Permisos', 'porcentaje');
    await prisma.usuario.update({
      where: { email: `extra3${DOMINIO}` },
      data: { activo: false },
    });
    await prisma.usuario.create({
      data: {
        nombre: 'Administradora Permisos',
        email: `admin${DOMINIO}`,
        passwordHash: await generarHashPassword(PASSWORD),
        rol: 'ADMIN',
      },
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `admin${DOMINIO}`, password: PASSWORD });
    expect(login.status).toBe(200);
    admin = login.body as Sesion;
  });

  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  describe('PATCH /api/v1/auth/perfil', () => {
    it('cambia el nombre: 200 { usuario } con la misma forma que GET /perfil', async () => {
      const res = await patchPerfil(ana.token, { nombre: '  Ana María Permisos ' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        usuario: { ...ana.usuario, nombre: 'Ana María Permisos' },
      });

      const perfil = await request(app)
        .get('/api/v1/auth/perfil')
        .set('Authorization', `Bearer ${ana.token}`);
      expect(perfil.body).toEqual(res.body);
      expect(res.text).not.toMatch(/passwordHash|\$2[aby]\$/);
    });

    it('cambia el teléfono (normalizado)', async () => {
      const res = await patchPerfil(ana.token, { telefono: '+593 98 765-4321' });
      expect(res.status).toBe(200);
      expect((res.body as { usuario: Usuario }).usuario.telefono).toBe('+593987654321');
    });

    it.each([null, ''])('telefono %j borra el teléfono', async (telefono) => {
      await patchPerfil(ana.token, { telefono: '0991234567' });
      const res = await patchPerfil(ana.token, { telefono });
      expect(res.status).toBe(200);
      expect((res.body as { usuario: Usuario }).usuario.telefono).toBeNull();
      const guardado = await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuario.id } });
      expect(guardado.telefono).toBeNull();
    });

    it('la administradora también puede editar su perfil', async () => {
      const res = await patchPerfil(admin.token, { nombre: 'Administradora Editada' });
      expect(res.status).toBe(200);
      expect((res.body as { usuario: Usuario }).usuario).toMatchObject({
        nombre: 'Administradora Editada',
        rol: 'ADMIN',
      });
    });

    it.each([
      ['sin cuerpo', undefined],
      ['con un objeto vacío', {}],
    ])('%s: 400 «al menos un campo»', async (_caso, cuerpo) => {
      const res = await patchPerfil(ana.token, cuerpo);
      expect(res.status).toBe(400);
      expect((res.body as CuerpoError).error.detalles).toEqual([
        {
          campo: 'body',
          ubicacion: 'body',
          mensaje: 'Envía al menos un campo para actualizar: nombre o telefono',
        },
      ]);
    });

    it.each([
      [{ nombre: 'A' }, 'nombre', 'El nombre debe tener al menos 2 caracteres'],
      [{ nombre: 'x'.repeat(121) }, 'nombre', 'El nombre no puede superar 120 caracteres'],
      [{ telefono: 'abc' }, 'telefono', 'El teléfono debe tener de 7 a 15 dígitos'],
    ])('%j: 400 VALIDACION en el campo', async (cuerpo, campo, mensaje) => {
      const res = await patchPerfil(ana.token, cuerpo);
      expect(res.status).toBe(400);
      expect((res.body as CuerpoError).error.detalles).toContainEqual(
        expect.objectContaining({ campo, mensaje: expect.stringContaining(mensaje) as unknown }),
      );
    });

    it.each([
      ['email', { email: `otro${DOMINIO}` }],
      ['rol', { rol: 'ADMIN' }],
      ['password', { password: 'Otra-Clave-2026' }],
      ['id', { id: '00000000-0000-4000-8000-000000000000' }],
      ['activo', { activo: false }],
    ])('intentar cambiar %s: 400 y no cambia nada', async (campo, cambio) => {
      const antes = await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuario.id } });
      const res = await patchPerfil(ana.token, { nombre: 'Nombre Nuevo', ...cambio });

      expect(res.status).toBe(400);
      const cuerpo = res.body as CuerpoError;
      expect(cuerpo.error.codigo).toBe('VALIDACION');
      expect(cuerpo.error.detalles).toContainEqual({
        campo,
        ubicacion: 'body',
        mensaje: 'Este campo no se puede modificar: solo se pueden cambiar nombre y telefono',
      });
      const despues = await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuario.id } });
      expect(despues).toEqual(antes);
    });

    it('sin token: 401 NO_AUTENTICADO (antes que validar)', async () => {
      const res = await patchPerfil(null, { rol: 'ADMIN' });
      expect(res.status).toBe(401);
      expect((res.body as CuerpoError).error.codigo).toBe('NO_AUTENTICADO');
    });

    it('RN-05: un cliente no puede modificar a otro usuario (ni por el cuerpo ni por la URL)', async () => {
      const betoAntes = await prisma.usuario.findUniqueOrThrow({ where: { id: beto.usuario.id } });

      const porCuerpo = await patchPerfil(ana.token, { id: beto.usuario.id, nombre: 'Hackeado' });
      const porUrl = await request(app)
        .patch(`/api/v1/auth/perfil/${beto.usuario.id}`)
        .set('Authorization', `Bearer ${ana.token}`)
        .send({ nombre: 'Hackeado' });

      expect(porCuerpo.status).toBe(400);
      expect(porUrl.status).toBe(404);
      await expect(
        prisma.usuario.findUniqueOrThrow({ where: { id: beto.usuario.id } }),
      ).resolves.toEqual(betoAntes);
    });

    it('con el token de Beto solo cambia Beto', async () => {
      const res = await patchPerfil(beto.token, { nombre: 'Beto Editado' });
      expect((res.body as { usuario: Usuario }).usuario.id).toBe(beto.usuario.id);
      const anaAhora = await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuario.id } });
      expect(anaAhora.nombre).not.toBe('Beto Editado');
    });

    it('cuenta desactivada después de emitir el token: 401 y no se modifica', async () => {
      const temporal = await registrar('Temporal Permisos', 'temporal');
      await prisma.usuario.update({ where: { id: temporal.usuario.id }, data: { activo: false } });

      const res = await patchPerfil(temporal.token, { nombre: 'No Debe Cambiar' });
      expect(res.status).toBe(401);
      const guardado = await prisma.usuario.findUniqueOrThrow({
        where: { id: temporal.usuario.id },
      });
      expect(guardado.nombre).toBe('Temporal Permisos');
    });
  });

  describe('GET /api/v1/admin/clientes', () => {
    /** Solo cuenta los clientes de este archivo (la BD de pruebas puede tener otros). */
    const query = (extra = '') => `?q=${encodeURIComponent(DOMINIO)}${extra}`;

    it('sin token: 401 NO_AUTENTICADO', async () => {
      const res = await listar(null);
      expect(res.status).toBe(401);
      expect((res.body as CuerpoError).error.codigo).toBe('NO_AUTENTICADO');
    });

    it('con token de CLIENTE: 403 PROHIBIDO con mensaje en español (RF-02)', async () => {
      const res = await listar(ana.token);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: { codigo: 'PROHIBIDO', mensaje: 'No tienes permiso para realizar esta acción.' },
      });
    });

    it('como ADMIN: 200 { datos, paginacion } solo con clientes y sin hash', async () => {
      const res = await listar(admin.token, query());
      expect(res.status).toBe(200);
      const cuerpo = res.body as Listado;
      expect(Object.keys(cuerpo).sort()).toEqual(['datos', 'paginacion']);
      // ana, beto, extra1-3, porcentaje y temporal (la administradora no aparece).
      expect(cuerpo.paginacion).toEqual({ pagina: 1, porPagina: 20, total: 7, totalPaginas: 1 });
      expect(cuerpo.datos.map((c) => c.email)).not.toContain(`admin${DOMINIO}`);
      for (const cliente of cuerpo.datos) {
        expect(Object.keys(cliente).sort()).toEqual([
          'activo',
          'creadoEn',
          'email',
          'id',
          'nombre',
          'telefono',
        ]);
        expect(new Date(cliente.creadoEn).toISOString()).toBe(cliente.creadoEn);
      }
      expect(cuerpo.datos.find((c) => c.email === `extra3${DOMINIO}`)?.activo).toBe(false);
      expect(res.text).not.toMatch(/passwordHash|password|\$2[aby]\$/);
    });

    it('ordena del más reciente al más antiguo', async () => {
      const cuerpo = (await listar(admin.token, query())).body as Listado;
      const fechas = cuerpo.datos.map((c) => c.creadoEn);
      expect([...fechas].sort().reverse()).toEqual(fechas);
    });

    it('pagina sin repetir ni perder clientes', async () => {
      const p1 = (await listar(admin.token, query('&porPagina=3&pagina=1'))).body as Listado;
      const p2 = (await listar(admin.token, query('&porPagina=3&pagina=2'))).body as Listado;
      const p3 = (await listar(admin.token, query('&porPagina=3&pagina=3'))).body as Listado;
      const p4 = (await listar(admin.token, query('&porPagina=3&pagina=4'))).body as Listado;

      expect(p1.paginacion).toEqual({ pagina: 1, porPagina: 3, total: 7, totalPaginas: 3 });
      expect([p1.datos.length, p2.datos.length, p3.datos.length, p4.datos.length]).toEqual([
        3, 3, 1, 0,
      ]);
      const ids = [...p1.datos, ...p2.datos, ...p3.datos].map((c) => c.id);
      expect(new Set(ids).size).toBe(7);
    });

    it('busca por nombre o correo sin distinguir mayúsculas', async () => {
      const porNombre = (await listar(admin.token, '?q=ANA%20MAR')).body as Listado;
      expect(porNombre.datos.map((c) => c.id)).toEqual([ana.usuario.id]);

      const porCorreo = (await listar(admin.token, `?q=BETO${encodeURIComponent(DOMINIO)}`))
        .body as Listado;
      expect(porCorreo.datos.map((c) => c.id)).toEqual([beto.usuario.id]);

      const sinResultados = (await listar(admin.token, '?q=nadie-se-llama-asi')).body as Listado;
      expect(sinResultados).toEqual({
        datos: [],
        paginacion: { pagina: 1, porPagina: 20, total: 0, totalPaginas: 0 },
      });
    });

    it('los comodines % y _ se buscan literalmente', async () => {
      const porcentaje = (await listar(admin.token, '?q=100%25')).body as Listado;
      expect(porcentaje.datos.map((c) => c.email)).toEqual([`porcentaje${DOMINIO}`]);

      const guionBajo = (await listar(admin.token, `?q=_${encodeURIComponent(DOMINIO)}`))
        .body as Listado;
      expect(guionBajo.paginacion.total).toBe(0);
    });

    it.each([
      ['?pagina=0', 'pagina'],
      ['?pagina=abc', 'pagina'],
      ['?porPagina=101', 'porPagina'],
      ['?q=a&q=b', 'q'],
    ])('query inválida %s: 400 VALIDACION en %s', async (consulta, campo) => {
      const res = await listar(admin.token, consulta);
      expect(res.status).toBe(400);
      const cuerpo = res.body as CuerpoError;
      expect(cuerpo.error.codigo).toBe('VALIDACION');
      expect(cuerpo.error.detalles).toContainEqual(
        expect.objectContaining({ campo, ubicacion: 'query' }),
      );
    });

    it('una query inválida de un CLIENTE recibe 403, no 400 (el rol se comprueba primero)', async () => {
      const res = await listar(ana.token, '?pagina=0');
      expect(res.status).toBe(403);
    });
  });
});

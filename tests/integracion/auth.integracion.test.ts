/**
 * Autenticación de punta a punta contra PostgreSQL (RF-01, RF-02, RNF-01, RN-05).
 * Usa la app real (`crearApp`) con la base de datos de pruebas. Cada usuario creado aquí tiene un
 * correo del dominio `auth.creafacil.test` y se borra al empezar y al terminar.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearApp } from '../../src/app.js';
import { crearLimitadorLogin } from '../../src/shared/middlewares/limite-intentos.js';
import { generarHashPassword } from '../../src/shared/security/password.js';
import { crearPrismaDePrueba, envDeIntegracion } from './base-datos.js';

const DOMINIO = '@auth.creafacil.test';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface UsuarioRespuesta {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: 'ADMIN' | 'CLIENTE';
}
interface Sesion {
  token: string;
  tipo: string;
  expiraEn: string;
  usuario: UsuarioRespuesta;
}
interface CuerpoError {
  error: { codigo: string; mensaje: string; detalles?: { campo: string; mensaje: string }[] };
}

/** Ninguna respuesta debe contener el hash ni la contraseña (RNF-01). */
function sinSecretos(res: request.Response, password?: string): void {
  expect(res.text).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
  if (password) expect(res.text).not.toContain(password);
}

describe('API de autenticación con PostgreSQL (integración)', () => {
  const prisma = crearPrismaDePrueba();
  let ahora = Date.now();
  const app = crearApp(envDeIntegracion(), { prisma, reloj: () => new Date(ahora) });

  const cliente = {
    nombre: '  Ana Cliente  ',
    email: `  Ana.Cliente${DOMINIO.toUpperCase()} `,
    password: 'Clave-Cliente-2026',
    telefono: '+593 99 123-4567',
  };
  const emailCliente = `ana.cliente${DOMINIO}`;
  const admin = { email: `admin${DOMINIO}`, password: 'Clave-Admin-2026' };
  const inactiva = { email: `inactiva${DOMINIO}`, password: 'Clave-Inactiva-2026' };

  async function limpiar(): Promise<void> {
    await prisma.usuario.deleteMany({ where: { email: { endsWith: DOMINIO } } });
  }

  beforeAll(async () => {
    await limpiar();
    await prisma.usuario.createMany({
      data: [
        {
          nombre: 'Administradora de prueba',
          email: admin.email,
          passwordHash: await generarHashPassword(admin.password),
          rol: 'ADMIN',
        },
        {
          nombre: 'Cuenta desactivada',
          email: inactiva.email,
          passwordHash: await generarHashPassword(inactiva.password),
          activo: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/registro', () => {
    let sesion: Sesion;

    it('registra un cliente: 201 con token Bearer, expiración de 8 h y datos normalizados', async () => {
      const antes = ahora;
      const res = await request(app).post('/api/v1/auth/registro').send(cliente);

      expect(res.status).toBe(201);
      sesion = res.body as Sesion;
      expect(Object.keys(sesion).sort()).toEqual(['expiraEn', 'tipo', 'token', 'usuario']);
      expect(sesion.tipo).toBe('Bearer');
      expect(sesion.token.split('.')).toHaveLength(3);
      expect(new Date(sesion.expiraEn).getTime()).toBe(
        Math.floor(antes / 1000) * 1000 + 8 * 3600_000,
      );
      expect(sesion.usuario).toEqual({
        id: expect.stringMatching(UUID) as unknown,
        nombre: 'Ana Cliente',
        email: emailCliente,
        telefono: '+593991234567',
        rol: 'CLIENTE',
      });
      expect(typeof sesion.usuario.id).toBe('string');
      sinSecretos(res, cliente.password);
    });

    it('guarda la contraseña como hash bcrypt de coste 12, nunca en texto (RNF-01)', async () => {
      const guardado = await prisma.usuario.findUniqueOrThrow({ where: { email: emailCliente } });
      expect(guardado.passwordHash).toMatch(/^\$2b\$12\$/);
      expect(guardado.passwordHash).not.toContain(cliente.password);
      expect(guardado.rol).toBe('CLIENTE');
    });

    it('el token del registro sirve para consultar el perfil', async () => {
      const res = await request(app)
        .get('/api/v1/auth/perfil')
        .set('Authorization', `Bearer ${sesion.token}`);
      expect(res.status).toBe(200);
      expect((res.body as { usuario: UsuarioRespuesta }).usuario.email).toBe(emailCliente);
    });

    it('teléfono opcional: sin él (o vacío) se guarda como null', async () => {
      const res = await request(app)
        .post('/api/v1/auth/registro')
        .send({
          nombre: 'Sin Teléfono',
          email: `sin.telefono${DOMINIO}`,
          password: 'Clave-2026-ok',
          telefono: '',
        });
      expect(res.status).toBe(201);
      expect((res.body as Sesion).usuario.telefono).toBeNull();
    });

    it('correo duplicado (aunque cambien mayúsculas y espacios): 409 CONFLICTO', async () => {
      const res = await request(app)
        .post('/api/v1/auth/registro')
        .send({ ...cliente, email: ` ANA.CLIENTE${DOMINIO} ` });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: { codigo: 'CONFLICTO', mensaje: 'Ya existe una cuenta con ese correo.' },
      });
    });

    it.each([
      [
        'correo inválido',
        { email: 'no-es-un-correo' },
        'email',
        'El correo electrónico no es válido',
      ],
      [
        'contraseña de menos de 8',
        { password: 'corta' },
        'password',
        'La contraseña debe tener al menos 8 caracteres',
      ],
      [
        'contraseña de más de 72',
        { password: 'x'.repeat(73) },
        'password',
        'La contraseña no puede superar 72 caracteres',
      ],
      ['nombre vacío', { nombre: '   ' }, 'nombre', 'El nombre debe tener al menos 2 caracteres'],
      [
        'teléfono con letras',
        { telefono: '099-ABC-1234' },
        'telefono',
        'El teléfono debe tener de 7 a 15 dígitos',
      ],
      [
        'intento de registrarse como ADMIN',
        { rol: 'ADMIN' },
        'rol',
        'No se puede elegir el rol: las cuentas nuevas siempre son de cliente',
      ],
    ])('%s: 400 VALIDACION con el detalle del campo', async (_caso, cambio, campo, mensaje) => {
      const email = `validacion${DOMINIO}`;
      const res = await request(app)
        .post('/api/v1/auth/registro')
        .send({ ...cliente, email, ...cambio });

      expect(res.status).toBe(400);
      const cuerpo = res.body as CuerpoError;
      expect(cuerpo.error.codigo).toBe('VALIDACION');
      expect(cuerpo.error.detalles).toContainEqual(
        expect.objectContaining({ campo, mensaje: expect.stringContaining(mensaje) as unknown }),
      );
      // No se creó ninguna cuenta (y nunca una ADMIN).
      await expect(prisma.usuario.count({ where: { email: email.toLowerCase() } })).resolves.toBe(
        0,
      );
    });

    it('sin cuerpo: 400 con los campos obligatorios', async () => {
      const res = await request(app).post('/api/v1/auth/registro').send({});
      expect(res.status).toBe(400);
      const campos = (res.body as CuerpoError).error.detalles?.map((d) => d.campo);
      expect(campos).toEqual(expect.arrayContaining(['nombre', 'email', 'password']));
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('inicio de sesión de un cliente: 200 con la misma forma que el registro', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: ` ANA.CLIENTE${DOMINIO}`, password: cliente.password });

      expect(res.status).toBe(200);
      const sesion = res.body as Sesion;
      expect(Object.keys(sesion).sort()).toEqual(['expiraEn', 'tipo', 'token', 'usuario']);
      expect(sesion.tipo).toBe('Bearer');
      expect(sesion.usuario.rol).toBe('CLIENTE');
      expect(sesion.usuario.email).toBe(emailCliente);
      sinSecretos(res, cliente.password);
    });

    it('inicio de sesión de la administradora: 200 con rol ADMIN', async () => {
      const res = await request(app).post('/api/v1/auth/login').send(admin);
      expect(res.status).toBe(200);
      expect((res.body as Sesion).usuario).toMatchObject({ email: admin.email, rol: 'ADMIN' });
      sinSecretos(res, admin.password);
    });

    it('contraseña incorrecta y correo inexistente devuelven EXACTAMENTE la misma respuesta 401', async () => {
      const malaClave = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: emailCliente, password: 'otra-clave-2026' });
      const sinCuenta = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `nadie${DOMINIO}`, password: 'otra-clave-2026' });

      const esperado = {
        error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos.' },
      };
      expect(malaClave.status).toBe(401);
      expect(sinCuenta.status).toBe(401);
      expect(malaClave.body).toEqual(esperado);
      expect(sinCuenta.body).toEqual(esperado);
      expect(malaClave.text).toBe(sinCuenta.text);
    });

    it('cuenta desactivada con la contraseña correcta: 403 CUENTA_DESACTIVADA', async () => {
      const res = await request(app).post('/api/v1/auth/login').send(inactiva);
      expect(res.status).toBe(403);
      expect((res.body as CuerpoError).error.codigo).toBe('CUENTA_DESACTIVADA');
    });

    it('cuenta desactivada con una contraseña incorrecta: el 401 genérico (no revela que existe)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: inactiva.email, password: 'no-es-la-clave' });
      expect(res.status).toBe(401);
      expect((res.body as CuerpoError).error.codigo).toBe('CREDENCIALES_INVALIDAS');
    });

    it('sin contraseña: 400 VALIDACION', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: emailCliente });
      expect(res.status).toBe(400);
      expect((res.body as CuerpoError).error.codigo).toBe('VALIDACION');
    });

    it('no envía cabeceras de límite agotado mientras no se supera (límite alto en test)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send(admin);
      expect(res.headers['retry-after']).toBeUndefined();
      expect(res.headers.ratelimit).toMatch(/inicio-sesion/);
    });
  });

  describe('GET /api/v1/auth/perfil', () => {
    async function iniciarSesion(email: string, password: string): Promise<Sesion> {
      const res = await request(app).post('/api/v1/auth/login').send({ email, password });
      expect(res.status).toBe(200);
      return res.body as Sesion;
    }

    it('con token: 200 con los datos de la base de datos (sin hash)', async () => {
      const { token, usuario } = await iniciarSesion(emailCliente, cliente.password);
      const res = await request(app)
        .get('/api/v1/auth/perfil')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ usuario });
      expect(typeof (res.body as { usuario: UsuarioRespuesta }).usuario.id).toBe('string');
      sinSecretos(res);
    });

    it('sin token: 401 NO_AUTENTICADO', async () => {
      const res = await request(app).get('/api/v1/auth/perfil');
      expect(res.status).toBe(401);
      expect((res.body as CuerpoError).error.codigo).toBe('NO_AUTENTICADO');
    });

    it('con un token alterado (rol cambiado a ADMIN sin firmar): 401 TOKEN_INVALIDO', async () => {
      const { token } = await iniciarSesion(emailCliente, cliente.password);
      const [cabecera, payload = '', firma] = token.split('.');
      const datos = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
        string,
        unknown
      >;
      const alterado = Buffer.from(JSON.stringify({ ...datos, rol: 'ADMIN' })).toString(
        'base64url',
      );

      const res = await request(app)
        .get('/api/v1/auth/perfil')
        .set('Authorization', `Bearer ${cabecera ?? ''}.${alterado}.${firma ?? ''}`);
      expect(res.status).toBe(401);
      expect((res.body as CuerpoError).error.codigo).toBe('TOKEN_INVALIDO');
    });

    it('con un token expirado (8 h después): 401 TOKEN_EXPIRADO', async () => {
      const { token } = await iniciarSesion(emailCliente, cliente.password);
      ahora += 8 * 3600_000 + 1000;
      try {
        const res = await request(app)
          .get('/api/v1/auth/perfil')
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(401);
        expect((res.body as CuerpoError).error.codigo).toBe('TOKEN_EXPIRADO');
      } finally {
        ahora = Date.now();
      }
    });

    it('si la cuenta se desactiva después de emitir el token: 401 (el perfil se lee de la BD)', async () => {
      const email = `se.desactiva${DOMINIO}`;
      const registro = await request(app)
        .post('/api/v1/auth/registro')
        .send({ nombre: 'Se Desactiva', email, password: 'Clave-2026-ok' });
      const { token } = registro.body as Sesion;
      await prisma.usuario.update({ where: { email }, data: { activo: false } });

      const res = await request(app)
        .get('/api/v1/auth/perfil')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect((res.body as CuerpoError).error.mensaje).toBe(
        'Tu sesión ya no es válida. Inicia sesión de nuevo.',
      );
    });

    it('si la cuenta ya no existe: 401', async () => {
      const email = `se.borra${DOMINIO}`;
      const registro = await request(app)
        .post('/api/v1/auth/registro')
        .send({ nombre: 'Se Borra', email, password: 'Clave-2026-ok' });
      const { token } = registro.body as Sesion;
      await prisma.usuario.delete({ where: { email } });

      const res = await request(app)
        .get('/api/v1/auth/perfil')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });
  });

  describe('límite de intentos de inicio de sesión (RNF-01)', () => {
    it('con un límite bajo (2 cada 15 min), el tercer intento fallido recibe 429 DEMASIADOS_INTENTOS', async () => {
      const appLimitada = crearApp(envDeIntegracion(), {
        prisma,
        limitadorLogin: crearLimitadorLogin({ maxIntentos: 2, ventanaMinutos: 15 }),
      });
      const fallo = { email: emailCliente, password: 'clave-incorrecta' };

      const primero = await request(appLimitada).post('/api/v1/auth/login').send(fallo);
      const segundo = await request(appLimitada).post('/api/v1/auth/login').send(fallo);
      const tercero = await request(appLimitada).post('/api/v1/auth/login').send(fallo);
      // Mientras dura el bloqueo, también se rechaza un intento con la contraseña correcta.
      const correcto = await request(appLimitada)
        .post('/api/v1/auth/login')
        .send({ email: emailCliente, password: cliente.password });

      expect([primero.status, segundo.status]).toEqual([401, 401]);
      expect(tercero.status).toBe(429);
      expect(tercero.body).toEqual({
        error: {
          codigo: 'DEMASIADOS_INTENTOS',
          mensaje: 'Demasiados intentos de inicio de sesión. Inténtalo de nuevo en 15 minutos.',
        },
      });
      expect(Number(tercero.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(tercero.headers['retry-after'])).toBeLessThanOrEqual(900);
      expect(tercero.headers['ratelimit-policy']).toMatch(/"inicio-sesion"; ?q=2; ?w=900/);
      expect(correcto.status).toBe(429);
    });

    it('los inicios de sesión correctos no consumen intentos', async () => {
      const appLimitada = crearApp(envDeIntegracion(), {
        prisma,
        limitadorLogin: crearLimitadorLogin({ maxIntentos: 1, ventanaMinutos: 15 }),
      });
      for (let i = 0; i < 3; i++) {
        const res = await request(appLimitada).post('/api/v1/auth/login').send(admin);
        expect(res.status).toBe(200);
      }
    });

    it('el registro no está sujeto al límite de inicio de sesión', async () => {
      const appLimitada = crearApp(envDeIntegracion(), {
        prisma,
        limitadorLogin: crearLimitadorLogin({ maxIntentos: 1, ventanaMinutos: 15 }),
      });
      for (let i = 0; i < 3; i++) {
        const res = await request(appLimitada)
          .post('/api/v1/auth/registro')
          .send({ ...cliente, email: emailCliente });
        expect(res.status).toBe(409);
      }
    });
  });
});

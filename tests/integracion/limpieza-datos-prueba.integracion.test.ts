/**
 * Limpieza de los datos de prueba de newman contra PostgreSQL (RNF-07, RNF-08).
 * Crea en la BD de pruebas una mezcla de cuentas (clientes de newman, antiguos, otros clientes,
 * administradoras e incluso una ADMIN con el dominio de newman) y comprueba que solo se borran
 * los clientes de prueba con sus datos relacionados. Los datos auxiliares de este archivo usan el
 * dominio `limpieza.creafacil.test` y se borran al empezar y al terminar.
 */
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';

import {
  DOMINIO_NEWMAN,
  ejecutarCli,
  ErrorLimpieza,
  limpiarDatosPrueba,
} from '../../scripts/limpieza-datos-prueba.js';
import { crearClientePrisma } from '../../src/shared/database/prisma.js';
import { crearPrismaDePrueba } from './base-datos.js';

const HASH = 'x'.repeat(60);
const NOMBRE_CATEGORIA = 'Categoría de la prueba de limpieza';

/** Cuentas que la limpieza NUNCA debe borrar. */
const INTACTAS = [
  { email: 'admin@limpieza.creafacil.test', rol: 'ADMIN' },
  // Una ADMIN con el dominio de newman: el rol manda, nunca se borra.
  { email: 'admin@newman.creafacil.test', rol: 'ADMIN' },
  { email: 'maria@limpieza.creafacil.test', rol: 'CLIENTE' },
  { email: 'cliente+1@limpieza.creafacil.test', rol: 'CLIENTE' },
  { email: 'otro+1@creafacil.test', rol: 'CLIENTE' },
  { email: 'x@sub.newman.creafacil.test', rol: 'CLIENTE' },
] as const;
const NEWMAN = ['cliente+1@newman.creafacil.test', 'cliente+2@newman.creafacil.test'];
const ANTIGUO = 'cliente+1700000000000@creafacil.test';
const TODOS = [...INTACTAS.map((u) => u.email), ...NEWMAN, ANTIGUO];

describe('limpieza de los datos de prueba de newman (integración)', () => {
  const prisma = crearPrismaDePrueba();
  const ids = new Map<string, string>();

  function id(email: string): string {
    const valor = ids.get(email);
    if (valor === undefined) {
      throw new Error(`Usuario no creado: ${email}`);
    }
    return valor;
  }

  async function borrarDatosDelArchivo(): Promise<void> {
    const where = { cliente: { email: { in: TODOS } } };
    await prisma.historialEstadoPedido.deleteMany({
      where: { OR: [{ pedido: where }, { usuario: { email: { in: TODOS } } }] },
    });
    await prisma.pedido.deleteMany({ where });
    await prisma.solicitud.deleteMany({ where });
    await prisma.cotizacion.deleteMany({ where });
    await prisma.usuario.deleteMany({ where: { email: { in: TODOS } } });
    await prisma.servicio.deleteMany({ where: { categoria: { nombre: NOMBRE_CATEGORIA } } });
    await prisma.categoria.deleteMany({ where: { nombre: NOMBRE_CATEGORIA } });
    await prisma.configuracionPrecios.deleteMany({ where: { costoManoObraHora: '987.65' } });
  }

  /** Cotización → solicitud → pedido → historial, notificación y dispositivo de un cliente. */
  async function crearDatosRelacionados(clienteId: string, sufijo: string): Promise<string> {
    const servicio = await prisma.servicio.findFirstOrThrow({
      where: { categoria: { nombre: NOMBRE_CATEGORIA } },
    });
    const configuracion = await prisma.configuracionPrecios.findFirstOrThrow({
      where: { costoManoObraHora: '987.65' },
    });
    const cotizacion = await prisma.cotizacion.create({
      data: {
        clienteId,
        servicioId: servicio.id,
        configuracionPreciosId: configuracion.id,
        detallesDiseno: 'Diseño de prueba',
        complejidad: 'BAJA',
        horasManoObra: '1',
        costoManoObraHora: '987.65',
        factorComplejidad: '1.00',
        subtotalMateriales: '0',
        costoManoObra: '987.65',
        valorEstimado: '987.65',
      },
    });
    const solicitud = await prisma.solicitud.create({
      data: {
        clienteId,
        servicioId: servicio.id,
        cotizacionId: cotizacion.id,
        descripcion: 'Solicitud de prueba',
        fechaDeseada: new Date('2026-12-15'),
        imagenes: { create: { url: 'https://ejemplo.test/ref.png' } },
      },
    });
    const pedido = await prisma.pedido.create({
      data: {
        clienteId,
        solicitudId: solicitud.id,
        cotizacionId: cotizacion.id,
        precioAcordado: '987.65',
        fechaInicioPrevista: new Date('2026-12-01'),
        fechaEntregaPrevista: new Date('2026-12-05'),
        duracionEstimadaDias: 5,
        historial: { create: { estadoNuevo: 'PENDIENTE', usuarioId: clienteId } },
      },
    });
    await prisma.notificacion.create({
      data: {
        usuarioId: clienteId,
        tipo: 'PEDIDO_ACEPTADO',
        titulo: 'Pedido aceptado',
        mensaje: 'Tu pedido fue aceptado',
        referenciaId: pedido.id,
      },
    });
    await prisma.dispositivoFcm.create({
      data: { usuarioId: clienteId, token: `token-fcm-${sufijo}`, plataforma: 'ANDROID' },
    });
    return pedido.id;
  }

  async function existentes(): Promise<string[]> {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { in: TODOS } },
      select: { email: true },
    });
    // Orden en JS (no depende de la collation de PostgreSQL).
    return usuarios.map((u) => u.email).sort();
  }

  // Cada prueba empieza desde cero: datos auxiliares, cuentas y datos relacionados.
  beforeEach(async () => {
    await borrarDatosDelArchivo();
    const categoria = await prisma.categoria.create({ data: { nombre: NOMBRE_CATEGORIA } });
    await prisma.servicio.create({
      data: { categoriaId: categoria.id, nombre: 'Servicio de limpieza', descripcion: 'Prueba' },
    });
    await prisma.configuracionPrecios.create({
      data: {
        costoManoObraHora: '987.65',
        factorComplejidadBaja: '1.00',
        factorComplejidadMedia: '1.25',
        factorComplejidadAlta: '1.50',
        vigenteDesde: new Date('2020-01-01'),
        // Cerrada: no interfiere con la configuración vigente de otras pruebas.
        vigenteHasta: new Date('2020-01-02'),
      },
    });
    ids.clear();
    for (const { email, rol } of INTACTAS) {
      const usuario = await prisma.usuario.create({
        data: { nombre: 'Intacta', email, passwordHash: HASH, rol },
      });
      ids.set(email, usuario.id);
    }
    for (const email of [...NEWMAN, ANTIGUO]) {
      const usuario = await prisma.usuario.create({
        data: { nombre: 'Prueba', email, passwordHash: HASH },
      });
      ids.set(email, usuario.id);
    }
    // Datos relacionados: de un cliente de newman y de un cliente que NO se debe tocar.
    await crearDatosRelacionados(id(NEWMAN[0] ?? ''), 'newman');
    await crearDatosRelacionados(id('maria@limpieza.creafacil.test'), 'maria');
  });

  afterAll(async () => {
    await borrarDatosDelArchivo();
    await prisma.$disconnect();
  });

  it('borra solo los clientes de newman y sus datos relacionados', async () => {
    const resultado = await limpiarDatosPrueba(
      prisma,
      { simular: false, incluirAntiguos: false },
      'development',
    );

    expect(resultado.simulado).toBe(false);
    expect(resultado.usuarios.map((u) => [u.email, u.origen])).toEqual([
      [NEWMAN[0], 'newman'],
      [NEWMAN[1], 'newman'],
    ]);
    expect(resultado.borrados).toEqual({
      usuarios: 2,
      cotizaciones: 1,
      solicitudes: 1,
      pedidos: 1,
      historialPedidos: 1,
    });
    // El antiguo sigue (no se pidió --incluir-antiguos) y las cuentas intactas también.
    expect(await existentes()).toEqual([...INTACTAS.map((u) => u.email), ANTIGUO].sort());
    await expect(
      prisma.usuario.count({ where: { email: { endsWith: DOMINIO_NEWMAN }, rol: 'CLIENTE' } }),
    ).resolves.toBe(0);
    // Notificaciones y dispositivos del cliente de newman caen en cascada.
    await expect(
      prisma.notificacion.count({ where: { usuarioId: id(NEWMAN[0] ?? '') } }),
    ).resolves.toBe(0);
    await expect(
      prisma.dispositivoFcm.count({ where: { token: 'token-fcm-newman' } }),
    ).resolves.toBe(0);
    // Los datos de María siguen completos.
    const mariaId = id('maria@limpieza.creafacil.test');
    await expect(prisma.cotizacion.count({ where: { clienteId: mariaId } })).resolves.toBe(1);
    await expect(prisma.solicitud.count({ where: { clienteId: mariaId } })).resolves.toBe(1);
    await expect(prisma.pedido.count({ where: { clienteId: mariaId } })).resolves.toBe(1);
    await expect(
      prisma.historialEstadoPedido.count({ where: { usuarioId: mariaId } }),
    ).resolves.toBe(1);
    await expect(prisma.notificacion.count({ where: { usuarioId: mariaId } })).resolves.toBe(1);
    await expect(prisma.dispositivoFcm.count({ where: { usuarioId: mariaId } })).resolves.toBe(1);
  });

  it('nunca borra a una ADMIN, aunque su correo sea del dominio de newman', async () => {
    await limpiarDatosPrueba(prisma, { simular: false, incluirAntiguos: true }, 'test');

    const admins = await prisma.usuario.findMany({
      where: { email: { in: TODOS }, rol: 'ADMIN' },
      select: { email: true },
    });
    expect(admins.map((a) => a.email).sort()).toEqual([
      'admin@limpieza.creafacil.test',
      'admin@newman.creafacil.test',
    ]);
  });

  it('con --incluir-antiguos borra también los cliente+<marca>@creafacil.test, y es idempotente', async () => {
    const primera = await limpiarDatosPrueba(
      prisma,
      { simular: false, incluirAntiguos: true },
      undefined,
    );
    expect(primera.usuarios.map((u) => u.origen)).toEqual(['antiguo', 'newman', 'newman']);
    expect(primera.borrados.usuarios).toBe(3);
    expect(await existentes()).toEqual(INTACTAS.map((u) => u.email).sort());

    const segunda = await limpiarDatosPrueba(
      prisma,
      { simular: false, incluirAntiguos: true },
      undefined,
    );
    expect(segunda.usuarios).toEqual([]);
    expect(segunda.borrados.usuarios).toBe(0);
  });

  it('--simular no borra nada', async () => {
    const antes = await existentes();
    const pedidosAntes = await prisma.pedido.count();

    const resultado = await limpiarDatosPrueba(
      prisma,
      { simular: true, incluirAntiguos: true },
      'development',
    );

    expect(resultado.simulado).toBe(true);
    expect(resultado.usuarios.map((u) => u.email)).toEqual([ANTIGUO, ...NEWMAN]);
    expect(resultado.borrados.usuarios).toBe(0);
    expect(await existentes()).toEqual(antes);
    await expect(prisma.pedido.count()).resolves.toBe(pedidosAntes);
  });

  it('se niega a ejecutarse con NODE_ENV=production y no borra nada', async () => {
    const antes = await existentes();
    await expect(
      limpiarDatosPrueba(prisma, { simular: false, incluirAntiguos: true }, 'production'),
    ).rejects.toThrow(ErrorLimpieza);
    expect(await existentes()).toEqual(antes);
  });

  it('si un dato ajeno referencia a un cliente de prueba, no borra nada (transacción)', async () => {
    // Un cambio de estado de un pedido de María hecho «por» un cliente de newman.
    const pedidoMaria = await prisma.pedido.findFirstOrThrow({
      where: { clienteId: id('maria@limpieza.creafacil.test') },
    });
    await prisma.historialEstadoPedido.create({
      data: { pedidoId: pedidoMaria.id, estadoNuevo: 'EN_PROCESO', usuarioId: id(NEWMAN[1] ?? '') },
    });
    const antes = await existentes();

    await expect(
      limpiarDatosPrueba(prisma, { simular: false, incluirAntiguos: false }, 'development'),
    ).rejects.toThrow();

    expect(await existentes()).toEqual(antes);
    await expect(
      prisma.cotizacion.count({ where: { clienteId: id(NEWMAN[0] ?? '') } }),
    ).resolves.toBe(1);
    await expect(
      prisma.historialEstadoPedido.count({ where: { pedidoId: pedidoMaria.id } }),
    ).resolves.toBe(2);
  });

  it('el comando completo (ejecutarCli) borra y muestra el recuento', async () => {
    const salida: string[] = [];
    const errores: string[] = [];
    const url = inject('databaseUrlTest');

    const codigo = await ejecutarCli(
      ['--incluir-antiguos'],
      { NODE_ENV: 'development', DATABASE_URL: url },
      {
        crearPrisma: crearClientePrisma,
        escribir: (linea) => salida.push(linea),
        escribirError: (linea) => errores.push(linea),
      },
    );

    expect(errores).toEqual([]);
    expect(codigo).toBe(0);
    expect(salida[0]).toMatch(/^Limpieza de datos de prueba · base de datos: creafacil_test en /);
    expect(salida).toContain('Clientes de prueba encontrados: 3 (newman: 2, antiguos: 1)');
    expect(salida.at(-1)).toBe(
      'Borrados: 3 usuarios, 1 cotizaciones, 1 solicitudes, 1 pedidos y 1 cambios de estado.',
    );
    expect(await existentes()).toEqual(INTACTAS.map((u) => u.email).sort());
  });
});

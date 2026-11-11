import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sembrarDatosBase } from '../../prisma/seed-datos.js';
import { crearPrismaDePrueba, vaciarBaseDatos } from './base-datos.js';

/**
 * Comprueba que la migración inicial se comporta como se diseñó: relaciones, valores copiados
 * y restricciones CHECK añadidas a mano (RNF-08, RN-02).
 */
describe('modelo de datos (integración)', () => {
  const prisma = crearPrismaDePrueba();
  let clienteId = '';
  let cotizacionId = '';

  beforeAll(async () => {
    await vaciarBaseDatos(prisma);
    await sembrarDatosBase(prisma, {
      email: 'admin@prueba.local',
      password: 'Clave-Segura-2026',
      nombre: 'Admin',
    });

    const cliente = await prisma.usuario.create({
      data: { nombre: 'Cliente', email: 'cliente@prueba.local', passwordHash: 'x'.repeat(60) },
    });
    clienteId = cliente.id;
    const categoria = await prisma.categoria.findUniqueOrThrow({ where: { nombre: 'Murales' } });
    const servicio = await prisma.servicio.create({
      data: {
        categoriaId: categoria.id,
        nombre: 'Mural infantil',
        descripcion: 'Mural pintado a mano',
      },
    });
    const configuracion = await prisma.configuracionPrecios.findFirstOrThrow({
      where: { vigenteHasta: null },
    });
    const pintura = await prisma.material.findUniqueOrThrow({
      where: { nombre: 'Pintura acrílica' },
    });

    const cotizacion = await prisma.cotizacion.create({
      data: {
        clienteId,
        servicioId: servicio.id,
        configuracionPreciosId: configuracion.id,
        detallesDiseno: 'Animales de la selva',
        complejidad: 'MEDIA',
        horasManoObra: '10',
        costoManoObraHora: configuracion.costoManoObraHora,
        factorComplejidad: configuracion.factorComplejidadMedia,
        subtotalMateriales: '7.00',
        costoManoObra: '50.00',
        valorEstimado: '71.25',
        materiales: {
          create: {
            materialId: pintura.id,
            cantidad: '2',
            precioUnitario: pintura.precioUnitario,
            subtotal: '7.00',
          },
        },
      },
    });
    cotizacionId = cotizacion.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('una cotización nueva es estimada y está pendiente (RN-01)', async () => {
    const cotizacion = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId } });
    expect(cotizacion.esEstimada).toBe(true);
    expect(cotizacion.estado).toBe('PENDIENTE');
    expect(cotizacion.valorEstimado.toFixed(2)).toBe('71.25');
  });

  it('el pedido conserva su precio acordado aunque cambie el precio del material (RN-02)', async () => {
    const pedido = await prisma.pedido.create({
      data: {
        clienteId,
        cotizacionId,
        precioAcordado: '75.00',
        fechaInicioPrevista: new Date('2026-12-01'),
        fechaEntregaPrevista: new Date('2026-12-05'),
        duracionEstimadaDias: 5,
        historial: { create: { estadoNuevo: 'PENDIENTE', usuarioId: clienteId } },
      },
    });

    await prisma.material.update({
      where: { nombre: 'Pintura acrílica' },
      data: { precioUnitario: '9.99' },
    });

    const guardado = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedido.id },
      include: { historial: true },
    });
    expect(guardado.precioAcordado.toFixed(2)).toBe('75.00');
    expect(guardado.historial).toHaveLength(1);
    const detalle = await prisma.detalleCotizacionMaterial.findFirstOrThrow({
      where: { cotizacionId },
    });
    expect(detalle.precioUnitario.toFixed(2)).toBe('3.50');
  });

  it('la base de datos rechaza un pedido sin solicitud ni cotización de origen', async () => {
    await expect(
      prisma.pedido.create({
        data: {
          clienteId,
          precioAcordado: '10.00',
          fechaInicioPrevista: new Date('2026-12-01'),
          fechaEntregaPrevista: new Date('2026-12-02'),
          duracionEstimadaDias: 1,
        },
      }),
    ).rejects.toThrow(/pedidos_con_origen/);
  });

  it('la base de datos rechaza una entrega anterior al inicio', async () => {
    const solicitud = await prisma.solicitud.create({
      data: { clienteId, descripcion: 'Letrero', fechaDeseada: new Date('2026-12-10') },
    });
    await expect(
      prisma.pedido.create({
        data: {
          clienteId,
          solicitudId: solicitud.id,
          precioAcordado: '10.00',
          fechaInicioPrevista: new Date('2026-12-10'),
          fechaEntregaPrevista: new Date('2026-12-01'),
          duracionEstimadaDias: 1,
        },
      }),
    ).rejects.toThrow(/pedidos_fechas_coherentes/);
  });

  it('el correo de usuario es único', async () => {
    await expect(
      prisma.usuario.create({
        data: { nombre: 'Otra', email: 'cliente@prueba.local', passwordHash: 'x'.repeat(60) },
      }),
    ).rejects.toThrow(/Unique constraint/i);
  });
});

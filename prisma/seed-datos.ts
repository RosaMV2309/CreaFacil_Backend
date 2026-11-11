import type { PrismaClient } from '../src/generated/prisma/client.js';
import { generarHashPassword } from '../src/shared/security/password.js';

/**
 * Datos base de CreaFácil y la función que los carga. Es idempotente: se puede ejecutar
 * tantas veces como se quiera sin duplicar nada (upsert por claves únicas).
 *
 * - Administradora (RF-01, RF-02, RNF-01): se crea con la contraseña en hash bcrypt. Si ya existe,
 *   se actualizan su nombre, rol y estado, pero NO su contraseña (no se pisa un cambio posterior).
 * - Categorías base del DERCAS (RF-03) y materiales de ejemplo (RF-08): si ya existen no se tocan,
 *   para respetar lo que la administradora haya editado desde el panel.
 * - Configuración de precios (RF-08): solo se crea si no hay ninguna vigente.
 */

export interface DatosAdministradora {
  email: string;
  password: string;
  nombre: string;
}

export const CATEGORIAS_BASE = [
  {
    nombre: 'Manualidades con fomix',
    descripcion: 'Figuras, letreros y detalles elaborados con fomix (goma eva).',
    orden: 1,
  },
  {
    nombre: 'Decoraciones',
    descripcion: 'Decoración para fiestas, eventos y espacios.',
    orden: 2,
  },
  {
    nombre: 'Murales',
    descripcion: 'Murales pintados a mano en paredes interiores y exteriores.',
    orden: 3,
  },
] as const;

/** Materiales de ejemplo con precios en dólares; la administradora los ajusta desde el panel. */
export const MATERIALES_BASE = [
  { nombre: 'Fomix', unidad: 'lámina 50 x 70 cm', precioUnitario: '0.75' },
  { nombre: 'Pintura acrílica', unidad: 'frasco 250 ml', precioUnitario: '3.50' },
  { nombre: 'Silicona en barra', unidad: 'barra', precioUnitario: '0.25' },
  { nombre: 'Cartulina', unidad: 'pliego', precioUnitario: '0.50' },
] as const;

/** Tarifa inicial de referencia (RF-08). Los factores multiplican el costo según la complejidad. */
export const CONFIGURACION_PRECIOS_BASE = {
  costoManoObraHora: '5.00',
  factorComplejidadBaja: '1.00',
  factorComplejidadMedia: '1.25',
  factorComplejidadAlta: '1.50',
} as const;

export interface ResumenSeed {
  administradora: { id: string; email: string };
  categorias: number;
  materiales: number;
  configuracionPreciosId: string;
  configuracionCreada: boolean;
}

export async function sembrarDatosBase(
  prisma: PrismaClient,
  admin: DatosAdministradora,
): Promise<ResumenSeed> {
  const email = admin.email.trim().toLowerCase();
  const administradora = await prisma.usuario.upsert({
    where: { email },
    create: {
      email,
      nombre: admin.nombre,
      passwordHash: await generarHashPassword(admin.password),
      rol: 'ADMIN',
      activo: true,
    },
    update: { nombre: admin.nombre, rol: 'ADMIN', activo: true },
    select: { id: true, email: true },
  });

  for (const categoria of CATEGORIAS_BASE) {
    await prisma.categoria.upsert({
      where: { nombre: categoria.nombre },
      create: categoria,
      update: {},
    });
  }

  for (const material of MATERIALES_BASE) {
    await prisma.material.upsert({
      where: { nombre: material.nombre },
      create: material,
      update: {},
    });
  }

  const vigente = await prisma.configuracionPrecios.findFirst({
    where: { vigenteHasta: null },
    orderBy: { vigenteDesde: 'desc' },
    select: { id: true },
  });
  const configuracion =
    vigente ??
    (await prisma.configuracionPrecios.create({
      data: CONFIGURACION_PRECIOS_BASE,
      select: { id: true },
    }));

  return {
    administradora,
    categorias: CATEGORIAS_BASE.length,
    materiales: MATERIALES_BASE.length,
    configuracionPreciosId: configuracion.id,
    configuracionCreada: vigente === null,
  };
}

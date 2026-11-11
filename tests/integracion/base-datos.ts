import { inject } from 'vitest';

import { cargarEnv, type Env } from '../../src/config/env.js';
import { crearClientePrisma, type PrismaClient } from '../../src/shared/database/prisma.js';

/** Cliente Prisma conectado a la base de datos de pruebas (preparada en global-setup.ts). */
export function crearPrismaDePrueba(): PrismaClient {
  return crearClientePrisma(inject('databaseUrlTest'));
}

/** Configuración de la app apuntando a la base de datos de pruebas. */
export function envDeIntegracion(): Env {
  return cargarEnv({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrlTest'),
    JWT_SECRET: 'x'.repeat(32),
  });
}

/** Vacía las tablas con datos base (y, en cascada, las que dependen de ellas). */
export async function vaciarBaseDatos(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE usuarios, categorias, materiales, configuraciones_precios RESTART IDENTITY CASCADE',
  );
}

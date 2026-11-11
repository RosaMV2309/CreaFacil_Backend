import type { PrismaClient } from '../../shared/database/prisma.js';

/**
 * Capa de acceso a datos del módulo health (RNF-07): la única que conoce Prisma.
 */
export interface HealthRepository {
  /** Lanza un error si PostgreSQL no responde. */
  comprobarBaseDatos(): Promise<void>;
}

export function crearHealthRepository(prisma: Pick<PrismaClient, '$queryRaw'>): HealthRepository {
  return {
    comprobarBaseDatos: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
  };
}

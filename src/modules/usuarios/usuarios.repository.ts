import type { PrismaClient } from '../../shared/database/prisma.js';
import { escaparLike } from '../../shared/utils/consultas.js';

export { escaparLike };

/**
 * Acceso a datos del módulo de usuarios (RNF-07): la única capa que conoce Prisma.
 * Nunca selecciona `passwordHash` (RNF-01).
 */

/** Cliente tal como lo ve la administradora. */
export interface ClienteAdmin {
  readonly id: string;
  readonly nombre: string;
  readonly email: string;
  readonly telefono: string | null;
  readonly activo: boolean;
  readonly creadoEn: Date;
}

export interface ConsultaClientes {
  readonly saltar: number;
  readonly tomar: number;
  readonly q?: string | undefined;
}

export interface PaginaClientes {
  readonly clientes: ClienteAdmin[];
  readonly total: number;
}

export interface UsuariosRepository {
  /** Clientes (rol CLIENTE) del más reciente al más antiguo, con búsqueda opcional. */
  listarClientes(consulta: ConsultaClientes): Promise<PaginaClientes>;
}

export function crearUsuariosRepository(
  prisma: Pick<PrismaClient, 'usuario' | '$transaction'>,
): UsuariosRepository {
  return {
    listarClientes: async ({ saltar, tomar, q }) => {
      const busqueda = q ? escaparLike(q) : undefined;
      const where = {
        rol: 'CLIENTE' as const,
        ...(busqueda
          ? {
              OR: [
                { nombre: { contains: busqueda, mode: 'insensitive' as const } },
                { email: { contains: busqueda, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      // Lista y total en la misma transacción para que la paginación sea coherente.
      const [filas, total] = await prisma.$transaction([
        prisma.usuario.findMany({
          where,
          // El id desempata: el orden es estable entre páginas aunque coincida la fecha.
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: saltar,
          take: tomar,
          select: {
            id: true,
            nombre: true,
            email: true,
            telefono: true,
            activo: true,
            createdAt: true,
          },
        }),
        prisma.usuario.count({ where }),
      ]);
      return {
        clientes: filas.map(({ createdAt, ...cliente }) => ({ ...cliente, creadoEn: createdAt })),
        total,
      };
    },
  };
}

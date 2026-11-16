import type { UsuariosRepository } from './usuarios.repository.js';
import type { FiltroClientes } from './usuarios.schemas.js';

/**
 * Reglas de negocio de la gestión de usuarios por la administradora (RF-02, RNF-03).
 * No conoce Express ni Prisma. Los permisos (rol ADMIN) se comprueban antes, en el grupo `/admin`.
 */

/** Cliente en la respuesta JSON (`creadoEn` en ISO 8601, UTC). Nunca incluye el hash. */
export interface ClienteListado {
  readonly id: string;
  readonly nombre: string;
  readonly email: string;
  readonly telefono: string | null;
  readonly activo: boolean;
  readonly creadoEn: string;
}

export interface Paginacion {
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
  /** `0` si no hay resultados. */
  readonly totalPaginas: number;
}

/** Forma común de los listados paginados de la API: `{ datos, paginacion }`. */
export interface Paginado<T> {
  readonly datos: T[];
  readonly paginacion: Paginacion;
}

export interface UsuariosService {
  listarClientes(filtro: FiltroClientes): Promise<Paginado<ClienteListado>>;
}

/** Calcula la paginación a partir del total (función pura). */
export function calcularPaginacion(pagina: number, porPagina: number, total: number): Paginacion {
  return { pagina, porPagina, total, totalPaginas: Math.ceil(total / porPagina) };
}

export function crearUsuariosService(repositorio: UsuariosRepository): UsuariosService {
  return {
    listarClientes: async ({ pagina, porPagina, q }) => {
      const { clientes, total } = await repositorio.listarClientes({
        saltar: (pagina - 1) * porPagina,
        tomar: porPagina,
        q,
      });
      return {
        // Se construye campo a campo: aunque el repositorio trajera más, no se filtra nada extra.
        datos: clientes.map((cliente) => ({
          id: cliente.id,
          nombre: cliente.nombre,
          email: cliente.email,
          telefono: cliente.telefono,
          activo: cliente.activo,
          creadoEn: cliente.creadoEn.toISOString(),
        })),
        paginacion: calcularPaginacion(pagina, porPagina, total),
      };
    },
  };
}

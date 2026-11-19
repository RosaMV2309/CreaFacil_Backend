import { AppError } from '../../shared/errors/index.js';
import type { ResultadoEscritura } from '../../shared/database/errores-prisma.js';
import type { CategoriaGuardada, CategoriasRepository } from './categorias.repository.js';
import type {
  DatosActualizarCategoria,
  DatosCrearCategoria,
  FiltroCategorias,
} from './categorias.schemas.js';

/**
 * Reglas de negocio de la gestión de categorías (RF-22: crear y editar desde el panel; RF-05/RF-03:
 * desactivar sin borrar). No conoce Express ni Prisma. El rol ADMIN se comprueba antes, en `/admin`.
 *
 * - Sin borrado: `activa: false` la desactiva. Sus servicios NO se desactivan uno por uno; el catálogo
 *   público (2.3) ocultará los servicios de una categoría inactiva.
 * - El nombre es único sin distinguir mayúsculas y tras normalizar los espacios.
 */

export const MENSAJE_NO_EXISTE = 'La categoría no existe.';
export const MENSAJE_DUPLICADO = 'Ya existe una categoría con ese nombre.';

/** Categoría en la respuesta JSON (fechas en ISO 8601, UTC). */
export interface CategoriaRespuesta {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly activa: boolean;
  readonly orden: number;
  readonly serviciosActivos: number;
  readonly serviciosTotales: number;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
}

export interface CategoriasService {
  listar(filtro: FiltroCategorias): Promise<{ datos: CategoriaRespuesta[] }>;
  obtener(id: string): Promise<CategoriaRespuesta>;
  crear(datos: DatosCrearCategoria): Promise<CategoriaRespuesta>;
  actualizar(id: string, datos: DatosActualizarCategoria): Promise<CategoriaRespuesta>;
}

/** Construye la respuesta campo a campo: nunca se filtra nada que el repositorio trajera de más. */
export function aRespuesta(categoria: CategoriaGuardada): CategoriaRespuesta {
  return {
    id: categoria.id,
    nombre: categoria.nombre,
    descripcion: categoria.descripcion,
    activa: categoria.activa,
    orden: categoria.orden,
    serviciosActivos: categoria.serviciosActivos,
    serviciosTotales: categoria.serviciosTotales,
    creadoEn: categoria.creadoEn.toISOString(),
    actualizadoEn: categoria.actualizadoEn.toISOString(),
  };
}

const errorDuplicado = () =>
  AppError.conflicto(MENSAJE_DUPLICADO, [
    { campo: 'nombre', ubicacion: 'body', mensaje: MENSAJE_DUPLICADO },
  ]);

function resolver(resultado: ResultadoEscritura<CategoriaGuardada>): CategoriaRespuesta {
  if (resultado.ok) {
    return aRespuesta(resultado.valor);
  }
  // 'duplicado': otra petición creó el mismo nombre entre la comprobación y la escritura.
  throw resultado.motivo === 'duplicado'
    ? errorDuplicado()
    : AppError.noEncontrado(MENSAJE_NO_EXISTE);
}

export function crearCategoriasService(repositorio: CategoriasRepository): CategoriasService {
  async function exigirExistente(id: string): Promise<CategoriaGuardada> {
    const categoria = await repositorio.obtener(id);
    if (!categoria) {
      throw AppError.noEncontrado(MENSAJE_NO_EXISTE);
    }
    return categoria;
  }

  return {
    listar: async (filtro) => ({ datos: (await repositorio.listar(filtro)).map(aRespuesta) }),

    obtener: async (id) => aRespuesta(await exigirExistente(id)),

    crear: async (datos) => {
      if (await repositorio.existeNombre(datos.nombre)) {
        throw errorDuplicado();
      }
      return resolver(await repositorio.crear(datos));
    },

    actualizar: async (id, datos) => {
      // Primero el 404 (no tiene sentido hablar de duplicados de algo que no existe).
      await exigirExistente(id);
      if (datos.nombre !== undefined && (await repositorio.existeNombre(datos.nombre, id))) {
        throw errorDuplicado();
      }
      return resolver(await repositorio.actualizar(id, datos));
    },
  };
}

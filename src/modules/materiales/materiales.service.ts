import type { ResultadoEscritura } from '../../shared/database/errores-prisma.js';
import { AppError } from '../../shared/errors/index.js';
import { calcularPaginacion, type Paginado } from '../../shared/utils/consultas.js';
import type { MaterialesRepository, MaterialGuardado } from './materiales.repository.js';
import type {
  DatosActualizarMaterial,
  DatosCrearMaterial,
  FiltroMateriales,
} from './materiales.schemas.js';

/**
 * Reglas de negocio de la gestión de materiales (RF-22; precios de RF-08).
 * No conoce Express ni Prisma. El rol ADMIN se comprueba antes, en el grupo `/admin`.
 *
 * - Sin borrado: `activo: false` lo desactiva (las cotizaciones y los servicios que lo usan lo conservan).
 * - RF-08 / RN-02: cambiar `precioUnitario` solo afecta a las cotizaciones NUEVAS. Las cotizaciones ya
 *   guardadas tienen su propia COPIA del precio (`DetalleCotizacionMaterial.precioUnitario`) y los
 *   pedidos su `precioAcordado`; este servicio no los toca.
 * - El nombre es único sin distinguir mayúsculas y tras normalizar los espacios.
 */

export const MENSAJE_NO_EXISTE = 'El material no existe.';
export const MENSAJE_DUPLICADO = 'Ya existe un material con ese nombre.';

/** Material en la respuesta JSON: precio como texto «x.xx» y fechas en ISO 8601 (UTC). */
export interface MaterialRespuesta {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly unidad: string;
  readonly precioUnitario: string;
  readonly activo: boolean;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
}

export interface MaterialesService {
  listar(filtro: FiltroMateriales): Promise<Paginado<MaterialRespuesta>>;
  obtener(id: string): Promise<MaterialRespuesta>;
  crear(datos: DatosCrearMaterial): Promise<MaterialRespuesta>;
  actualizar(id: string, datos: DatosActualizarMaterial): Promise<MaterialRespuesta>;
}

/** Construye la respuesta campo a campo: nunca se filtra nada que el repositorio trajera de más. */
export function aRespuesta(material: MaterialGuardado): MaterialRespuesta {
  return {
    id: material.id,
    nombre: material.nombre,
    descripcion: material.descripcion,
    unidad: material.unidad,
    precioUnitario: material.precioUnitario,
    activo: material.activo,
    creadoEn: material.creadoEn.toISOString(),
    actualizadoEn: material.actualizadoEn.toISOString(),
  };
}

const errorDuplicado = () =>
  AppError.conflicto(MENSAJE_DUPLICADO, [
    { campo: 'nombre', ubicacion: 'body', mensaje: MENSAJE_DUPLICADO },
  ]);

function resolver(resultado: ResultadoEscritura<MaterialGuardado>): MaterialRespuesta {
  if (resultado.ok) {
    return aRespuesta(resultado.valor);
  }
  // 'duplicado': otra petición creó el mismo nombre entre la comprobación y la escritura.
  throw resultado.motivo === 'duplicado'
    ? errorDuplicado()
    : AppError.noEncontrado(MENSAJE_NO_EXISTE);
}

export function crearMaterialesService(repositorio: MaterialesRepository): MaterialesService {
  async function exigirExistente(id: string): Promise<MaterialGuardado> {
    const material = await repositorio.obtener(id);
    if (!material) {
      throw AppError.noEncontrado(MENSAJE_NO_EXISTE);
    }
    return material;
  }

  return {
    listar: async ({ pagina, porPagina, q, activo }) => {
      const { materiales, total } = await repositorio.listar({
        saltar: (pagina - 1) * porPagina,
        tomar: porPagina,
        q,
        activo,
      });
      return {
        datos: materiales.map(aRespuesta),
        paginacion: calcularPaginacion(pagina, porPagina, total),
      };
    },

    obtener: async (id) => aRespuesta(await exigirExistente(id)),

    crear: async (datos) => {
      if (await repositorio.existeNombre(datos.nombre)) {
        throw errorDuplicado();
      }
      return resolver(await repositorio.crear(datos));
    },

    actualizar: async (id, datos) => {
      await exigirExistente(id);
      if (datos.nombre !== undefined && (await repositorio.existeNombre(datos.nombre, id))) {
        throw errorDuplicado();
      }
      return resolver(await repositorio.actualizar(id, datos));
    },
  };
}

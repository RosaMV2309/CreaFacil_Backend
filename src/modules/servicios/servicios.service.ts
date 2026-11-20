import type { AlmacenamientoArchivos } from '../../shared/almacenamiento/almacenamiento.js';
import type { ResultadoEscritura } from '../../shared/database/errores-prisma.js';
import { AppError } from '../../shared/errors/index.js';
import { calcularPaginacion, type Paginado } from '../../shared/utils/consultas.js';
import type {
  FotoGuardada,
  ServicioGuardado,
  ServicioResumenGuardado,
  ServiciosRepository,
} from './servicios.repository.js';
import type {
  DatosActualizarServicio,
  DatosCrearServicio,
  FiltroServicios,
} from './servicios.schemas.js';

/**
 * Reglas de negocio de la gestión de servicios del catálogo (RF-22, RF-04, RF-05).
 * No conoce Express ni Prisma. El rol ADMIN se comprueba antes, en el grupo `/admin`.
 *
 * - RF-05: SIN borrado. `activo: false` lo desactiva: deja de mostrarse a los clientes (2.3) sin
 *   perderse (sus cotizaciones, solicitudes y fotos se conservan).
 * - El nombre es único DENTRO DE SU CATEGORÍA, sin distinguir mayúsculas (puede haber un
 *   «Personalizado» en Murales y otro en Cuadros). Lo respalda el índice único (categoria_id, nombre).
 * - La categoría debe existir; puede estar desactivada (la administradora puede preparar servicios
 *   antes de publicar la categoría). Desactivar una categoría NO desactiva sus servicios.
 * - Materiales habituales (RF-04): deben existir. Los que se AÑADEN deben estar activos (un material
 *   desactivado no se usa en trabajos nuevos); los que el servicio YA tenía se pueden conservar
 *   aunque se hayan desactivado después, para no obligar a quitarlos al editar otra cosa.
 * - La URL de cada foto la da el almacenamiento (absoluta), no la que se guardó al subirla.
 */

export const MENSAJE_NO_EXISTE = 'El servicio no existe.';
export const MENSAJE_DUPLICADO = 'Ya existe un servicio con ese nombre en esta categoría.';
export const MENSAJE_CATEGORIA_NO_EXISTE = 'La categoría no existe.';

export interface FotoRespuesta {
  readonly id: string;
  readonly url: string;
  readonly orden: number;
}

export interface ServicioResumenRespuesta {
  readonly id: string;
  readonly nombre: string;
  readonly categoria: { readonly id: string; readonly nombre: string; readonly activa: boolean };
  readonly activo: boolean;
  readonly precioBaseReferencial: string | null;
  readonly portadaUrl: string | null;
  readonly numeroFotos: number;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
}

export interface ServicioRespuesta extends ServicioResumenRespuesta {
  readonly descripcion: string | null;
  readonly dimensionesOrientativas: string | null;
  readonly observaciones: string | null;
  readonly materiales: {
    readonly id: string;
    readonly nombre: string;
    readonly unidad: string;
    readonly activo: boolean;
  }[];
  readonly fotos: FotoRespuesta[];
}

export interface ServiciosService {
  listar(filtro: FiltroServicios): Promise<Paginado<ServicioResumenRespuesta>>;
  obtener(id: string): Promise<ServicioRespuesta>;
  crear(datos: DatosCrearServicio): Promise<ServicioRespuesta>;
  actualizar(id: string, datos: DatosActualizarServicio): Promise<ServicioRespuesta>;
}

/** URL pública de una foto: la calcula el almacenamiento si el archivo es suyo. */
export function urlDeFoto(foto: FotoGuardada, almacenamiento: AlmacenamientoArchivos): string {
  return foto.clave === null ? foto.url : almacenamiento.urlPublica(foto.clave);
}

export function fotoARespuesta(
  foto: FotoGuardada,
  almacenamiento: AlmacenamientoArchivos,
): FotoRespuesta {
  return { id: foto.id, url: urlDeFoto(foto, almacenamiento), orden: foto.orden };
}

/** Construye la respuesta campo a campo: nunca se filtra la clave interna ni nada de más. */
export function resumenARespuesta(
  servicio: ServicioResumenGuardado,
  almacenamiento: AlmacenamientoArchivos,
): ServicioResumenRespuesta {
  return {
    id: servicio.id,
    nombre: servicio.nombre,
    categoria: {
      id: servicio.categoria.id,
      nombre: servicio.categoria.nombre,
      activa: servicio.categoria.activa,
    },
    activo: servicio.activo,
    precioBaseReferencial: servicio.precioBaseReferencial,
    portadaUrl: servicio.portada ? urlDeFoto(servicio.portada, almacenamiento) : null,
    numeroFotos: servicio.numeroFotos,
    creadoEn: servicio.creadoEn.toISOString(),
    actualizadoEn: servicio.actualizadoEn.toISOString(),
  };
}

export function servicioARespuesta(
  servicio: ServicioGuardado,
  almacenamiento: AlmacenamientoArchivos,
): ServicioRespuesta {
  return {
    ...resumenARespuesta(servicio, almacenamiento),
    descripcion: servicio.descripcion,
    dimensionesOrientativas: servicio.dimensionesOrientativas,
    observaciones: servicio.observaciones,
    materiales: servicio.materiales.map(({ id, nombre, unidad, activo }) => ({
      id,
      nombre,
      unidad,
      activo,
    })),
    fotos: servicio.fotos.map((foto) => fotoARespuesta(foto, almacenamiento)),
  };
}

const errorDuplicado = () =>
  AppError.conflicto(MENSAJE_DUPLICADO, [
    { campo: 'nombre', ubicacion: 'body', mensaje: MENSAJE_DUPLICADO },
  ]);

const errorCampo = (campo: string, mensaje: string) =>
  AppError.validacion([{ campo, ubicacion: 'body', mensaje }]);

export function crearServiciosService(
  repositorio: ServiciosRepository,
  almacenamiento: AlmacenamientoArchivos,
): ServiciosService {
  const aRespuesta = (servicio: ServicioGuardado) => servicioARespuesta(servicio, almacenamiento);

  function resolver(resultado: ResultadoEscritura<ServicioGuardado>): ServicioRespuesta {
    if (resultado.ok) {
      return aRespuesta(resultado.valor);
    }
    // 'duplicado': otra petición creó el mismo nombre entre la comprobación y la escritura.
    throw resultado.motivo === 'duplicado'
      ? errorDuplicado()
      : AppError.noEncontrado(MENSAJE_NO_EXISTE);
  }

  async function exigirExistente(id: string): Promise<ServicioGuardado> {
    const servicio = await repositorio.obtener(id);
    if (!servicio) {
      throw AppError.noEncontrado(MENSAJE_NO_EXISTE);
    }
    return servicio;
  }

  async function exigirCategoria(categoriaId: string): Promise<void> {
    if (!(await repositorio.existeCategoria(categoriaId))) {
      throw errorCampo('categoriaId', MENSAJE_CATEGORIA_NO_EXISTE);
    }
  }

  /** Comprueba los materiales: todos deben existir y los NUEVOS deben estar activos. */
  async function comprobarMateriales(
    materialIds: readonly string[],
    yaAsociados: ReadonlySet<string> = new Set(),
  ): Promise<void> {
    const encontrados = await repositorio.buscarMateriales(materialIds);
    const porId = new Map(encontrados.map((material) => [material.id, material]));
    const inexistentes = materialIds.filter((id) => !porId.has(id));
    if (inexistentes.length > 0) {
      throw errorCampo('materialIds', `No existen estos materiales: ${inexistentes.join(', ')}.`);
    }
    const inactivos = encontrados
      .filter((material) => !material.activo && !yaAsociados.has(material.id))
      .map((material) => material.nombre);
    if (inactivos.length > 0) {
      throw errorCampo(
        'materialIds',
        `Estos materiales están desactivados y no se pueden añadir: ${inactivos.join(', ')}.`,
      );
    }
  }

  return {
    listar: async ({ pagina, porPagina, q, categoriaId, activo }) => {
      const { servicios, total } = await repositorio.listar({
        saltar: (pagina - 1) * porPagina,
        tomar: porPagina,
        q,
        categoriaId,
        activo,
      });
      return {
        datos: servicios.map((servicio) => resumenARespuesta(servicio, almacenamiento)),
        paginacion: calcularPaginacion(pagina, porPagina, total),
      };
    },

    obtener: async (id) => aRespuesta(await exigirExistente(id)),

    crear: async (datos) => {
      await exigirCategoria(datos.categoriaId);
      if (datos.materialIds) {
        await comprobarMateriales(datos.materialIds);
      }
      if (await repositorio.existeNombre(datos.categoriaId, datos.nombre)) {
        throw errorDuplicado();
      }
      return resolver(await repositorio.crear(datos));
    },

    actualizar: async (id, datos) => {
      const actual = await exigirExistente(id);
      if (datos.categoriaId !== undefined) {
        await exigirCategoria(datos.categoriaId);
      }
      if (datos.materialIds) {
        await comprobarMateriales(
          datos.materialIds,
          new Set(actual.materiales.map((material) => material.id)),
        );
      }
      if (datos.nombre !== undefined || datos.categoriaId !== undefined) {
        const categoriaId = datos.categoriaId ?? actual.categoria.id;
        const nombre = datos.nombre ?? actual.nombre;
        if (await repositorio.existeNombre(categoriaId, nombre, id)) {
          throw errorDuplicado();
        }
      }
      return resolver(await repositorio.actualizar(id, datos));
    },
  };
}

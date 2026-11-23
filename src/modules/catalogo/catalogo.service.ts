import type { AlmacenamientoArchivos } from '../../shared/almacenamiento/almacenamiento.js';
import { AppError } from '../../shared/errors/index.js';
import { urlDeFoto } from '../servicios/servicios.service.js';
import type {
  CatalogoRepository,
  CategoriaCatalogoGuardada,
  FichaPublicaGuardada,
} from './catalogo.repository.js';
import type { FiltroCatalogo } from './catalogo.schemas.js';

/**
 * Reglas del catálogo PÚBLICO (RF-03, RF-04, RF-05, RN-01). Sin sesión: lo ve cualquiera.
 *
 * LISTA BLANCA: cada respuesta se construye campo a campo con estos DTO públicos. Nunca se hace
 * `...objeto` de lo que viene de la base de datos, así que un campo nuevo en el modelo no se
 * publica por accidente (lo comprueban las pruebas de lista blanca).
 *
 * - RF-05: un servicio inexistente, inactivo o de una categoría inactiva responde EL MISMO 404,
 *   para no revelar si existe.
 * - RN-01: el precio base se publica como `precioReferencial: { desde, esReferencial: true }`;
 *   la app lo muestra como «Desde $X (referencial)». Sin precio → `null`.
 */

export const MENSAJE_NO_DISPONIBLE = 'El servicio no existe o no está disponible.';

export interface PrecioReferencial {
  /** Texto con 2 decimales, por ejemplo "120.50". */
  readonly desde: string;
  /** Siempre true: es orientativo, el precio final lo confirma la administradora (RN-01). */
  readonly esReferencial: true;
}

export interface ServicioCatalogoPublico {
  readonly id: string;
  readonly nombre: string;
  readonly portadaUrl: string | null;
  readonly precioReferencial: PrecioReferencial | null;
}

export interface CategoriaCatalogoPublica {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly servicios: ServicioCatalogoPublico[];
}

export interface CatalogoPublico {
  readonly categorias: CategoriaCatalogoPublica[];
}

export interface FichaPublica {
  readonly id: string;
  readonly nombre: string;
  readonly categoria: { readonly id: string; readonly nombre: string };
  readonly descripcion: string | null;
  readonly dimensionesOrientativas: string | null;
  readonly observaciones: string | null;
  readonly materialesHabituales: string[];
  readonly fotos: { readonly url: string }[];
  readonly precioReferencial: PrecioReferencial | null;
}

export interface CatalogoService {
  listar(filtro: FiltroCatalogo): Promise<CatalogoPublico>;
  obtenerFicha(id: string): Promise<FichaPublica>;
}

/** RN-01: forma pública del precio base (función pura). */
export function aPrecioReferencial(precio: string | null): PrecioReferencial | null {
  return precio === null ? null : { desde: precio, esReferencial: true };
}

export function categoriaAPublica(
  categoria: CategoriaCatalogoGuardada,
  almacenamiento: AlmacenamientoArchivos,
): CategoriaCatalogoPublica {
  return {
    id: categoria.id,
    nombre: categoria.nombre,
    descripcion: categoria.descripcion,
    servicios: categoria.servicios.map((servicio) => ({
      id: servicio.id,
      nombre: servicio.nombre,
      portadaUrl: servicio.portada ? urlDeFoto(servicio.portada, almacenamiento) : null,
      precioReferencial: aPrecioReferencial(servicio.precioBaseReferencial),
    })),
  };
}

export function fichaAPublica(
  ficha: FichaPublicaGuardada,
  almacenamiento: AlmacenamientoArchivos,
): FichaPublica {
  return {
    id: ficha.id,
    nombre: ficha.nombre,
    categoria: { id: ficha.categoria.id, nombre: ficha.categoria.nombre },
    descripcion: ficha.descripcion,
    dimensionesOrientativas: ficha.dimensionesOrientativas,
    observaciones: ficha.observaciones,
    materialesHabituales: [...ficha.materiales],
    fotos: ficha.fotos.map((foto) => ({ url: urlDeFoto(foto, almacenamiento) })),
    precioReferencial: aPrecioReferencial(ficha.precioBaseReferencial),
  };
}

export function crearCatalogoService(
  repositorio: CatalogoRepository,
  almacenamiento: AlmacenamientoArchivos,
): CatalogoService {
  return {
    listar: async ({ q, categoriaId }) => {
      const categorias = await repositorio.listar({ q, categoriaId });
      return {
        // Defensa extra: una categoría sin servicios visibles nunca sale (RF-03).
        categorias: categorias
          .filter((categoria) => categoria.servicios.length > 0)
          .map((categoria) => categoriaAPublica(categoria, almacenamiento)),
      };
    },

    obtenerFicha: async (id) => {
      const ficha = await repositorio.obtenerFicha(id);
      if (!ficha) {
        throw AppError.noEncontrado(MENSAJE_NO_DISPONIBLE);
      }
      return fichaAPublica(ficha, almacenamiento);
    },
  };
}

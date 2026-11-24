import type { PrismaClient } from '../../shared/database/prisma.js';
import { escaparLike } from '../../shared/utils/consultas.js';
import type { FotoGuardada } from '../servicios/servicios.repository.js';

/**
 * Acceso a datos del catálogo PÚBLICO (RF-03, RF-04, RF-05; RNF-07).
 *
 * REGLA DE VISIBILIDAD (se aplica en TODAS las consultas de este archivo):
 * - un servicio es visible si está activo Y su categoría está activa (una categoría desactivada
 *   oculta sus servicios sin desactivarlos);
 * - una categoría aparece solo si está activa y tiene al menos un servicio visible
 *   (que además cumpla el filtro `q`, si lo hay).
 *
 * Solo se SELECCIONAN los campos que necesita la respuesta pública: nunca precios de materiales,
 * horas de mano de obra, fechas ni datos internos de las fotos (salvo la clave, necesaria para
 * calcular la URL y que el servicio no expone).
 */

export interface ServicioCatalogoGuardado {
  readonly id: string;
  readonly nombre: string;
  readonly precioBaseReferencial: string | null;
  /** Foto con orden 0 (o null si no tiene). */
  readonly portada: FotoGuardada | null;
}

export interface CategoriaCatalogoGuardada {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  /** Solo los servicios visibles, por nombre. Nunca vacío. */
  readonly servicios: ServicioCatalogoGuardado[];
}

export interface FichaPublicaGuardada {
  readonly id: string;
  readonly nombre: string;
  readonly categoria: { readonly id: string; readonly nombre: string };
  readonly descripcion: string | null;
  readonly dimensionesOrientativas: string | null;
  readonly observaciones: string | null;
  readonly precioBaseReferencial: string | null;
  /** Nombres de los materiales habituales ACTIVOS, por nombre. */
  readonly materiales: string[];
  /** Ordenadas por `orden` (0 = portada). */
  readonly fotos: FotoGuardada[];
}

export interface ConsultaCatalogo {
  readonly q?: string | undefined;
  readonly categoriaId?: string | undefined;
}

export interface CatalogoRepository {
  /** Categorías visibles por `orden`, nombre e id, cada una con sus servicios visibles. */
  listar(consulta: ConsultaCatalogo): Promise<CategoriaCatalogoGuardada[]>;
  /** Ficha del servicio solo si es visible; si no existe o no es visible, null. */
  obtenerFicha(id: string): Promise<FichaPublicaGuardada | null>;
}

const SELECCION_FOTO = { id: true, clave: true, url: true, orden: true } as const;
const ORDEN_FOTOS = [{ orden: 'asc' as const }, { createdAt: 'asc' as const }];

type Decimal = { toFixed(decimales: number): string } | null;
const aTexto = (valor: Decimal) => valor?.toFixed(2) ?? null;

/** Condición de servicio visible (y, si hay búsqueda, que su nombre la contenga). */
function servicioVisible(q?: string) {
  return {
    activo: true,
    categoria: { activa: true },
    ...(q ? { nombre: { contains: escaparLike(q), mode: 'insensitive' as const } } : {}),
  };
}

export function crearCatalogoRepository(prisma: PrismaClient): CatalogoRepository {
  return {
    listar: async ({ q, categoriaId }) => {
      const visible = servicioVisible(q);
      const filas = await prisma.categoria.findMany({
        where: {
          activa: true,
          ...(categoriaId === undefined ? {} : { id: categoriaId }),
          servicios: { some: visible },
        },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          servicios: {
            where: visible,
            orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              nombre: true,
              precioBaseReferencial: true,
              imagenes: { select: SELECCION_FOTO, orderBy: ORDEN_FOTOS, take: 1 },
            },
          },
        },
      });
      return filas.map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        descripcion: fila.descripcion,
        servicios: fila.servicios.map((servicio) => ({
          id: servicio.id,
          nombre: servicio.nombre,
          precioBaseReferencial: aTexto(servicio.precioBaseReferencial),
          portada: servicio.imagenes[0] ?? null,
        })),
      }));
    },

    obtenerFicha: async (id) => {
      const fila = await prisma.servicio.findFirst({
        where: { id, ...servicioVisible() },
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          dimensionesOrientativas: true,
          observaciones: true,
          precioBaseReferencial: true,
          categoria: { select: { id: true, nombre: true } },
          imagenes: { select: SELECCION_FOTO, orderBy: ORDEN_FOTOS },
          materialesHabituales: {
            where: { material: { activo: true } },
            select: { material: { select: { nombre: true } } },
            orderBy: { material: { nombre: 'asc' as const } },
          },
        },
      });
      if (!fila) {
        return null;
      }
      return {
        id: fila.id,
        nombre: fila.nombre,
        categoria: fila.categoria,
        descripcion: fila.descripcion,
        dimensionesOrientativas: fila.dimensionesOrientativas,
        observaciones: fila.observaciones,
        precioBaseReferencial: aTexto(fila.precioBaseReferencial),
        materiales: fila.materialesHabituales.map(({ material }) => material.nombre),
        fotos: fila.imagenes,
      };
    },
  };
}

import {
  escribirConControl,
  type ResultadoEscritura,
  sinIndefinidos,
} from '../../shared/database/errores-prisma.js';
import type { PrismaClient } from '../../shared/database/prisma.js';
import { escaparLike } from '../../shared/utils/consultas.js';

/**
 * Acceso a datos de los servicios del catálogo (RF-22, RF-04, RF-05; RNF-07).
 * No hay borrado: los servicios solo se desactivan (decisión de la Fase 2).
 * Precios Decimal → texto «x.xx» (`toFixed(2)`), igual que los materiales.
 */

export interface FotoGuardada {
  readonly id: string;
  /** Clave interna en el almacenamiento (null en imágenes externas sin archivo propio). */
  readonly clave: string | null;
  /** URL guardada al subirla (solo se usa si no hay clave). */
  readonly url: string;
  readonly orden: number;
}

export interface CategoriaResumen {
  readonly id: string;
  readonly nombre: string;
  readonly activa: boolean;
}

export interface MaterialHabitual {
  readonly id: string;
  readonly nombre: string;
  readonly unidad: string;
  readonly activo: boolean;
}

export interface ServicioResumenGuardado {
  readonly id: string;
  readonly nombre: string;
  readonly categoria: CategoriaResumen;
  readonly activo: boolean;
  readonly precioBaseReferencial: string | null;
  /** Foto con orden 0 (o null si no tiene). */
  readonly portada: FotoGuardada | null;
  readonly numeroFotos: number;
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
}

export interface ServicioGuardado extends ServicioResumenGuardado {
  readonly descripcion: string | null;
  readonly dimensionesOrientativas: string | null;
  readonly observaciones: string | null;
  readonly materiales: MaterialHabitual[];
  /** Ordenadas por `orden` (0 = portada). */
  readonly fotos: FotoGuardada[];
}

export interface DatosServicio {
  readonly categoriaId?: string | undefined;
  readonly nombre?: string | undefined;
  readonly descripcion?: string | null | undefined;
  readonly dimensionesOrientativas?: string | null | undefined;
  readonly observaciones?: string | null | undefined;
  readonly precioBaseReferencial?: string | null | undefined;
  /** Si viene, REEMPLAZA la lista de materiales habituales. */
  readonly materialIds?: readonly string[] | undefined;
  readonly activo?: boolean | undefined;
}

export interface ConsultaServicios {
  readonly saltar: number;
  readonly tomar: number;
  readonly q?: string | undefined;
  readonly categoriaId?: string | undefined;
  readonly activo?: boolean | undefined;
}

export interface MaterialEncontrado {
  readonly id: string;
  readonly nombre: string;
  readonly activo: boolean;
}

export interface ServiciosRepository {
  /** Ordenados por nombre (el id desempata), paginados. */
  listar(
    consulta: ConsultaServicios,
  ): Promise<{ servicios: ServicioResumenGuardado[]; total: number }>;
  obtener(id: string): Promise<ServicioGuardado | null>;
  existeCategoria(id: string): Promise<boolean>;
  /** Materiales que existen de entre esos ids. */
  buscarMateriales(ids: readonly string[]): Promise<MaterialEncontrado[]>;
  /** ¿Hay otro servicio con ese nombre EN ESA CATEGORÍA, sin distinguir mayúsculas? */
  existeNombre(categoriaId: string, nombre: string, excluirId?: string): Promise<boolean>;
  crear(
    datos: DatosServicio & { categoriaId: string; nombre: string },
  ): Promise<ResultadoEscritura<ServicioGuardado>>;
  actualizar(id: string, datos: DatosServicio): Promise<ResultadoEscritura<ServicioGuardado>>;
}

const SELECCION_FOTO = { id: true, clave: true, url: true, orden: true } as const;
const ORDEN_FOTOS = [{ orden: 'asc' as const }, { createdAt: 'asc' as const }];

const SELECCION_RESUMEN = {
  id: true,
  nombre: true,
  activo: true,
  precioBaseReferencial: true,
  createdAt: true,
  updatedAt: true,
  categoria: { select: { id: true, nombre: true, activa: true } },
  _count: { select: { imagenes: true } },
} as const;

const SELECCION_FICHA = {
  ...SELECCION_RESUMEN,
  descripcion: true,
  dimensionesOrientativas: true,
  observaciones: true,
  imagenes: { select: SELECCION_FOTO, orderBy: ORDEN_FOTOS },
  materialesHabituales: {
    select: { material: { select: { id: true, nombre: true, unidad: true, activo: true } } },
    orderBy: { material: { nombre: 'asc' as const } },
  },
} as const;

interface FilaResumen {
  id: string;
  nombre: string;
  activo: boolean;
  precioBaseReferencial: { toFixed(decimales: number): string } | null;
  createdAt: Date;
  updatedAt: Date;
  categoria: CategoriaResumen;
  _count: { imagenes: number };
}

interface FilaFicha extends FilaResumen {
  descripcion: string | null;
  dimensionesOrientativas: string | null;
  observaciones: string | null;
  imagenes: FotoGuardada[];
  materialesHabituales: { material: MaterialHabitual }[];
}

function mapearResumen(fila: FilaResumen, portada: FotoGuardada | null): ServicioResumenGuardado {
  return {
    id: fila.id,
    nombre: fila.nombre,
    categoria: fila.categoria,
    activo: fila.activo,
    precioBaseReferencial: fila.precioBaseReferencial?.toFixed(2) ?? null,
    portada,
    numeroFotos: fila._count.imagenes,
    creadoEn: fila.createdAt,
    actualizadoEn: fila.updatedAt,
  };
}

export function mapearServicio(fila: FilaFicha): ServicioGuardado {
  return {
    ...mapearResumen(fila, fila.imagenes[0] ?? null),
    descripcion: fila.descripcion,
    dimensionesOrientativas: fila.dimensionesOrientativas,
    observaciones: fila.observaciones,
    materiales: fila.materialesHabituales.map(({ material }) => material),
    fotos: fila.imagenes,
  };
}

/** Campos escalares para Prisma (sin `materialIds`, que va como relación). */
function datosEscalares({ materialIds: _materialIds, ...datos }: DatosServicio) {
  return sinIndefinidos(datos);
}

export function crearServiciosRepository(prisma: PrismaClient): ServiciosRepository {
  return {
    listar: async ({ saltar, tomar, q, categoriaId, activo }) => {
      const where = {
        ...(activo === undefined ? {} : { activo }),
        ...(categoriaId === undefined ? {} : { categoriaId }),
        ...(q ? { nombre: { contains: escaparLike(q), mode: 'insensitive' as const } } : {}),
      };
      // Lista y total en la misma transacción para que la paginación sea coherente.
      const [filas, total] = await prisma.$transaction([
        prisma.servicio.findMany({
          where,
          orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
          skip: saltar,
          take: tomar,
          select: {
            ...SELECCION_RESUMEN,
            imagenes: { select: SELECCION_FOTO, orderBy: ORDEN_FOTOS, take: 1 },
          },
        }),
        prisma.servicio.count({ where }),
      ]);
      return {
        servicios: filas.map((fila) => mapearResumen(fila, fila.imagenes[0] ?? null)),
        total,
      };
    },

    obtener: async (id) => {
      const fila = await prisma.servicio.findUnique({ where: { id }, select: SELECCION_FICHA });
      return fila ? mapearServicio(fila) : null;
    },

    existeCategoria: async (id) => (await prisma.categoria.count({ where: { id } })) > 0,

    buscarMateriales: async (ids) =>
      ids.length === 0
        ? []
        : prisma.material.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, nombre: true, activo: true },
          }),

    existeNombre: async (categoriaId, nombre, excluirId) => {
      // lower() = lower() con parámetros: sin comodines LIKE y sin riesgo de inyección SQL.
      const filas = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM servicios
        WHERE categoria_id = ${categoriaId}::uuid
          AND lower(nombre) = lower(${nombre})
          AND (${excluirId ?? null}::uuid IS NULL OR id <> ${excluirId ?? null}::uuid)
        LIMIT 1`;
      return filas.length > 0;
    },

    crear: async (datos) =>
      escribirConControl(async () =>
        mapearServicio(
          await prisma.servicio.create({
            data: {
              ...datosEscalares(datos),
              categoriaId: datos.categoriaId,
              nombre: datos.nombre,
              materialesHabituales: {
                create: (datos.materialIds ?? []).map((materialId) => ({ materialId })),
              },
            },
            select: SELECCION_FICHA,
          }),
        ),
      ),

    actualizar: async (id, datos) =>
      escribirConControl(async () =>
        mapearServicio(
          await prisma.servicio.update({
            where: { id },
            data: {
              ...datosEscalares(datos),
              ...(datos.materialIds === undefined
                ? {}
                : {
                    // Reemplazo completo en la misma escritura (Prisma lo hace en una transacción).
                    materialesHabituales: {
                      deleteMany: {},
                      create: datos.materialIds.map((materialId) => ({ materialId })),
                    },
                  }),
            },
            select: SELECCION_FICHA,
          }),
        ),
      ),
  };
}

import {
  escribirConControl,
  type ResultadoEscritura,
  sinIndefinidos,
} from '../../shared/database/errores-prisma.js';
import type { PrismaClient } from '../../shared/database/prisma.js';
import { escaparLike } from '../../shared/utils/consultas.js';

/**
 * Acceso a datos de las categorías (RNF-07): la única capa del módulo que conoce Prisma.
 * No hay borrado: las categorías solo se desactivan (decisión de la Fase 2, RF-05).
 */

/** Categoría con los recuentos de sus servicios, para que el panel pueda avisar. */
export interface CategoriaGuardada {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly activa: boolean;
  readonly orden: number;
  readonly serviciosActivos: number;
  readonly serviciosTotales: number;
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
}

export interface DatosCategoria {
  readonly nombre?: string | undefined;
  readonly descripcion?: string | null | undefined;
  readonly orden?: number | undefined;
  readonly activa?: boolean | undefined;
}

export interface FiltroRepositorioCategorias {
  readonly activa?: boolean | undefined;
  readonly q?: string | undefined;
}

export interface CategoriasRepository {
  /** Ordenadas por `orden` y después por nombre (el id desempata). */
  listar(filtro: FiltroRepositorioCategorias): Promise<CategoriaGuardada[]>;
  obtener(id: string): Promise<CategoriaGuardada | null>;
  /** ¿Hay otra categoría con ese nombre, sin distinguir mayúsculas? */
  existeNombre(nombre: string, excluirId?: string): Promise<boolean>;
  crear(datos: DatosCategoria & { nombre: string }): Promise<ResultadoEscritura<CategoriaGuardada>>;
  actualizar(id: string, datos: DatosCategoria): Promise<ResultadoEscritura<CategoriaGuardada>>;
}

const SELECCION = {
  id: true,
  nombre: true,
  descripcion: true,
  activa: true,
  orden: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface FilaCategoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  orden: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Servicios activos y totales por id de categoría. */
interface Recuentos {
  readonly activos: Map<string, number>;
  readonly totales: Map<string, number>;
}

export function crearCategoriasRepository(
  prisma: Pick<PrismaClient, 'categoria' | 'servicio' | '$queryRaw'>,
): CategoriasRepository {
  /** Servicios activos y totales de cada categoría, en UNA consulta (groupBy por categoría y estado). */
  async function contarServicios(ids: string[]): Promise<Recuentos> {
    const recuentos: Recuentos = { activos: new Map(), totales: new Map() };
    if (ids.length === 0) {
      return recuentos;
    }
    const grupos = await prisma.servicio.groupBy({
      by: ['categoriaId', 'activo'],
      where: { categoriaId: { in: ids } },
      _count: { _all: true },
    });
    for (const { categoriaId, activo, _count } of grupos) {
      recuentos.totales.set(categoriaId, (recuentos.totales.get(categoriaId) ?? 0) + _count._all);
      // Hay como mucho un grupo activo por categoría.
      if (activo) {
        recuentos.activos.set(categoriaId, _count._all);
      }
    }
    return recuentos;
  }

  async function conRecuentos(filas: FilaCategoria[]): Promise<CategoriaGuardada[]> {
    const recuentos = await contarServicios(filas.map((fila) => fila.id));
    return filas.map(({ createdAt, updatedAt, ...fila }) => ({
      ...fila,
      serviciosActivos: recuentos.activos.get(fila.id) ?? 0,
      serviciosTotales: recuentos.totales.get(fila.id) ?? 0,
      creadoEn: createdAt,
      actualizadoEn: updatedAt,
    }));
  }

  async function unaConRecuentos(fila: FilaCategoria): Promise<CategoriaGuardada> {
    const [categoria] = await conRecuentos([fila]);
    return categoria as CategoriaGuardada;
  }

  return {
    listar: async ({ activa, q }) => {
      const filas = await prisma.categoria.findMany({
        where: {
          ...(activa === undefined ? {} : { activa }),
          ...(q ? { nombre: { contains: escaparLike(q), mode: 'insensitive' as const } } : {}),
        },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
        select: SELECCION,
      });
      return conRecuentos(filas);
    },

    obtener: async (id) => {
      const fila = await prisma.categoria.findUnique({ where: { id }, select: SELECCION });
      return fila ? unaConRecuentos(fila) : null;
    },

    existeNombre: async (nombre, excluirId) => {
      // lower() = lower() con parámetros: sin comodines LIKE y sin riesgo de inyección SQL.
      const filas = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM categorias
        WHERE lower(nombre) = lower(${nombre})
          AND (${excluirId ?? null}::uuid IS NULL OR id <> ${excluirId ?? null}::uuid)
        LIMIT 1`;
      return filas.length > 0;
    },

    crear: async (datos) =>
      escribirConControl(async () =>
        unaConRecuentos(
          await prisma.categoria.create({
            data: { ...sinIndefinidos(datos), nombre: datos.nombre },
            select: SELECCION,
          }),
        ),
      ),

    actualizar: async (id, datos) =>
      escribirConControl(async () =>
        unaConRecuentos(
          await prisma.categoria.update({
            where: { id },
            data: sinIndefinidos(datos),
            select: SELECCION,
          }),
        ),
      ),
  };
}

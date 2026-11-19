import {
  escribirConControl,
  type ResultadoEscritura,
  sinIndefinidos,
} from '../../shared/database/errores-prisma.js';
import type { PrismaClient } from '../../shared/database/prisma.js';
import { escaparLike } from '../../shared/utils/consultas.js';

/**
 * Acceso a datos de los materiales (RNF-07): la única capa del módulo que conoce Prisma.
 * No hay borrado: los materiales solo se desactivan (decisión de la Fase 2).
 *
 * El precio viaja como TEXTO en las dos direcciones: Prisma convierte «0.75» a `Decimal(12, 2)` sin
 * pasar por float, y al leer se formatea con `Decimal.toFixed(2)`.
 */

export interface MaterialGuardado {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly unidad: string;
  /** Texto con 2 decimales: «0.75». */
  readonly precioUnitario: string;
  readonly activo: boolean;
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
}

export interface DatosMaterial {
  readonly nombre?: string | undefined;
  readonly unidad?: string | undefined;
  /** Texto ya validado y normalizado («0.75»). */
  readonly precioUnitario?: string | undefined;
  readonly descripcion?: string | null | undefined;
  readonly activo?: boolean | undefined;
}

export interface ConsultaMateriales {
  readonly saltar: number;
  readonly tomar: number;
  readonly q?: string | undefined;
  readonly activo?: boolean | undefined;
}

export interface MaterialesRepository {
  /** Ordenados por nombre (el id desempata), paginados. */
  listar(consulta: ConsultaMateriales): Promise<{ materiales: MaterialGuardado[]; total: number }>;
  obtener(id: string): Promise<MaterialGuardado | null>;
  /** ¿Hay otro material con ese nombre, sin distinguir mayúsculas? */
  existeNombre(nombre: string, excluirId?: string): Promise<boolean>;
  crear(
    datos: DatosMaterial & { nombre: string; unidad: string; precioUnitario: string },
  ): Promise<ResultadoEscritura<MaterialGuardado>>;
  actualizar(id: string, datos: DatosMaterial): Promise<ResultadoEscritura<MaterialGuardado>>;
}

const SELECCION = {
  id: true,
  nombre: true,
  descripcion: true,
  unidad: true,
  precioUnitario: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface FilaMaterial {
  id: string;
  nombre: string;
  descripcion: string | null;
  unidad: string;
  precioUnitario: { toFixed(decimales: number): string };
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Convierte la fila de Prisma: precio Decimal → «x.xx» y fechas con nombres en español. */
export function mapearMaterial({
  createdAt,
  updatedAt,
  precioUnitario,
  ...fila
}: FilaMaterial): MaterialGuardado {
  return {
    ...fila,
    precioUnitario: precioUnitario.toFixed(2),
    creadoEn: createdAt,
    actualizadoEn: updatedAt,
  };
}

export function crearMaterialesRepository(
  prisma: Pick<PrismaClient, 'material' | '$transaction' | '$queryRaw'>,
): MaterialesRepository {
  return {
    listar: async ({ saltar, tomar, q, activo }) => {
      const where = {
        ...(activo === undefined ? {} : { activo }),
        ...(q ? { nombre: { contains: escaparLike(q), mode: 'insensitive' as const } } : {}),
      };
      // Lista y total en la misma transacción para que la paginación sea coherente.
      const [filas, total] = await prisma.$transaction([
        prisma.material.findMany({
          where,
          orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
          skip: saltar,
          take: tomar,
          select: SELECCION,
        }),
        prisma.material.count({ where }),
      ]);
      return { materiales: filas.map(mapearMaterial), total };
    },

    obtener: async (id) => {
      const fila = await prisma.material.findUnique({ where: { id }, select: SELECCION });
      return fila ? mapearMaterial(fila) : null;
    },

    existeNombre: async (nombre, excluirId) => {
      // lower() = lower() con parámetros: sin comodines LIKE y sin riesgo de inyección SQL.
      const filas = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM materiales
        WHERE lower(nombre) = lower(${nombre})
          AND (${excluirId ?? null}::uuid IS NULL OR id <> ${excluirId ?? null}::uuid)
        LIMIT 1`;
      return filas.length > 0;
    },

    crear: async (datos) =>
      escribirConControl(async () =>
        mapearMaterial(
          await prisma.material.create({
            data: {
              ...sinIndefinidos(datos),
              nombre: datos.nombre,
              unidad: datos.unidad,
              precioUnitario: datos.precioUnitario,
            },
            select: SELECCION,
          }),
        ),
      ),

    actualizar: async (id, datos) =>
      escribirConControl(async () =>
        mapearMaterial(
          await prisma.material.update({
            where: { id },
            data: sinIndefinidos(datos),
            select: SELECCION,
          }),
        ),
      ),
  };
}

import type { PrismaClient } from '../../shared/database/prisma.js';
import type { FotoGuardada } from './servicios.repository.js';

/**
 * Acceso a datos de las fotos de un servicio (RF-04). Cada operación que cambia el número o el
 * orden de las fotos se hace en una transacción que BLOQUEA la fila del servicio
 * (`SELECT … FOR UPDATE`): así dos subidas simultáneas no pueden superar el máximo ni dejar
 * órdenes repetidos, y el orden queda siempre 0..n-1 (0 = portada).
 */

export interface DatosFotoNueva {
  readonly clave: string;
  readonly url: string;
  readonly tipoMime: string;
  readonly tamanoBytes: number;
}

export type ResultadoAgregar =
  | { readonly ok: true; readonly foto: FotoGuardada }
  | { readonly ok: false; readonly motivo: 'no-existe' | 'limite' };

export type ResultadoOrdenar =
  | { readonly ok: true; readonly fotos: FotoGuardada[] }
  | { readonly ok: false; readonly motivo: 'no-existe' | 'no-coinciden' };

export type ResultadoEliminar =
  | { readonly ok: true; readonly borrada: FotoGuardada; readonly fotos: FotoGuardada[] }
  | { readonly ok: false; readonly motivo: 'no-existe' | 'foto-no-existe' };

export interface FotosRepository {
  contar(servicioId: string): Promise<number>;
  /** Añade la foto al final (orden = número de fotos) si no se supera `maximo`. */
  agregar(servicioId: string, datos: DatosFotoNueva, maximo: number): Promise<ResultadoAgregar>;
  /** `fotoIds` debe tener exactamente los ids de las fotos del servicio. */
  ordenar(servicioId: string, fotoIds: readonly string[]): Promise<ResultadoOrdenar>;
  /** Borra el registro y renumera las demás sin huecos. */
  eliminar(servicioId: string, fotoId: string): Promise<ResultadoEliminar>;
}

const SELECCION_FOTO = { id: true, clave: true, url: true, orden: true } as const;
const ORDEN = [{ orden: 'asc' as const }, { createdAt: 'asc' as const }];

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Bloquea la fila del servicio hasta el final de la transacción. ¿Existe? */
async function bloquearServicio(tx: Tx, servicioId: string): Promise<boolean> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM servicios WHERE id = ${servicioId}::uuid FOR UPDATE`;
  return filas.length > 0;
}

/** Escribe el orden 0..n-1 siguiendo `ids` y devuelve las fotos ordenadas. */
async function renumerar(tx: Tx, servicioId: string, ids: readonly string[]) {
  for (const [orden, id] of ids.entries()) {
    await tx.imagenServicio.update({ where: { id }, data: { orden } });
  }
  return tx.imagenServicio.findMany({
    where: { servicioId },
    select: SELECCION_FOTO,
    orderBy: ORDEN,
  });
}

export function crearFotosRepository(prisma: PrismaClient): FotosRepository {
  return {
    contar: (servicioId) => prisma.imagenServicio.count({ where: { servicioId } }),

    agregar: (servicioId, datos, maximo) =>
      prisma.$transaction(async (tx): Promise<ResultadoAgregar> => {
        if (!(await bloquearServicio(tx, servicioId))) {
          return { ok: false, motivo: 'no-existe' };
        }
        const total = await tx.imagenServicio.count({ where: { servicioId } });
        if (total >= maximo) {
          return { ok: false, motivo: 'limite' };
        }
        const foto = await tx.imagenServicio.create({
          data: { servicioId, ...datos, orden: total },
          select: SELECCION_FOTO,
        });
        return { ok: true, foto };
      }),

    ordenar: (servicioId, fotoIds) =>
      prisma.$transaction(async (tx): Promise<ResultadoOrdenar> => {
        if (!(await bloquearServicio(tx, servicioId))) {
          return { ok: false, motivo: 'no-existe' };
        }
        const actuales = await tx.imagenServicio.findMany({
          where: { servicioId },
          select: { id: true },
        });
        const ids = new Set(actuales.map((foto) => foto.id));
        if (ids.size !== fotoIds.length || !fotoIds.every((id) => ids.has(id))) {
          return { ok: false, motivo: 'no-coinciden' };
        }
        return { ok: true, fotos: await renumerar(tx, servicioId, fotoIds) };
      }),

    eliminar: (servicioId, fotoId) =>
      prisma.$transaction(async (tx): Promise<ResultadoEliminar> => {
        if (!(await bloquearServicio(tx, servicioId))) {
          return { ok: false, motivo: 'no-existe' };
        }
        const borrada = await tx.imagenServicio.findFirst({
          where: { id: fotoId, servicioId },
          select: SELECCION_FOTO,
        });
        if (!borrada) {
          return { ok: false, motivo: 'foto-no-existe' };
        }
        await tx.imagenServicio.delete({ where: { id: fotoId } });
        const restantes = await tx.imagenServicio.findMany({
          where: { servicioId },
          select: { id: true },
          orderBy: ORDEN,
        });
        return {
          ok: true,
          borrada,
          fotos: await renumerar(
            tx,
            servicioId,
            restantes.map((foto) => foto.id),
          ),
        };
      }),
  };
}

import type { HealthRepository } from './health.repository.js';

/**
 * Capa de servicio del módulo health (RNF-07, RNF-08): calcula el estado de la API y comprueba
 * la base de datos a través del repositorio. No conoce Express (`req`/`res`) ni Prisma, y recibe
 * el reloj y el registro de errores por parámetro para poder probarse de forma determinista.
 */

export interface InfoServicio {
  readonly servicio: string;
  readonly version: string;
  readonly entorno: string;
}

export interface Reloj {
  ahora(): Date;
  tiempoActividadSegundos(): number;
}

export type EstadoBaseDatos = 'ok' | 'error';

export interface EstadoSalud {
  /** `degradado` cuando alguna dependencia (por ahora, PostgreSQL) no responde. */
  estado: 'ok' | 'degradado';
  servicio: string;
  version: string;
  entorno: string;
  baseDatos: EstadoBaseDatos;
  /** Fecha y hora del servidor en ISO 8601. */
  marcaTiempo: string;
  tiempoActividadSegundos: number;
}

export interface OpcionesHealth {
  reloj?: Reloj;
  /** Tiempo máximo de espera de la comprobación de la base de datos. */
  tiempoLimiteMs?: number;
  /** Dónde se registra el motivo del fallo. Nunca se envía al cliente. */
  registrarError?: (mensaje: string) => void;
}

export const relojDelSistema: Reloj = {
  ahora: () => new Date(),
  tiempoActividadSegundos: () => process.uptime(),
};

export const TIEMPO_LIMITE_BD_MS = 3_000;

export interface HealthService {
  obtenerEstado(): Promise<EstadoSalud>;
}

/**
 * Resume un error para el registro del servidor. Con el adaptador PrismaPg el mensaje de Prisma
 * no trae el motivo ("Invalid `prisma.$queryRaw()` invocation:"), pero sí `code` (p. ej. ECONNREFUSED).
 */
export function describirError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const primeraLinea = error.message.split('\n').find((linea) => linea.trim() !== '') ?? '';
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === 'string' && codigo !== ''
    ? `[${codigo}] ${primeraLinea.trim()}`.trim()
    : primeraLinea.trim();
}

function registrarEnConsola(mensaje: string): void {
  console.error(`[health] La base de datos no responde: ${mensaje}`);
}

/** Rechaza si la promesa no termina a tiempo; limpia el temporizador en cualquier caso. */
async function conTiempoLimite(promesa: Promise<void>, ms: number): Promise<void> {
  let temporizador: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_resolver, rechazar) => {
    temporizador = setTimeout(() => {
      rechazar(new Error(`sin respuesta en ${ms} ms`));
    }, ms);
  });
  try {
    await Promise.race([promesa, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

export function crearHealthService(
  info: InfoServicio,
  repositorio: HealthRepository,
  opciones: OpcionesHealth = {},
): HealthService {
  const reloj = opciones.reloj ?? relojDelSistema;
  const tiempoLimiteMs = opciones.tiempoLimiteMs ?? TIEMPO_LIMITE_BD_MS;
  const registrarError = opciones.registrarError ?? registrarEnConsola;

  async function comprobarBaseDatos(): Promise<EstadoBaseDatos> {
    try {
      await conTiempoLimite(repositorio.comprobarBaseDatos(), tiempoLimiteMs);
      return 'ok';
    } catch (error) {
      registrarError(describirError(error));
      return 'error';
    }
  }

  return {
    obtenerEstado: async () => {
      const baseDatos = await comprobarBaseDatos();
      return {
        estado: baseDatos === 'ok' ? 'ok' : 'degradado',
        servicio: info.servicio,
        version: info.version,
        entorno: info.entorno,
        baseDatos,
        marcaTiempo: reloj.ahora().toISOString(),
        tiempoActividadSegundos: Math.floor(reloj.tiempoActividadSegundos()),
      };
    },
  };
}

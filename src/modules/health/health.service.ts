/**
 * Capa de servicio del módulo health (RNF-07): calcula el estado de la API.
 * No conoce Express (`req`/`res`) y recibe el reloj por parámetro para poder probarse de forma determinista.
 *
 * Punto de extensión (subfase 0.4): añadir `health.repository.ts` con una comprobación
 * de la base de datos (p. ej. `SELECT 1` con Prisma), inyectarlo aquí e incluir su resultado.
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

export interface EstadoSalud {
  estado: 'ok';
  servicio: string;
  version: string;
  entorno: string;
  /** Fecha y hora del servidor en ISO 8601. */
  marcaTiempo: string;
  tiempoActividadSegundos: number;
}

export const relojDelSistema: Reloj = {
  ahora: () => new Date(),
  tiempoActividadSegundos: () => process.uptime(),
};

export interface HealthService {
  obtenerEstado(): EstadoSalud;
}

export function crearHealthService(
  info: InfoServicio,
  reloj: Reloj = relojDelSistema,
): HealthService {
  return {
    obtenerEstado: () => ({
      estado: 'ok',
      servicio: info.servicio,
      version: info.version,
      entorno: info.entorno,
      marcaTiempo: reloj.ahora().toISOString(),
      tiempoActividadSegundos: Math.floor(reloj.tiempoActividadSegundos()),
    }),
  };
}

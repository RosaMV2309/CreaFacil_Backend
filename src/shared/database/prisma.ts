import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Acceso a PostgreSQL con Prisma 7 y el driver adapter `PrismaPg` (RNF-08).
 *
 * - En la aplicación se usa un único cliente: `obtenerPrisma()` lo crea la primera vez y
 *   `desconectarPrisma()` lo cierra al apagar el servidor (SIGINT/SIGTERM en `server.ts`).
 * - Las pruebas y el seed crean su propio cliente con `crearClientePrisma(url)` y lo cierran
 *   con `$disconnect()`; así cada prueba decide a qué base de datos se conecta.
 * - Crear el cliente no abre conexiones: la primera consulta lo hace.
 */

/** Tiempo máximo para abrir una conexión; sin él, `pg` esperaría indefinidamente. */
const TIEMPO_CONEXION_MS = 5_000;

export function crearClientePrisma(urlConexion: string): PrismaClient {
  const adaptador = new PrismaPg(
    { connectionString: urlConexion, connectionTimeoutMillis: TIEMPO_CONEXION_MS },
    {
      // Un error en una conexión inactiva del pool no debe tumbar el proceso.
      onPoolError: (error) => {
        console.error(`[base de datos] Error en el pool de conexiones: ${error.message}`);
      },
    },
  );
  return new PrismaClient({ adapter: adaptador });
}

let clienteCompartido: PrismaClient | undefined;

/** Devuelve el cliente único de la aplicación (lo crea la primera vez). */
export function obtenerPrisma(urlConexion: string): PrismaClient {
  clienteCompartido ??= crearClientePrisma(urlConexion);
  return clienteCompartido;
}

/** Cierra las conexiones del cliente único, si existe. */
export async function desconectarPrisma(): Promise<void> {
  const cliente = clienteCompartido;
  clienteCompartido = undefined;
  await cliente?.$disconnect();
}

export type { PrismaClient };

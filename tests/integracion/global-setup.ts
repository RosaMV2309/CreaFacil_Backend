import { execSync } from 'node:child_process';

import { config } from 'dotenv';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrlTest: string;
  }
}

/**
 * Prepara la base de datos de las pruebas de integración:
 * 1. Lee DATABASE_URL_TEST del entorno o de `.env.test` (ignorado por Git).
 * 2. Exige que el nombre de la BD termine en `_test`: las pruebas borran datos y así nunca
 *    se ejecutan por error contra la base de datos de desarrollo o producción.
 * 3. Aplica las migraciones versionadas con `prisma migrate deploy`.
 */
export default function prepararBaseDatosDePrueba(proyecto: TestProject): void {
  config({ path: '.env.test', quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  if (url === undefined || url === '') {
    throw new Error(
      'Falta DATABASE_URL_TEST para las pruebas de integración. ' +
        'Copia .env.test.example como .env.test y apunta a una base de datos creafacil_test.',
    );
  }

  const nombreBd = new URL(url).pathname.replace(/^\//, '');
  if (!nombreBd.endsWith('_test')) {
    throw new Error(
      `DATABASE_URL_TEST apunta a "${nombreBd}"; por seguridad debe ser una base de datos que termine en _test.`,
    );
  }

  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (error) {
    const salida = (error as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? '';
    throw new Error(`No se pudieron aplicar las migraciones en ${nombreBd}:\n${salida}`, {
      cause: error,
    });
  }

  proyecto.provide('databaseUrlTest', url);
}

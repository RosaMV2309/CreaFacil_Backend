import { defineConfig } from 'vitest/config';

/**
 * Dos proyectos de pruebas (`npm test` ejecuta ambos):
 * - unitarias: sin base de datos.
 * - integracion: contra la BD de pruebas (DATABASE_URL_TEST en .env.test). El globalSetup
 *   aplica las migraciones con `prisma migrate deploy` antes de empezar.
 */
export default defineConfig({
  test: {
    environment: 'node',
    /**
     * Cobertura (`npm run test:coverage`, RNF-07). Solo cuenta el código de `src/`:
     * - Se excluye `src/generated/` (cliente de Prisma generado) y `src/server.ts`
     *   (arranque con listen y señales del sistema; se comprueba con newman en la CI).
     * - Umbrales mínimos globales: si alguno no se alcanza, el comando falla (y la CI también).
     *   Líneas, sentencias y funciones 80 %; ramas 75 % (las ramas defensivas pesan más).
     */
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/server.ts', 'src/**/*.test.ts'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unitarias',
          include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['tests/integracion/**', 'node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integracion',
          include: ['tests/integracion/**/*.test.ts'],
          globalSetup: ['tests/integracion/global-setup.ts'],
          // Comparten la misma base de datos: un archivo detrás de otro.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});

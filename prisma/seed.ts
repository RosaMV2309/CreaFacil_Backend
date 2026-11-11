/**
 * Seed de CreaFácil: `npm run db:seed` (o `npx prisma db seed`).
 * Lee DATABASE_URL y ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_NOMBRE del entorno (.env) y carga
 * los datos base de forma idempotente. Nunca muestra la contraseña.
 */
import { cargarEnvSeed } from '../src/config/env.js';
import { crearClientePrisma } from '../src/shared/database/prisma.js';
import { sembrarDatosBase } from './seed-datos.js';

const env = cargarEnvSeed();
const prisma = crearClientePrisma(env.DATABASE_URL);

try {
  const resumen = await sembrarDatosBase(prisma, {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    nombre: env.ADMIN_NOMBRE,
  });
  console.info('Seed completado:');
  console.info(`  - Administradora: ${resumen.administradora.email}`);
  console.info(`  - Categorías base: ${resumen.categorias}`);
  console.info(`  - Materiales de ejemplo: ${resumen.materiales}`);
  console.info(
    `  - Configuración de precios vigente: ${resumen.configuracionPreciosId}` +
      (resumen.configuracionCreada ? ' (creada)' : ' (ya existía)'),
  );
} catch (error) {
  console.error('El seed falló:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

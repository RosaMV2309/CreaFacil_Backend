// Configuración de Prisma 7 (sustituye a la sección "prisma" de package.json).
import 'dotenv/config';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `npx prisma db seed` y `npm run db:seed` ejecutan este comando.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` no necesita conexión: si falta la variable (p. ej. en `npm install`
    // dentro de la CI) se usa una cadena vacía. migrate y db seed sí la exigen.
    url: process.env.DATABASE_URL ?? '',
  },
});

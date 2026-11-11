import 'dotenv/config';
import { z } from 'zod';

const urlBaseDatos = z
  .string({ error: 'DATABASE_URL es obligatoria' })
  .startsWith('postgresql://', 'DATABASE_URL debe ser una cadena de conexión de PostgreSQL');

const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: urlBaseDatos,
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET es obligatoria' })
    .min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5000')
    .transform((valor) => valor.split(',').map((origen) => origen.trim())),
});

/**
 * Variables que solo usa el seed (`npm run db:seed`) para crear la cuenta de la administradora.
 * El servidor de la API no las necesita, así que no se exigen al arrancarlo.
 */
const esquemaEnvSeed = z.object({
  DATABASE_URL: urlBaseDatos,
  ADMIN_EMAIL: z
    .string({ error: 'ADMIN_EMAIL es obligatoria' })
    .trim()
    .toLowerCase()
    .pipe(z.email('ADMIN_EMAIL debe ser un correo electrónico válido')),
  ADMIN_PASSWORD: z
    .string({ error: 'ADMIN_PASSWORD es obligatoria' })
    .min(8, 'ADMIN_PASSWORD debe tener al menos 8 caracteres')
    // bcrypt solo tiene en cuenta los primeros 72 bytes.
    .max(72, 'ADMIN_PASSWORD no puede superar 72 caracteres'),
  ADMIN_NOMBRE: z
    .string()
    .trim()
    .min(2, 'ADMIN_NOMBRE es demasiado corto')
    .max(120)
    .default('Administradora'),
});

export type Env = z.infer<typeof esquemaEnv>;
export type EnvSeed = z.infer<typeof esquemaEnvSeed>;

function validar<T extends z.ZodType>(esquema: T, fuente: NodeJS.ProcessEnv): z.infer<T> {
  const resultado = esquema.safeParse(fuente);
  if (!resultado.success) {
    const detalles = resultado.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida en las variables de entorno:\n${detalles}`);
  }
  return resultado.data;
}

export function cargarEnv(fuente: NodeJS.ProcessEnv = process.env): Env {
  return validar(esquemaEnv, fuente);
}

export function cargarEnvSeed(fuente: NodeJS.ProcessEnv = process.env): EnvSeed {
  return validar(esquemaEnvSeed, fuente);
}

import 'dotenv/config';
import { z } from 'zod';

const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL es obligatoria' })
    .startsWith('postgresql://', 'DATABASE_URL debe ser una cadena de conexión de PostgreSQL'),
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET es obligatoria' })
    .min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5000')
    .transform((valor) => valor.split(',').map((origen) => origen.trim())),
});

export type Env = z.infer<typeof esquemaEnv>;

export function cargarEnv(fuente: NodeJS.ProcessEnv = process.env): Env {
  const resultado = esquemaEnv.safeParse(fuente);
  if (!resultado.success) {
    const detalles = resultado.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida en las variables de entorno:\n${detalles}`);
  }
  return resultado.data;
}

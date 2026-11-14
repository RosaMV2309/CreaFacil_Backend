import 'dotenv/config';
import { z } from 'zod';

const urlBaseDatos = z
  .string({ error: 'DATABASE_URL es obligatoria' })
  .startsWith('postgresql://', 'DATABASE_URL debe ser una cadena de conexión de PostgreSQL');

/** Límite de intentos fallidos de inicio de sesión por defecto (decisión de la Fase 1). */
export const LOGIN_MAX_INTENTOS_POR_DEFECTO = 5;
/**
 * Con `NODE_ENV=test` y sin `LOGIN_MAX_INTENTOS` explícito, el límite sube para que las
 * pruebas automáticas (Vitest, newman) puedan repetirse sin quedar bloqueadas.
 */
export const LOGIN_MAX_INTENTOS_EN_PRUEBAS = 1000;

const esquemaEnv = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: urlBaseDatos,
    JWT_SECRET: z
      .string({ error: 'JWT_SECRET es obligatoria' })
      .min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
    /** Duración del token: número + unidad (s, m, h, d), p. ej. `8h`. Sin unidad = segundos. */
    JWT_EXPIRES_IN: z
      .string()
      .trim()
      .regex(
        /^[1-9]\d*[smhd]?$/,
        'JWT_EXPIRES_IN debe ser un número con unidad s, m, h o d (p. ej. 8h)',
      )
      .default('8h'),
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:5000')
      .transform((valor) => valor.split(',').map((origen) => origen.trim())),
    /** Intentos FALLIDOS de inicio de sesión permitidos por IP en cada ventana (RNF-01). */
    LOGIN_MAX_INTENTOS: z.coerce
      .number({ error: 'LOGIN_MAX_INTENTOS debe ser un número entero' })
      .int('LOGIN_MAX_INTENTOS debe ser un número entero')
      .min(1, 'LOGIN_MAX_INTENTOS debe ser al menos 1')
      .max(100_000, 'LOGIN_MAX_INTENTOS no puede superar 100000')
      .optional(),
    /** Duración de la ventana del límite de intentos, en minutos. */
    LOGIN_VENTANA_MINUTOS: z.coerce
      .number({ error: 'LOGIN_VENTANA_MINUTOS debe ser un número entero' })
      .int('LOGIN_VENTANA_MINUTOS debe ser un número entero')
      .min(1, 'LOGIN_VENTANA_MINUTOS debe ser al menos 1')
      .max(1440, 'LOGIN_VENTANA_MINUTOS no puede superar 1440 (un día)')
      .default(15),
  })
  .transform((env) => ({
    ...env,
    LOGIN_MAX_INTENTOS:
      env.LOGIN_MAX_INTENTOS ??
      (env.NODE_ENV === 'test' ? LOGIN_MAX_INTENTOS_EN_PRUEBAS : LOGIN_MAX_INTENTOS_POR_DEFECTO),
  }));

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

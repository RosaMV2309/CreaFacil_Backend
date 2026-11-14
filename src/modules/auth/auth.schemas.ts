import { z } from 'zod';

/**
 * Validación de entrada del módulo de autenticación (RF-01, RNF-04).
 * Se aplica en el servidor aunque las apps Flutter ya validen el formulario.
 */

/** bcrypt solo tiene en cuenta los primeros 72 BYTES de la contraseña (no caracteres). */
const MAX_BYTES_PASSWORD = 72;

const email = z
  .string({ error: 'El correo electrónico es obligatorio' })
  .trim()
  .toLowerCase()
  .max(254, 'El correo electrónico no puede superar 254 caracteres')
  .pipe(z.email('El correo electrónico no es válido'));

/**
 * Teléfono opcional. Formato aceptado: `+` opcional y de 7 a 15 dígitos (estándar E.164);
 * se permiten espacios, guiones y paréntesis, que se eliminan antes de guardarlo.
 * Ejemplos válidos: `0991234567`, `+593 99 123 4567`, `(04) 234-5678`.
 * Una cadena vacía o `null` equivalen a no enviarlo.
 */
const telefono = z.preprocess(
  (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor),
  z
    .string({ error: 'El teléfono debe ser texto' })
    .transform((valor) => valor.replace(/[\s\-()]/g, ''))
    .pipe(
      z
        .string()
        .regex(
          /^\+?\d{7,15}$/,
          'El teléfono debe tener de 7 a 15 dígitos (puede empezar por + y llevar espacios o guiones)',
        ),
    )
    .nullable()
    .optional(),
);

export const esquemasRegistro = {
  body: z.object({
    nombre: z
      .string({ error: 'El nombre es obligatorio' })
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(120, 'El nombre no puede superar 120 caracteres'),
    email,
    password: z
      .string({ error: 'La contraseña es obligatoria' })
      .min(8, 'La contraseña debe tener al menos 8 caracteres')
      .max(72, 'La contraseña no puede superar 72 caracteres')
      .refine(
        (valor) => Buffer.byteLength(valor, 'utf8') <= MAX_BYTES_PASSWORD,
        'La contraseña es demasiado larga: usa menos caracteres especiales (máximo 72 bytes)',
      ),
    telefono,
    /**
     * El registro público solo crea clientes (decisión de la Fase 1, RF-02). Si alguien envía
     * `rol` se rechaza con 400 en vez de ignorarlo en silencio, para que quede claro que no se
     * puede elegir. La cuenta de la administradora solo se crea con el seed.
     */
    rol: z
      .never({ error: 'No se puede elegir el rol: las cuentas nuevas siempre son de cliente' })
      .optional(),
  }),
};

export type DatosRegistro = z.output<typeof esquemasRegistro.body>;

import type { RequestHandler, Response } from 'express';
import { z } from 'zod';

import { AppError, type DetalleError } from '../errors/index.js';

// Mensajes de Zod en español para los errores que no definan uno propio.
z.config(z.locales.es());

/** Esquemas Zod opcionales para cada parte de la petición. */
export interface EsquemasValidacion {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/** Datos ya validados y transformados por Zod, con el tipo de cada esquema. */
export type DatosValidados<E extends EsquemasValidacion> = {
  [K in keyof E]: E[K] extends z.ZodType ? z.output<E[K]> : never;
};

type Ubicacion = keyof EsquemasValidacion;

const UBICACIONES: readonly Ubicacion[] = ['body', 'query', 'params'];

/** Clave interna de `res.locals` donde se guardan los datos validados. */
const CLAVE_LOCALS = 'datosValidados';

function rutaCampo(ruta: readonly PropertyKey[], ubicacion: Ubicacion): string {
  return ruta.length > 0 ? ruta.map(String).join('.') : ubicacion;
}

/**
 * Convierte un error de Zod en detalles `{ campo, ubicacion, mensaje }`.
 * Los objetos estrictos (`z.strictObject`) informan de TODOS los campos no permitidos en un único
 * error sin ruta; aquí se desglosa en un detalle por campo (`campo: "rol"`, `campo: "email"`…) para
 * que las apps puedan señalar cada uno.
 */
export function detallesDeIssue(issue: z.core.$ZodIssue, ubicacion: Ubicacion): DetalleError[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((clave) => ({
      campo: rutaCampo([...issue.path, clave], ubicacion),
      ubicacion,
      mensaje: issue.message,
    }));
  }
  return [{ campo: rutaCampo(issue.path, ubicacion), ubicacion, mensaje: issue.message }];
}

/**
 * Valida `body`, `query` y `params` con Zod (RNF-04).
 *
 * - Si todo es válido, guarda los datos parseados en `res.locals` y continúa.
 *   En Express 5 `req.query` es de solo lectura, por eso no se reescribe `req`:
 *   léelos con {@link datosValidados}.
 * - Si algo falla, responde 400 `VALIDACION` con `detalles: [{ campo, ubicacion, mensaje }]`
 *   reuniendo los errores de las tres partes.
 *
 * @example
 * const esquemas = {
 *   params: z.object({ id: z.coerce.number().int().positive() }),
 *   body: z.object({ nombre: z.string().trim().min(1, 'El nombre es obligatorio') }),
 * };
 * router.put('/:id', validate(esquemas), (_req, res) => {
 *   const { params, body } = datosValidados(res, esquemas); // tipados: { id: number }, { nombre: string }
 *   res.json(servicio.actualizar(params.id, body));
 * });
 */
export function validate(esquemas: EsquemasValidacion): RequestHandler {
  return (req, res, next) => {
    const entrada: Record<Ubicacion, unknown> = {
      body: req.body,
      query: req.query,
      params: req.params,
    };
    const validados: Partial<Record<Ubicacion, unknown>> = {};
    const detalles: DetalleError[] = [];

    for (const ubicacion of UBICACIONES) {
      const esquema = esquemas[ubicacion];
      if (!esquema) {
        continue;
      }
      const resultado = esquema.safeParse(entrada[ubicacion]);
      if (resultado.success) {
        validados[ubicacion] = resultado.data;
      } else {
        for (const issue of resultado.error.issues) {
          detalles.push(...detallesDeIssue(issue, ubicacion));
        }
      }
    }

    if (detalles.length > 0) {
      next(AppError.validacion(detalles));
      return;
    }
    res.locals[CLAVE_LOCALS] = validados;
    next();
  };
}

/**
 * Devuelve los datos validados por {@link validate}, tipados según los mismos esquemas.
 * Pasa el mismo objeto `esquemas` que usaste en `validate(esquemas)`.
 */
export function datosValidados<E extends EsquemasValidacion>(
  res: Response,
  _esquemas: E,
): DatosValidados<E> {
  const guardados: unknown = res.locals[CLAVE_LOCALS];
  if (typeof guardados !== 'object' || guardados === null) {
    throw new Error('datosValidados() se llamó en una ruta sin el middleware validate().');
  }
  return guardados as DatosValidados<E>;
}

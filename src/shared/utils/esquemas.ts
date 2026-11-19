import { z } from 'zod';

import { normalizarEspacios } from './consultas.js';

/**
 * Piezas Zod comunes de los formularios de la administradora (categorías, materiales…; RNF-04).
 */

/**
 * Texto obligatorio con los espacios normalizados («  Murales   grandes » → «Murales grandes») y
 * longitud entre `min` y `max`. `campo` es el sujeto del mensaje: «El nombre», «La unidad».
 */
export function textoNormalizado(campo: string, min: number, max: number) {
  return z
    .string({
      error: (issue) =>
        issue.input === undefined ? `${campo} es obligatorio` : `${campo} debe ser un texto`,
    })
    .transform(normalizarEspacios)
    .pipe(
      z
        .string()
        .min(min, `${campo} debe tener al menos ${min} caracter${min === 1 ? '' : 'es'}`)
        .max(max, `${campo} no puede superar ${max} caracteres`),
    );
}

/** Descripción opcional de hasta `max` caracteres; `null` o `""` la borran (se guarda `null`). */
export function descripcionOpcional(max: number) {
  return z
    .string({ error: 'La descripción debe ser un texto o null' })
    .trim()
    .max(max, `La descripción no puede superar ${max} caracteres`)
    .nullable()
    .transform((valor) => (valor === '' ? null : valor));
}

/**
 * Cuerpo JSON ESTRICTO: un campo desconocido (p. ej. `id`, `creadoEn`) es un 400 con un detalle por
 * campo (lo desglosa `validate`). Sin cuerpo se trata como `{}`, para responder con los campos que
 * faltan en vez de con un error genérico.
 */
export function cuerpoEstricto<Forma extends z.core.$ZodLooseShape>(
  forma: Forma,
  permitidos: string,
) {
  return z.strictObject(forma, {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `Este campo no está permitido: solo ${permitidos}`
        : 'El cuerpo debe ser un objeto JSON',
  });
}

/** Sin cuerpo (`undefined`) se valida como `{}`. */
export function conCuerpoPorDefecto<T extends z.ZodType>(esquema: T) {
  return z.preprocess((valor) => (valor === undefined ? {} : valor), esquema);
}

/** Para un PATCH: al menos un campo con valor. */
export function alMenosUnCampo(datos: Record<string, unknown>): boolean {
  return Object.values(datos).some((valor) => valor !== undefined);
}

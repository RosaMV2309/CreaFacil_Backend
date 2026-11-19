import { z } from 'zod';

import { booleanoDeQuery, esquemaBusqueda, esquemaParamsId } from '../../shared/utils/consultas.js';
import {
  alMenosUnCampo,
  conCuerpoPorDefecto,
  cuerpoEstricto,
  descripcionOpcional,
  textoNormalizado,
} from '../../shared/utils/esquemas.js';

/**
 * Validación de entrada de la gestión de categorías por la administradora (RF-22, RF-03, RNF-04).
 * Los cuerpos son ESTRICTOS: un campo desconocido (p. ej. `id`, `creadoEn`) es un 400.
 */

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 80;
export const DESCRIPCION_MAX = 500;
export const ORDEN_MAX = 9999;

const CAMPOS = 'nombre, descripcion, orden y activa';

const nombre = textoNormalizado('El nombre', NOMBRE_MIN, NOMBRE_MAX);
const descripcion = descripcionOpcional(DESCRIPCION_MAX);

const mensajeOrden = `El orden debe ser un número entero entre 0 y ${ORDEN_MAX}`;
const orden = z
  .number({ error: mensajeOrden })
  .int(mensajeOrden)
  .min(0, mensajeOrden)
  .max(ORDEN_MAX, mensajeOrden);

const activa = z.boolean({ error: 'activa debe ser true o false' });

/** `POST /admin/categorias` */
export const esquemasCrearCategoria = {
  body: conCuerpoPorDefecto(
    cuerpoEstricto(
      {
        nombre,
        descripcion: descripcion.optional(),
        orden: orden.optional(),
        activa: activa.optional(),
      },
      CAMPOS,
    ),
  ),
};

/** `PATCH /admin/categorias/:id`: cualquier subconjunto, al menos un campo. */
export const esquemasActualizarCategoria = {
  params: esquemaParamsId,
  body: conCuerpoPorDefecto(
    cuerpoEstricto(
      {
        nombre: nombre.optional(),
        descripcion: descripcion.optional(),
        orden: orden.optional(),
        activa: activa.optional(),
      },
      CAMPOS,
    ).refine(alMenosUnCampo, {
      message: 'Envía al menos un campo para actualizar: nombre, descripcion, orden o activa',
    }),
  ),
};

/** `GET /admin/categorias/:id` */
export const esquemasObtenerCategoria = { params: esquemaParamsId };

/**
 * `GET /admin/categorias?activa=true|false&q=texto`
 * Sin paginación: el negocio tiene pocas categorías y el panel las muestra todas.
 */
export const esquemasListarCategorias = {
  query: z.object({ activa: booleanoDeQuery('activa'), q: esquemaBusqueda }),
};

export type DatosCrearCategoria = z.output<typeof esquemasCrearCategoria.body>;
export type DatosActualizarCategoria = z.output<typeof esquemasActualizarCategoria.body>;
export type FiltroCategorias = z.output<typeof esquemasListarCategorias.query>;

import { z } from 'zod';

import {
  booleanoDeQuery,
  esquemaBusqueda,
  esquemaPaginacion,
  esquemaParamsId,
} from '../../shared/utils/consultas.js';
import {
  alMenosUnCampo,
  conCuerpoPorDefecto,
  cuerpoEstricto,
  descripcionOpcional,
  textoNormalizado,
} from '../../shared/utils/esquemas.js';
import { crearEsquemaPrecio, mensajesPrecio } from '../../shared/utils/precio.js';

/**
 * Validación de entrada de la gestión de materiales por la administradora (RF-22, RF-08, RNF-04).
 *
 * FORMATO DEL PRECIO (RF-07, RF-08): `precioUnitario` es un importe exacto en dólares.
 * - Se ACEPTA como número JSON (`0.75`) o como texto (`"0.75"`), con como máximo 2 decimales,
 *   punto decimal, mayor que 0 y hasta {@link PRECIO_MAXIMO}.
 * - NUNCA se redondea en silencio: `0.1 + 0.2` calculado en JavaScript llega como
 *   `0.30000000000000004` y se rechaza (400) en vez de guardarse como 0.30.
 * - Se valida y normaliza como TEXTO (sin pasar por float) y se guarda en `Decimal(12, 2)`.
 * - Se DEVUELVE siempre como texto con 2 decimales (`"0.75"`, `"12.50"`).
 */

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 80;
export const UNIDAD_MAX = 30;
export const DESCRIPCION_MAX = 500;
export { normalizarPrecio, PRECIO_MAXIMO } from '../../shared/utils/precio.js';

const MENSAJES_PRECIO = mensajesPrecio('El precio unitario');
export const MENSAJE_PRECIO_FORMATO = MENSAJES_PRECIO.formato;
export const MENSAJE_PRECIO_CERO = MENSAJES_PRECIO.cero;

/** `precioUnitario`: número o texto → texto normalizado «x.xx» (ver `shared/utils/precio.ts`). */
export const esquemaPrecio = crearEsquemaPrecio('El precio unitario');

const CAMPOS = 'nombre, unidad, precioUnitario, descripcion y activo';

const nombre = textoNormalizado('El nombre', NOMBRE_MIN, NOMBRE_MAX);
/** Unidad de medida o de compra: «plancha», «litro», «unidad», «m²»… */
const unidad = textoNormalizado('La unidad', 1, UNIDAD_MAX);
const descripcion = descripcionOpcional(DESCRIPCION_MAX);
const activo = z.boolean({ error: 'activo debe ser true o false' });

/** `POST /admin/materiales` */
export const esquemasCrearMaterial = {
  body: conCuerpoPorDefecto(
    cuerpoEstricto(
      {
        nombre,
        unidad,
        precioUnitario: esquemaPrecio,
        descripcion: descripcion.optional(),
        activo: activo.optional(),
      },
      CAMPOS,
    ),
  ),
};

/** `PATCH /admin/materiales/:id`: cualquier subconjunto, al menos un campo. */
export const esquemasActualizarMaterial = {
  params: esquemaParamsId,
  body: conCuerpoPorDefecto(
    cuerpoEstricto(
      {
        nombre: nombre.optional(),
        unidad: unidad.optional(),
        precioUnitario: esquemaPrecio.optional(),
        descripcion: descripcion.optional(),
        activo: activo.optional(),
      },
      CAMPOS,
    ).refine(alMenosUnCampo, {
      message:
        'Envía al menos un campo para actualizar: nombre, unidad, precioUnitario, descripcion o activo',
    }),
  ),
};

/** `GET /admin/materiales/:id` */
export const esquemasObtenerMaterial = { params: esquemaParamsId };

/** `GET /admin/materiales?pagina=1&porPagina=20&q=texto&activo=true|false` */
export const esquemasListarMateriales = {
  query: z.object({ ...esquemaPaginacion, q: esquemaBusqueda, activo: booleanoDeQuery('activo') }),
};

export type DatosCrearMaterial = z.output<typeof esquemasCrearMaterial.body>;
export type DatosActualizarMaterial = z.output<typeof esquemasActualizarMaterial.body>;
export type FiltroMateriales = z.output<typeof esquemasListarMateriales.query>;

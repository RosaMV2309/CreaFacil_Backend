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
export const PRECIO_MAXIMO = '99999.99';

/** Hasta 5 cifras enteras y 2 decimales, con punto: el máximo implícito es 99999.99. */
const FORMATO_PRECIO = /^\d{1,5}(\.\d{1,2})?$/;

export const MENSAJE_PRECIO_FORMATO =
  `El precio unitario debe ser un número positivo con hasta 2 decimales y como máximo ${PRECIO_MAXIMO} ` +
  '(usa punto decimal, por ejemplo 0.75 o "0.75")';
export const MENSAJE_PRECIO_CERO = 'El precio unitario debe ser mayor que 0';

/**
 * Normaliza un precio YA validado a texto con 2 decimales, solo con operaciones de texto
 * (sin float): «7» → «7.00», «0.5» → «0.50», «007.25» → «7.25». Función pura.
 */
export function normalizarPrecio(texto: string): string {
  const [entera = '0', decimales = ''] = texto.split('.');
  const sinCeros = entera.replace(/^0+(?=\d)/, '');
  return `${sinCeros}.${decimales.padEnd(2, '0')}`;
}

/** `precioUnitario`: número o texto → texto normalizado «x.xx». */
export const esquemaPrecio = z
  .union([z.number(), z.string()], {
    error: (issue) =>
      issue.input === undefined
        ? 'El precio unitario es obligatorio'
        : 'El precio unitario debe ser un número o un texto como "0.75"',
  })
  .transform((valor, ctx) => {
    // String(número) da la representación más corta que identifica al número en JavaScript:
    // 0.75 → "0.75", pero 0.1 + 0.2 → "0.30000000000000004" y 1e21 → "1e+21" (ambos se rechazan).
    const texto = typeof valor === 'number' ? String(valor) : valor.trim();
    if (!FORMATO_PRECIO.test(texto)) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_PRECIO_FORMATO });
      return z.NEVER;
    }
    if (!/[1-9]/.test(texto)) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_PRECIO_CERO });
      return z.NEVER;
    }
    return normalizarPrecio(texto);
  });

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

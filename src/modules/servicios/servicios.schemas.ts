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
  textoNormalizado,
} from '../../shared/utils/esquemas.js';
import { crearEsquemaPrecio } from '../../shared/utils/precio.js';

/**
 * Validación de entrada de la gestión de servicios del catálogo (RF-22, RF-04, RF-05; RNF-04).
 * Cuerpos ESTRICTOS: un campo desconocido es un 400 con un detalle por campo.
 */

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 120;
export const DESCRIPCION_MAX = 2000;
/** Igual que la columna `dimensiones_orientativas VARCHAR(200)`. */
export const DIMENSIONES_MAX = 200;
export const OBSERVACIONES_MAX = 1000;
export const MAX_MATERIALES = 50;
/** Máximo de fotos por servicio (decisión de la Fase 2). */
export const MAX_FOTOS = 8;

/** Texto opcional: `null` o `""` lo borran (se guarda `null`). */
function textoOpcional(campo: string, max: number) {
  return z
    .string({ error: `${campo} debe ser un texto o null` })
    .trim()
    .max(max, `${campo} no puede superar ${max} caracteres`)
    .nullable()
    .transform((valor) => (valor === '' ? null : valor));
}

function listaSinRepetidos(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

const CAMPOS =
  'categoriaId, nombre, descripcion, dimensionesOrientativas, observaciones, ' +
  'precioBaseReferencial, materialIds y activo';

const categoriaId = z.uuid({
  error: (issue) =>
    issue.input === undefined
      ? 'La categoría es obligatoria (categoriaId)'
      : 'categoriaId debe ser un UUID válido',
});
const nombre = textoNormalizado('El nombre', NOMBRE_MIN, NOMBRE_MAX);
const descripcion = textoOpcional('La descripción', DESCRIPCION_MAX);
const dimensionesOrientativas = textoOpcional('Las dimensiones orientativas', DIMENSIONES_MAX);
const observaciones = textoOpcional('Las observaciones', OBSERVACIONES_MAX);
/** Opcional; `null` lo quita. Mismo formato exacto que el precio de los materiales. */
const precioBaseReferencial = crearEsquemaPrecio('El precio base referencial').nullable();
/** Materiales habituales (RF-04): REEMPLAZA la lista completa. `[]` la vacía. */
const materialIds = z
  .array(z.uuid({ error: 'Cada id de materialIds debe ser un UUID válido' }), {
    error: 'materialIds debe ser una lista de ids de materiales',
  })
  .max(MAX_MATERIALES, `materialIds no puede tener más de ${MAX_MATERIALES} materiales`)
  .refine(listaSinRepetidos, 'materialIds no puede repetir materiales');
const activo = z.boolean({ error: 'activo debe ser true o false' });

/** `POST /admin/servicios` */
export const esquemasCrearServicio = {
  body: conCuerpoPorDefecto(
    cuerpoEstricto(
      {
        categoriaId,
        nombre,
        descripcion: descripcion.optional(),
        dimensionesOrientativas: dimensionesOrientativas.optional(),
        observaciones: observaciones.optional(),
        precioBaseReferencial: precioBaseReferencial.optional(),
        materialIds: materialIds.optional(),
        activo: activo.optional(),
      },
      CAMPOS,
    ),
  ),
};

/** `PATCH /admin/servicios/:id`: cualquier subconjunto, al menos un campo. */
export const esquemasActualizarServicio = {
  params: esquemaParamsId,
  body: conCuerpoPorDefecto(
    cuerpoEstricto(
      {
        categoriaId: categoriaId.optional(),
        nombre: nombre.optional(),
        descripcion: descripcion.optional(),
        dimensionesOrientativas: dimensionesOrientativas.optional(),
        observaciones: observaciones.optional(),
        precioBaseReferencial: precioBaseReferencial.optional(),
        materialIds: materialIds.optional(),
        activo: activo.optional(),
      },
      CAMPOS,
    ).refine(alMenosUnCampo, { message: `Envía al menos un campo para actualizar: ${CAMPOS}` }),
  ),
};

/** `GET /admin/servicios/:id` */
export const esquemasObtenerServicio = { params: esquemaParamsId };

/** `GET /admin/servicios?pagina&porPagina&q&categoriaId&activo` */
export const esquemasListarServicios = {
  query: z.object({
    ...esquemaPaginacion,
    q: esquemaBusqueda,
    categoriaId: z.uuid({ error: 'categoriaId debe ser un UUID válido' }).optional(),
    activo: booleanoDeQuery('activo'),
  }),
};

/** `POST /admin/servicios/:id/fotos` (el archivo lo lee multer; aquí solo el id). */
export const esquemasSubirFoto = { params: esquemaParamsId };

/** `PATCH /admin/servicios/:id/fotos/orden` con TODOS los ids de las fotos, en el orden nuevo. */
export const esquemasOrdenarFotos = {
  params: esquemaParamsId,
  body: conCuerpoPorDefecto(
    cuerpoEstricto(
      {
        fotoIds: z
          .array(z.uuid({ error: 'Cada id de fotoIds debe ser un UUID válido' }), {
            error: (issue) =>
              issue.input === undefined
                ? 'fotoIds es obligatorio: la lista de ids de las fotos en el orden nuevo'
                : 'fotoIds debe ser una lista de ids de fotos',
          })
          .min(1, 'fotoIds debe tener al menos una foto')
          .max(MAX_FOTOS, `fotoIds no puede tener más de ${MAX_FOTOS} fotos`)
          .refine(listaSinRepetidos, 'fotoIds no puede repetir fotos'),
      },
      'fotoIds',
    ),
  ),
};

/** `DELETE /admin/servicios/:id/fotos/:fotoId` */
export const esquemasBorrarFoto = {
  params: z.object({
    id: esquemaParamsId.shape.id,
    fotoId: z.uuid({ error: 'El id de la foto debe ser un UUID válido' }),
  }),
};

export type DatosCrearServicio = z.output<typeof esquemasCrearServicio.body>;
export type DatosActualizarServicio = z.output<typeof esquemasActualizarServicio.body>;
export type FiltroServicios = z.output<typeof esquemasListarServicios.query>;

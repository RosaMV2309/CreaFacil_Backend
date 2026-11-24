import { z } from 'zod';

import { esquemaBusqueda, esquemaParamsId } from '../../shared/utils/consultas.js';

/**
 * Validación de entrada del catálogo PÚBLICO (RF-03, RF-04, RNF-04).
 * La query no es estricta (un parámetro desconocido se ignora, como en el resto de listados).
 */

/** `GET /catalogo?q=texto&categoriaId=uuid` */
export const esquemasCatalogo = {
  query: z.object({
    q: esquemaBusqueda,
    categoriaId: z.uuid({ error: 'categoriaId debe ser un UUID válido' }).optional(),
  }),
};

/** `GET /catalogo/servicios/:id` */
export const esquemasFichaPublica = { params: esquemaParamsId };

export type FiltroCatalogo = z.output<typeof esquemasCatalogo.query>;

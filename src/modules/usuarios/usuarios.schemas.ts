import { z } from 'zod';

import { esquemaBusqueda, esquemaPaginacion } from '../../shared/utils/consultas.js';

/**
 * Validación de entrada del módulo de usuarios (RF-02, RNF-04).
 */

export { POR_PAGINA_DEFECTO, POR_PAGINA_MAXIMO } from '../../shared/utils/consultas.js';

/**
 * `GET /admin/clientes?pagina=1&porPagina=20&q=ana`
 * - `pagina`: desde 1 (por defecto 1). Una página sin resultados devuelve `datos: []`.
 * - `porPagina`: de 1 a 100 (por defecto 20).
 * - `q` (opcional): texto que se busca en el nombre o el correo, sin distinguir mayúsculas
 *   (hasta 100 caracteres; vacío = sin filtro).
 * Otros parámetros de la query se ignoran.
 */
export const esquemasListarClientes = {
  query: z.object({ ...esquemaPaginacion, q: esquemaBusqueda }),
};

export type FiltroClientes = z.output<typeof esquemasListarClientes.query>;

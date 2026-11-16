import { z } from 'zod';

/**
 * Validación de entrada del módulo de usuarios (RF-02, RNF-04).
 */

/** Tamaño de página por defecto y máximo de los listados de la administradora. */
export const POR_PAGINA_DEFECTO = 20;
export const POR_PAGINA_MAXIMO = 100;

/**
 * Entero positivo que llega como texto en la query (`?pagina=2`). Se rechazan vacíos, decimales,
 * letras y parámetros repetidos (`?pagina=1&pagina=2` llega como lista y no es un número).
 */
function enteroDeQuery(nombre: string, maximo?: number) {
  const mensaje = `${nombre} debe ser un número entero${maximo ? ` entre 1 y ${maximo}` : ' mayor o igual que 1'}`;
  const base = z.coerce.number({ error: mensaje }).int(mensaje).min(1, mensaje);
  return z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? Number.NaN : valor),
    maximo ? base.max(maximo, mensaje) : base,
  );
}

/**
 * `GET /admin/clientes?pagina=1&porPagina=20&q=ana`
 * - `pagina`: desde 1 (por defecto 1). Una página sin resultados devuelve `datos: []`.
 * - `porPagina`: de 1 a 100 (por defecto 20).
 * - `q` (opcional): texto que se busca en el nombre o el correo, sin distinguir mayúsculas
 *   (hasta 100 caracteres; vacío = sin filtro).
 * Otros parámetros de la query se ignoran.
 */
export const esquemasListarClientes = {
  query: z.object({
    pagina: enteroDeQuery('La página').default(1),
    porPagina: enteroDeQuery('porPagina', POR_PAGINA_MAXIMO).default(POR_PAGINA_DEFECTO),
    q: z
      .string({ error: 'La búsqueda debe ser un único texto' })
      .trim()
      .max(100, 'La búsqueda no puede superar 100 caracteres')
      .optional()
      .transform((valor) => (valor === '' ? undefined : valor)),
  }),
};

export type FiltroClientes = z.output<typeof esquemasListarClientes.query>;

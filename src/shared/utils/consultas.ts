import { z } from 'zod';

/**
 * Utilidades comunes de los listados y de la validación de la API (RNF-04, RNF-07).
 * Las comparten los módulos de la administradora (clientes, categorías, materiales…).
 */

/** Tamaño de página por defecto y máximo de los listados de la administradora. */
export const POR_PAGINA_DEFECTO = 20;
export const POR_PAGINA_MAXIMO = 100;

export interface Paginacion {
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
  /** `0` si no hay resultados. */
  readonly totalPaginas: number;
}

/** Forma común de los listados paginados de la API: `{ datos, paginacion }`. */
export interface Paginado<T> {
  readonly datos: T[];
  readonly paginacion: Paginacion;
}

/** Calcula la paginación a partir del total (función pura). */
export function calcularPaginacion(pagina: number, porPagina: number, total: number): Paginacion {
  return { pagina, porPagina, total, totalPaginas: Math.ceil(total / porPagina) };
}

/**
 * Escapa los comodines de LIKE (`%`, `_`) y la barra invertida: Prisma NO los escapa en `contains`,
 * así que sin esto `?q=%` coincidiría con todo. PostgreSQL usa `\` como escape por defecto.
 */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/**
 * Entero positivo que llega como texto en la query (`?pagina=2`). Se rechazan vacíos, decimales,
 * letras y parámetros repetidos (`?pagina=1&pagina=2` llega como lista y no es un número).
 */
export function enteroDeQuery(nombre: string, maximo?: number) {
  const mensaje = `${nombre} debe ser un número entero${maximo ? ` entre 1 y ${maximo}` : ' mayor o igual que 1'}`;
  const base = z.coerce.number({ error: mensaje }).int(mensaje).min(1, mensaje);
  return z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? Number.NaN : valor),
    maximo ? base.max(maximo, mensaje) : base,
  );
}

/** Parámetros de paginación comunes: `pagina` (por defecto 1) y `porPagina` (1–100, por defecto 20). */
export const esquemaPaginacion = {
  pagina: enteroDeQuery('La página').default(1),
  porPagina: enteroDeQuery('porPagina', POR_PAGINA_MAXIMO).default(POR_PAGINA_DEFECTO),
};

/** `?q=`: texto de búsqueda opcional (hasta 100 caracteres; vacío = sin filtro). */
export const esquemaBusqueda = z
  .string({ error: 'La búsqueda debe ser un único texto' })
  .trim()
  .max(100, 'La búsqueda no puede superar 100 caracteres')
  .optional()
  .transform((valor) => (valor === '' ? undefined : valor));

/** Booleano de la query: solo `true` o `false` (`?activa=true`). Cualquier otro valor es un 400. */
export function booleanoDeQuery(nombre: string) {
  return z
    .enum(['true', 'false'], { error: `${nombre} debe ser true o false` })
    .optional()
    .transform((valor) => (valor === undefined ? undefined : valor === 'true'));
}

/** `/:id` con un UUID; si no lo es, 400 VALIDACION (en vez de llegar a la base de datos). */
export const esquemaParamsId = z.object({
  id: z.uuid({ error: 'El id debe ser un UUID válido' }),
});

/** Recorta los extremos y reduce los espacios repetidos a uno: «  Murales   grandes » → «Murales grandes». */
export function normalizarEspacios(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

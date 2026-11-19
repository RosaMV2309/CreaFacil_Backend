/**
 * Traducción de los errores conocidos de Prisma a resultados que entienden los servicios (RNF-07).
 * Así los servicios no conocen los códigos de Prisma y los repositorios no conocen HTTP.
 */

/** Resultado de una escritura que puede chocar con una restricción de la base de datos. */
export type ResultadoEscritura<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly motivo: 'duplicado' | 'no-existe' };

function codigoPrisma(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * Ejecuta una escritura y convierte los errores esperados:
 * - `P2002` (viola un índice único) → `{ ok: false, motivo: 'duplicado' }`.
 * - `P2025` (el registro a actualizar no existe) → `{ ok: false, motivo: 'no-existe' }`.
 * Cualquier otro error se relanza (acabará en un 500 sin detalles internos).
 */
export async function escribirConControl<T>(
  escritura: () => Promise<T>,
): Promise<ResultadoEscritura<T>> {
  try {
    return { ok: true, valor: await escritura() };
  } catch (error) {
    const codigo = codigoPrisma(error);
    if (codigo === 'P2002') {
      return { ok: false, motivo: 'duplicado' };
    }
    if (codigo === 'P2025') {
      return { ok: false, motivo: 'no-existe' };
    }
    throw error;
  }
}

/** Objeto sin las claves cuyo valor es `undefined` (Prisma las ignora; TypeScript estricto no). */
export type SinIndefinidos<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

export function sinIndefinidos<T extends object>(objeto: T): SinIndefinidos<T> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, valor]) => valor !== undefined),
  ) as SinIndefinidos<T>;
}

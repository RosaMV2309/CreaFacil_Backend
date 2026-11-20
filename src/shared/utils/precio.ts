import { z } from 'zod';

/**
 * Importes exactos en dólares (RF-07, RF-08; formato acordado en la Fase 2 · 2.1).
 * - Se ACEPTAN como número JSON (`0.75`) o texto (`"0.75"`), con como máximo 2 decimales, punto
 *   decimal, mayores que 0 y hasta {@link PRECIO_MAXIMO}.
 * - NUNCA se redondean en silencio: `0.1 + 0.2` de JavaScript (`0.30000000000000004`) es un 400.
 * - Se validan y normalizan como TEXTO (sin float) y se guardan en `Decimal(12, 2)`.
 * - Se DEVUELVEN siempre como texto con 2 decimales (`"0.75"`, `"12.50"`).
 */

export const PRECIO_MAXIMO = '99999.99';

/** Hasta 5 cifras enteras y 2 decimales, con punto: el máximo implícito es 99999.99. */
const FORMATO_PRECIO = /^\d{1,5}(\.\d{1,2})?$/;

/** Mensajes de un importe; `campo` es el sujeto: «El precio unitario», «El precio base referencial». */
export function mensajesPrecio(campo: string) {
  return {
    formato:
      `${campo} debe ser un número positivo con hasta 2 decimales y como máximo ${PRECIO_MAXIMO} ` +
      '(usa punto decimal, por ejemplo 0.75 o "0.75")',
    cero: `${campo} debe ser mayor que 0`,
    obligatorio: `${campo} es obligatorio`,
    tipo: `${campo} debe ser un número o un texto como "0.75"`,
  };
}

/**
 * Normaliza un precio YA validado a texto con 2 decimales, solo con operaciones de texto
 * (sin float): «7» → «7.00», «0.5» → «0.50», «007.25» → «7.25». Función pura.
 */
export function normalizarPrecio(texto: string): string {
  const [entera = '0', decimales = ''] = texto.split('.');
  const sinCeros = entera.replace(/^0+(?=\d)/, '');
  return `${sinCeros}.${decimales.padEnd(2, '0')}`;
}

/** Importe: número o texto → texto normalizado «x.xx». */
export function crearEsquemaPrecio(campo: string) {
  const mensajes = mensajesPrecio(campo);
  return z
    .union([z.number(), z.string()], {
      error: (issue) => (issue.input === undefined ? mensajes.obligatorio : mensajes.tipo),
    })
    .transform((valor, ctx) => {
      // String(número) da la representación más corta que identifica al número en JavaScript:
      // 0.75 → "0.75", pero 0.1 + 0.2 → "0.30000000000000004" y 1e21 → "1e+21" (ambos se rechazan).
      const texto = typeof valor === 'number' ? String(valor) : valor.trim();
      if (!FORMATO_PRECIO.test(texto)) {
        ctx.addIssue({ code: 'custom', message: mensajes.formato });
        return z.NEVER;
      }
      if (!/[1-9]/.test(texto)) {
        ctx.addIssue({ code: 'custom', message: mensajes.cero });
        return z.NEVER;
      }
      return normalizarPrecio(texto);
    });
}

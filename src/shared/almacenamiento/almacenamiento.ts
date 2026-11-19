import type { RequestHandler } from 'express';

/**
 * Almacenamiento de archivos de la API (fotos del catálogo, RF-04) detrás de una INTERFAZ
 * INTERCAMBIABLE (decisión de la Fase 2).
 *
 * Los servicios de negocio solo conocen esta interfaz: guardan bytes, borran por clave y piden la
 * URL pública. La implementación por defecto es el disco local ({@link crearAlmacenamientoDisco});
 * se inyecta en `crearApp` (`DependenciasApp.almacenamiento`).
 *
 * CÓMO AÑADIR OTRA IMPLEMENTACIÓN (Cloudinary, Firebase Storage, S3…):
 * 1. Crea `src/shared/almacenamiento/<proveedor>.ts` con una función que devuelva un
 *    `AlmacenamientoArchivos`:
 *    - `guardar`: sube los bytes con el nombre `clave` que recibe (ya es aleatorio y seguro).
 *    - `eliminar`: borra por clave; si no existe, NO falla (idempotente).
 *    - `urlPublica`: devuelve la URL ABSOLUTA del proveedor (p. ej. la del CDN).
 *    - `manejadorPublico`: no lo definas (el proveedor sirve los archivos, no la API).
 * 2. Elige la implementación en `src/server.ts` (p. ej. según una variable `ALMACENAMIENTO=cloudinary`)
 *    y pásala a `crearApp(env, { prisma, almacenamiento })`.
 * Las apps no cambian: la API siempre devuelve `url` absoluta en cada foto.
 */

/** Tipos de imagen admitidos (por su CONTENIDO real). */
export type TipoImagen = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImagenDetectada {
  readonly tipoMime: TipoImagen;
  /** Extensión según el tipo DETECTADO (nunca la del nombre que envía el cliente). */
  readonly extension: 'jpg' | 'png' | 'webp';
}

export interface ArchivoAGuardar {
  /** Nombre interno aleatorio y validado (ver {@link generarClave}). */
  readonly clave: string;
  readonly contenido: Buffer;
  readonly tipoMime: TipoImagen;
}

export interface AlmacenamientoArchivos {
  /** Guarda el archivo con esa clave. */
  guardar(archivo: ArchivoAGuardar): Promise<void>;
  /** Borra el archivo. Idempotente: si no existe, no falla. */
  eliminar(clave: string): Promise<void>;
  /** URL pública y ABSOLUTA del archivo (la que reciben las apps). */
  urlPublica(clave: string): string;
  /**
   * Solo para los almacenamientos que sirven los archivos desde la propia API (disco local):
   * manejador que `crearApp` monta, SIN autenticación, en {@link RUTA_PUBLICA_ARCHIVOS}.
   */
  readonly manejadorPublico?: RequestHandler;
}

/** Ruta pública (fuera de /api/v1) desde la que la API sirve los archivos guardados en disco. */
export const RUTA_PUBLICA_ARCHIVOS = '/uploads';

/** Tamaño máximo de una foto: 5 MB (decisión de la Fase 2). */
export const TAMANO_MAXIMO_FOTO = 5 * 1024 * 1024;

/**
 * Formato de las claves: UUID v4 en minúsculas + extensión del tipo detectado. Se usa para generar
 * Y para validar (antes de tocar el disco o de servir un archivo): así no hay path traversal posible.
 */
export const FORMATO_CLAVE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function esClaveValida(clave: string): boolean {
  return FORMATO_CLAVE.test(clave);
}

/** Nombre aleatorio para un archivo nuevo: `<uuid>.<extensión detectada>`. */
export function generarClave(imagen: ImagenDetectada, uuid: () => string): string {
  const clave = `${uuid().toLowerCase()}.${imagen.extension}`;
  if (!esClaveValida(clave)) {
    throw new Error('El generador de nombres devolvió un identificador no válido.');
  }
  return clave;
}

const FIRMA_JPEG = [0xff, 0xd8, 0xff];
const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function empiezaCon(contenido: Uint8Array, firma: readonly number[], desde = 0): boolean {
  return (
    contenido.length >= desde + firma.length &&
    firma.every((byte, i) => contenido[desde + i] === byte)
  );
}

/**
 * Detecta el tipo de imagen por su FIRMA («magic bytes»), no por la extensión ni por el
 * Content-Type que envía el cliente. Función pura.
 * - JPEG: FF D8 FF
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 * - WebP: «RIFF» + 4 bytes de tamaño + «WEBP»
 * Devuelve `null` si no es ninguno de los tres.
 */
export function detectarTipoImagen(contenido: Uint8Array): ImagenDetectada | null {
  if (empiezaCon(contenido, FIRMA_JPEG)) {
    return { tipoMime: 'image/jpeg', extension: 'jpg' };
  }
  if (empiezaCon(contenido, FIRMA_PNG)) {
    return { tipoMime: 'image/png', extension: 'png' };
  }
  if (empiezaCon(contenido, RIFF) && empiezaCon(contenido, WEBP, 8)) {
    return { tipoMime: 'image/webp', extension: 'webp' };
  }
  return null;
}

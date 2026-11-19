import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import express, { type RequestHandler, Router } from 'express';

import {
  type AlmacenamientoArchivos,
  esClaveValida,
  RUTA_PUBLICA_ARCHIVOS,
} from './almacenamiento.js';

/**
 * Implementación del almacenamiento en el DISCO del servidor (decisión de la Fase 2).
 * - Guarda en `carpeta` (UPLOADS_DIR, en .gitignore) con el nombre aleatorio que recibe.
 * - Toda clave se valida con {@link esClaveValida} y la ruta resultante se comprueba dentro de la
 *   carpeta: nunca se escribe, borra ni sirve nada fuera de ella (sin path traversal).
 * - Sirve los archivos en `/uploads/<clave>` sin autenticación (el catálogo es público).
 */

export interface OpcionesAlmacenamientoDisco {
  /** Carpeta (relativa a la de arranque o absoluta). */
  readonly carpeta: string;
  /** Origen público de la API, sin barra final: `http://localhost:3000`. */
  readonly urlBase: string;
}

export interface AlmacenamientoDisco extends AlmacenamientoArchivos {
  /** Ruta absoluta de la carpeta. */
  readonly carpeta: string;
  readonly manejadorPublico: RequestHandler;
}

/** Caché de las fotos: sus nombres son aleatorios y su contenido nunca cambia (1 día). */
export const CACHE_FOTOS_MS = 86_400_000;

export function crearAlmacenamientoDisco({
  carpeta,
  urlBase,
}: OpcionesAlmacenamientoDisco): AlmacenamientoDisco {
  const raiz = resolve(carpeta);

  function rutaSegura(clave: string): string {
    if (!esClaveValida(clave)) {
      throw new Error('Clave de archivo no válida.');
    }
    const ruta = resolve(raiz, clave);
    // Defensa en profundidad: la clave ya no admite «/», «\» ni «..».
    if (!ruta.startsWith(raiz + sep)) {
      throw new Error('Clave de archivo fuera de la carpeta de subidas.');
    }
    return ruta;
  }

  return {
    carpeta: raiz,

    guardar: async ({ clave, contenido }) => {
      const ruta = rutaSegura(clave);
      await mkdir(raiz, { recursive: true });
      // 'wx': falla si ya existe (nunca sobrescribe otra foto).
      await writeFile(ruta, contenido, { flag: 'wx' });
    },

    eliminar: async (clave) => {
      await rm(rutaSegura(clave), { force: true });
    },

    urlPublica: (clave) => `${urlBase}${RUTA_PUBLICA_ARCHIVOS}/${encodeURIComponent(clave)}`,

    manejadorPublico: crearManejadorPublico(raiz),
  };
}

/**
 * GET de las fotos guardadas en disco, SIN autenticación (catálogo público, RF-03/RF-04).
 * - Solo nombres con el formato de las claves: cualquier otro (directorios, «..», archivos ocultos,
 *   otras extensiones) sigue al 404 JSON de la API. Sin listado de directorios.
 * - Content-Type por la extensión, que la API eligió según la firma real (image/jpeg|png|webp);
 *   helmet añade `X-Content-Type-Options: nosniff`.
 * - `Cross-Origin-Resource-Policy: cross-origin` SOLO aquí: helmet pone `same-origin` en toda la
 *   API, lo que impediría a las apps Flutter web (localhost:5000/5001, otro origen) mostrar las fotos
 *   con <img>. CORS (las lecturas por fetch/XHR de CanvasKit) ya lo resuelve el middleware `cors`.
 */
function crearManejadorPublico(raiz: string): RequestHandler {
  return Router().use(
    (req, _res, next) => {
      // Solo GET/HEAD de un único segmento con el formato de las claves.
      const nombre = req.path.slice(1);
      if ((req.method === 'GET' || req.method === 'HEAD') && esClaveValida(nombre)) {
        next();
        return;
      }
      next('router');
    },
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(raiz, {
      index: false,
      redirect: false,
      dotfiles: 'deny',
      fallthrough: true,
      // Cache-Control: public, max-age=86400 (sus nombres son aleatorios y su contenido no cambia).
      maxAge: CACHE_FOTOS_MS,
    }),
  );
}

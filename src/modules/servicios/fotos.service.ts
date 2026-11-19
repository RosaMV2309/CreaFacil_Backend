import {
  type AlmacenamientoArchivos,
  detectarTipoImagen,
  generarClave,
  TAMANO_MAXIMO_FOTO,
} from '../../shared/almacenamiento/almacenamiento.js';
import { AppError } from '../../shared/errors/index.js';
import type { FotosRepository } from './fotos.repository.js';
import type { FotoGuardada } from './servicios.repository.js';
import { MAX_FOTOS } from './servicios.schemas.js';
import { fotoARespuesta, type FotoRespuesta, MENSAJE_NO_EXISTE } from './servicios.service.js';

/**
 * Reglas de negocio de las fotos de referencia de un servicio (RF-04).
 *
 * - Tipo por CONTENIDO real (firma JPEG/PNG/WebP), nunca por la extensión ni por el Content-Type
 *   del cliente. Si no es una imagen admitida → 400 VALIDACION (el mismo código que el resto de
 *   errores de un formulario, para que las apps lo muestren junto al campo «foto»).
 * - Máximo 5 MB (413; lo corta antes multer, aquí se comprueba otra vez) y 8 fotos (409).
 * - Nombre del archivo ALEATORIO (`<uuid>.<ext. del tipo detectado>`): el nombre original no se usa.
 * - Orden 0..n-1 sin huecos; la 0 es la portada. Las fotos SÍ se borran (registro y archivo).
 */

export const MENSAJE_SIN_FOTO =
  'Envía la foto en el campo «foto» de un formulario multipart/form-data.';
export const MENSAJE_NO_ES_IMAGEN =
  'El archivo no es una imagen JPG, PNG o WebP válida (se comprueba su contenido, no su extensión).';
export const MENSAJE_DEMASIADO_GRANDE = 'La foto supera el tamaño máximo de 5 MB.';
export const MENSAJE_LIMITE = `El servicio ya tiene ${MAX_FOTOS} fotos, el máximo. Borra alguna antes de subir otra.`;
export const MENSAJE_FOTO_NO_EXISTE = 'La foto no existe en este servicio.';
export const MENSAJE_ORDEN_NO_COINCIDE =
  'fotoIds debe tener exactamente los ids de todas las fotos del servicio, sin repetir.';

export interface ArchivoRecibido {
  readonly contenido: Buffer;
}

export interface FotosService {
  subir(servicioId: string, archivo: ArchivoRecibido | undefined): Promise<FotoRespuesta>;
  ordenar(servicioId: string, fotoIds: readonly string[]): Promise<FotoRespuesta[]>;
  eliminar(servicioId: string, fotoId: string): Promise<FotoRespuesta[]>;
}

export interface DependenciasFotos {
  readonly repositorio: FotosRepository;
  readonly almacenamiento: AlmacenamientoArchivos;
  /** Generador de UUID para los nombres (se inyecta en las pruebas). */
  readonly uuid: () => string;
  /** Aviso cuando un archivo no se pudo borrar del almacenamiento (no hace fallar la petición). */
  readonly avisar?: (mensaje: string, error: unknown) => void;
}

export const errorDemasiadoGrande = () =>
  new AppError({
    estado: 413,
    codigo: 'ARCHIVO_DEMASIADO_GRANDE',
    mensaje: MENSAJE_DEMASIADO_GRANDE,
  });

export const errorFoto = (mensaje: string) =>
  AppError.validacion([{ campo: 'foto', ubicacion: 'body', mensaje }], mensaje);

export function crearFotosService({
  repositorio,
  almacenamiento,
  uuid,
  avisar = (mensaje, error) => {
    console.warn(mensaje, error);
  },
}: DependenciasFotos): FotosService {
  const aRespuesta = (fotos: FotoGuardada[]) =>
    fotos.map((foto) => fotoARespuesta(foto, almacenamiento));

  /** Borra un archivo sin hacer fallar la petición: un archivo huérfano es menos grave que un registro sin archivo. */
  async function borrarArchivo(clave: string | null): Promise<void> {
    if (clave === null) {
      return;
    }
    try {
      await almacenamiento.eliminar(clave);
    } catch (error) {
      avisar(`No se pudo borrar el archivo ${clave} del almacenamiento.`, error);
    }
  }

  return {
    subir: async (servicioId, archivo) => {
      if (!archivo || archivo.contenido.length === 0) {
        throw errorFoto(MENSAJE_SIN_FOTO);
      }
      if (archivo.contenido.length > TAMANO_MAXIMO_FOTO) {
        throw errorDemasiadoGrande();
      }
      const imagen = detectarTipoImagen(archivo.contenido);
      if (!imagen) {
        throw errorFoto(MENSAJE_NO_ES_IMAGEN);
      }
      // Comprobación rápida antes de escribir el archivo (la definitiva va en la transacción).
      if ((await repositorio.contar(servicioId)) >= MAX_FOTOS) {
        throw AppError.conflicto(MENSAJE_LIMITE);
      }

      const clave = generarClave(imagen, uuid);
      await almacenamiento.guardar({
        clave,
        contenido: archivo.contenido,
        tipoMime: imagen.tipoMime,
      });
      try {
        const resultado = await repositorio.agregar(
          servicioId,
          {
            clave,
            url: almacenamiento.urlPublica(clave),
            tipoMime: imagen.tipoMime,
            tamanoBytes: archivo.contenido.length,
          },
          MAX_FOTOS,
        );
        if (resultado.ok) {
          return fotoARespuesta(resultado.foto, almacenamiento);
        }
        throw resultado.motivo === 'limite'
          ? AppError.conflicto(MENSAJE_LIMITE)
          : AppError.noEncontrado(MENSAJE_NO_EXISTE);
      } catch (error) {
        // Sin registro, el archivo sobra.
        await borrarArchivo(clave);
        throw error;
      }
    },

    ordenar: async (servicioId, fotoIds) => {
      const resultado = await repositorio.ordenar(servicioId, fotoIds);
      if (resultado.ok) {
        return aRespuesta(resultado.fotos);
      }
      if (resultado.motivo === 'no-existe') {
        throw AppError.noEncontrado(MENSAJE_NO_EXISTE);
      }
      throw AppError.validacion([
        { campo: 'fotoIds', ubicacion: 'body', mensaje: MENSAJE_ORDEN_NO_COINCIDE },
      ]);
    },

    eliminar: async (servicioId, fotoId) => {
      const resultado = await repositorio.eliminar(servicioId, fotoId);
      if (!resultado.ok) {
        throw AppError.noEncontrado(
          resultado.motivo === 'no-existe' ? MENSAJE_NO_EXISTE : MENSAJE_FOTO_NO_EXISTE,
        );
      }
      // Primero el registro (ya confirmado) y después el archivo.
      await borrarArchivo(resultado.borrada.clave);
      return aRespuesta(resultado.fotos);
    },
  };
}

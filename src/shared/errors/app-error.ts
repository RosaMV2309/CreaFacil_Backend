/**
 * Error de aplicación con estado HTTP y código estable (RNF-02).
 *
 * Los servicios lanzan `AppError` y el manejador central lo convierte en:
 * `{ "error": { "codigo": "...", "mensaje": "...", "detalles": [...] } }`.
 * `codigo` es estable (lo usan las apps Flutter); `mensaje` es texto en español para la persona usuaria.
 */

/** Detalle de un error, por ejemplo un campo inválido de un formulario. */
export interface DetalleError {
  /** Campo afectado (ruta con puntos, p. ej. `items.0.cantidad`). */
  readonly campo?: string;
  /** Parte de la petición donde está el campo: `body`, `query` o `params`. */
  readonly ubicacion?: 'body' | 'query' | 'params';
  readonly mensaje: string;
}

export interface OpcionesAppError {
  readonly estado: number;
  readonly codigo: string;
  readonly mensaje: string;
  readonly detalles?: readonly DetalleError[];
}

export class AppError extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly detalles: readonly DetalleError[] | undefined;

  constructor({ estado, codigo, mensaje, detalles }: OpcionesAppError) {
    super(mensaje);
    this.name = 'AppError';
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }

  /** 400: los datos enviados no cumplen las reglas de validación. */
  static validacion(
    detalles: readonly DetalleError[],
    mensaje = 'Los datos enviados no son válidos.',
  ): AppError {
    return new AppError({ estado: 400, codigo: 'VALIDACION', mensaje, detalles });
  }

  /**
   * 401: falta el token o no es válido. `codigo` permite precisar el motivo
   * (`TOKEN_INVALIDO`, `TOKEN_EXPIRADO`, `CREDENCIALES_INVALIDAS`…); por defecto `NO_AUTENTICADO`.
   */
  static noAutorizado(
    mensaje = 'Debes iniciar sesión para continuar.',
    codigo = 'NO_AUTENTICADO',
  ): AppError {
    return new AppError({ estado: 401, codigo, mensaje });
  }

  /** 403: la persona está autenticada pero no tiene permiso (RN-05). */
  static prohibido(mensaje = 'No tienes permiso para realizar esta acción.'): AppError {
    return new AppError({ estado: 403, codigo: 'PROHIBIDO', mensaje });
  }

  /** 404: el recurso no existe (o no pertenece a quien lo pide, RN-05). */
  static noEncontrado(mensaje = 'El recurso solicitado no existe.'): AppError {
    return new AppError({ estado: 404, codigo: 'NO_ENCONTRADO', mensaje });
  }

  /** 409: la operación choca con el estado actual (p. ej. una transición de estado no permitida). */
  static conflicto(mensaje: string, detalles?: readonly DetalleError[]): AppError {
    return new AppError({
      estado: 409,
      codigo: 'CONFLICTO',
      mensaje,
      ...(detalles ? { detalles } : {}),
    });
  }

  /** 429: se superó el límite de peticiones (p. ej. intentos de inicio de sesión). */
  static demasiadosIntentos(mensaje: string): AppError {
    return new AppError({ estado: 429, codigo: 'DEMASIADOS_INTENTOS', mensaje });
  }

  /** 501: funcionalidad prevista que todavía no está implementada. */
  static noImplementado(mensaje = 'Esta funcionalidad todavía no está disponible.'): AppError {
    return new AppError({ estado: 501, codigo: 'NO_IMPLEMENTADO', mensaje });
  }
}

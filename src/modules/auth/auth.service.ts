import { AppError } from '../../shared/errors/index.js';
import { generarHashPassword, verificarPassword } from '../../shared/security/password.js';
import type { ServicioTokens } from '../../shared/security/tokens.js';
import type { AuthRepository, UsuarioPublico } from './auth.repository.js';
import type { DatosLogin, DatosRegistro } from './auth.schemas.js';

/**
 * Reglas de negocio de la autenticación (RF-01, RNF-01). No conoce Express ni Prisma.
 */

/** Respuesta de registro e inicio de sesión. */
export interface Sesion {
  readonly token: string;
  readonly tipo: 'Bearer';
  /** Fecha y hora ISO 8601 (UTC) en que expira el token. */
  readonly expiraEn: string;
  readonly usuario: UsuarioPublico;
}

/** Hash y verificación de contraseñas (bcrypt). Inyectables para que las pruebas sean rápidas. */
export interface Contrasenas {
  generarHash(password: string): Promise<string>;
  verificar(password: string, hash: string): Promise<boolean>;
}

export interface DependenciasAuthService {
  readonly repositorio: AuthRepository;
  readonly tokens: ServicioTokens;
  readonly contrasenas?: Contrasenas;
}

export interface AuthService {
  registrar(datos: DatosRegistro): Promise<Sesion>;
  iniciarSesion(datos: DatosLogin): Promise<Sesion>;
}

/**
 * Hash bcrypt (coste 12, igual que los reales) de un valor aleatorio que nadie conoce. Se compara
 * cuando el correo no existe para que la respuesta tarde lo mismo que con un correo real y no se
 * pueda averiguar por tiempos qué cuentas existen.
 */
export const HASH_FICTICIO = '$2b$12$fDac.ji0A4SC9w5l7SHrY.gXxVFvsazSVLU8oF6XV2KHj5zpEqG0O';

/** bcrypt solo compara los primeros 72 bytes: una contraseña más larga nunca se da por buena. */
const MAX_BYTES_PASSWORD = 72;

export function credencialesInvalidas(): AppError {
  return AppError.noAutorizado('Correo o contraseña incorrectos.', 'CREDENCIALES_INVALIDAS');
}

export function cuentaDesactivada(): AppError {
  return new AppError({
    estado: 403,
    codigo: 'CUENTA_DESACTIVADA',
    mensaje: 'Tu cuenta está desactivada. Comunícate con CreaFácil para reactivarla.',
  });
}

const contrasenasBcrypt: Contrasenas = {
  generarHash: generarHashPassword,
  verificar: verificarPassword,
};

/** Solo los campos públicos, aunque el objeto de origen traiga más (p. ej. `activo` o el hash). */
export function aUsuarioPublico(usuario: UsuarioPublico): UsuarioPublico {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    telefono: usuario.telefono,
    rol: usuario.rol,
  };
}

export function crearAuthService({
  repositorio,
  tokens,
  contrasenas = contrasenasBcrypt,
}: DependenciasAuthService): AuthService {
  function abrirSesion(usuario: UsuarioPublico): Sesion {
    const { token, expiraEn } = tokens.firmar({ id: usuario.id, rol: usuario.rol });
    return {
      token,
      tipo: 'Bearer',
      expiraEn: expiraEn.toISOString(),
      usuario: aUsuarioPublico(usuario),
    };
  }

  return {
    /**
     * Registro público: siempre crea un CLIENTE (la administradora solo se crea con el seed).
     * Si el correo ya existe responde 409: en un registro es inevitable indicarlo para que la
     * persona sepa que debe iniciar sesión (el inicio de sesión, en cambio, no lo revela).
     */
    registrar: async (datos) => {
      const usuario = await repositorio.crearCliente({
        nombre: datos.nombre,
        email: datos.email,
        passwordHash: await contrasenas.generarHash(datos.password),
        telefono: datos.telefono ?? null,
      });
      if (!usuario) {
        throw AppError.conflicto('Ya existe una cuenta con ese correo.');
      }
      return abrirSesion(usuario);
    },

    /**
     * Inicio de sesión (RF-01) de clientes y de la administradora.
     * - Correo inexistente o contraseña incorrecta → el MISMO 401 `CREDENCIALES_INVALIDAS`,
     *   y siempre se ejecuta una comparación bcrypt (hash ficticio si no hay cuenta).
     * - Cuenta desactivada → 403 `CUENTA_DESACTIVADA`, pero SOLO si la contraseña es correcta:
     *   así no se revela a un tercero que la cuenta existe, y la persona dueña recibe un
     *   mensaje útil en lugar de pensar que se equivocó de contraseña.
     */
    iniciarSesion: async ({ email, password }) => {
      const usuario = await repositorio.buscarCredenciales(email);
      const coincide = await contrasenas.verificar(
        password,
        usuario?.passwordHash ?? HASH_FICTICIO,
      );
      const longitudValida = Buffer.byteLength(password, 'utf8') <= MAX_BYTES_PASSWORD;
      if (!usuario || !coincide || !longitudValida) {
        throw credencialesInvalidas();
      }
      if (!usuario.activo) {
        throw cuentaDesactivada();
      }
      return abrirSesion(usuario);
    },
  };
}

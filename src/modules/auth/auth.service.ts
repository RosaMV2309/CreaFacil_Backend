import { AppError } from '../../shared/errors/index.js';
import { generarHashPassword, verificarPassword } from '../../shared/security/password.js';
import type { ServicioTokens } from '../../shared/security/tokens.js';
import type { AuthRepository, UsuarioPublico } from './auth.repository.js';
import type { DatosRegistro } from './auth.schemas.js';

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
  };
}

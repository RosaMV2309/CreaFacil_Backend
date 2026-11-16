import type { PrismaClient } from '../../shared/database/prisma.js';
import type { Rol } from '../../shared/middlewares/auth.js';

/**
 * Acceso a datos del módulo de autenticación (RNF-07): la única capa que conoce Prisma.
 * Nunca devuelve `passwordHash` salvo en {@link AuthRepository.buscarCredenciales},
 * que solo usa el servicio para comparar la contraseña.
 */

/** Datos de la persona que se pueden devolver a las apps (sin hash ni campos internos). */
export interface UsuarioPublico {
  readonly id: string;
  readonly nombre: string;
  readonly email: string;
  readonly telefono: string | null;
  readonly rol: Rol;
}

export interface UsuarioConEstado extends UsuarioPublico {
  readonly activo: boolean;
}

export interface UsuarioConCredenciales extends UsuarioConEstado {
  readonly passwordHash: string;
}

export interface NuevoCliente {
  readonly nombre: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly telefono: string | null;
}

/** Cambios permitidos en el propio perfil. `telefono: null` lo borra; `undefined` no lo cambia. */
export interface CambiosPerfil {
  readonly nombre?: string;
  readonly telefono?: string | null;
}

export interface AuthRepository {
  /** Crea una cuenta con rol CLIENTE. Devuelve `null` si el correo ya existe. */
  crearCliente(datos: NuevoCliente): Promise<UsuarioPublico | null>;
  buscarCredenciales(email: string): Promise<UsuarioConCredenciales | null>;
  buscarPorId(id: string): Promise<UsuarioConEstado | null>;
  /**
   * Actualiza el perfil de la cuenta `id` SOLO si existe y está activa (una única consulta, sin
   * carreras entre comprobar y escribir). Devuelve `null` si no existe o está desactivada.
   */
  actualizarPerfil(id: string, cambios: CambiosPerfil): Promise<UsuarioPublico | null>;
}

/** Prisma lanza P2025 cuando `update` no encuentra el registro (con los filtros del `where`). */
export function esRegistroInexistente(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025';
}

const camposPublicos = {
  id: true,
  nombre: true,
  email: true,
  telefono: true,
  rol: true,
} as const;

/** Prisma lanza P2002 cuando se viola una restricción única (aquí, el correo). */
export function esCorreoDuplicado(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export function crearAuthRepository(prisma: Pick<PrismaClient, 'usuario'>): AuthRepository {
  return {
    crearCliente: async (datos) => {
      try {
        return await prisma.usuario.create({
          // El rol se fija aquí: el registro público nunca crea administradoras.
          data: { ...datos, rol: 'CLIENTE', activo: true },
          select: camposPublicos,
        });
      } catch (error) {
        if (esCorreoDuplicado(error)) {
          return null;
        }
        throw error;
      }
    },

    buscarCredenciales: (email) =>
      prisma.usuario.findUnique({
        where: { email },
        select: { ...camposPublicos, activo: true, passwordHash: true },
      }),

    buscarPorId: (id) =>
      prisma.usuario.findUnique({
        where: { id },
        select: { ...camposPublicos, activo: true },
      }),

    actualizarPerfil: async (id, { nombre, telefono }) => {
      try {
        return await prisma.usuario.update({
          where: { id, activo: true },
          // Solo los campos editables: aunque llegara otro, aquí no se escribiría.
          data: {
            ...(nombre !== undefined ? { nombre } : {}),
            ...(telefono !== undefined ? { telefono } : {}),
          },
          select: camposPublicos,
        });
      } catch (error) {
        if (esRegistroInexistente(error)) {
          return null;
        }
        throw error;
      }
    },
  };
}

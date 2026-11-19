/**
 * Limpieza de los datos de prueba que deja la colección de Postman/newman (RNF-07, RNF-08).
 *
 * Cada ejecución de la colección registra un cliente con un correo del dominio reservado
 * `@newman.creafacil.test`. Este módulo borra SOLO esos clientes (y, si se pide con
 * `--incluir-antiguos`, los `cliente+<marca>@creafacil.test` que dejaron las versiones anteriores
 * de la colección), junto con sus datos relacionados.
 *
 * También borra las categorías y los materiales cuyo nombre empieza por el prefijo reservado
 * `[newman] ` (los crea la carpeta «Catálogo · Administración»). Es la ÚNICA excepción a la regla
 * «el catálogo solo se desactiva, nunca se borra», porque son datos de prueba. Si algo que no es de
 * prueba depende de ellos (un servicio, una cotización…), no se borra NADA y se explica el motivo.
 *
 * Es una herramienta de mantenimiento de desarrollo, NO un endpoint: no forma parte del servidor
 * (no está en `src/`, no se compila en `dist/`) y no hay ninguna ruta HTTP que borre usuarios.
 *
 * Protecciones:
 * - Nunca se ejecuta con `NODE_ENV=production` (no hay forma de saltárselo).
 * - Solo rol CLIENTE: una cuenta ADMIN nunca se borra, aunque su correo coincida.
 * - Doble filtro: la consulta filtra por dominio y rol, y después cada correo se vuelve a comprobar
 *   con una expresión regular estricta antes de borrarlo por id.
 * - `--simular` muestra lo que se borraría sin borrar nada.
 * - Todo se borra en una transacción: o se borra todo o nada.
 */
import type { PrismaClient } from '../src/shared/database/prisma.js';

/** Dominio reservado para los datos de prueba de newman (lo usa la colección de Postman). */
export const DOMINIO_NEWMAN = '@newman.creafacil.test';
/** Patrón de las versiones anteriores de la colección: `cliente+<marca>@creafacil.test`. */
export const PREFIJO_ANTIGUO = 'cliente+';
export const DOMINIO_ANTIGUO = '@creafacil.test';

/** Prefijo reservado del nombre de las categorías y los materiales que crea newman. */
export const PREFIJO_CATALOGO_NEWMAN = '[newman] ';

const CORREO_NEWMAN = /^[^@\s]+@newman\.creafacil\.test$/;
const NOMBRE_CATALOGO_NEWMAN = /^\[newman\] \S/;
const CORREO_ANTIGUO = /^cliente\+[^@\s]+@creafacil\.test$/;

export interface OpcionesLimpieza {
  /** Solo muestra lo que se borraría (dry-run). */
  simular: boolean;
  /** Incluye también los antiguos `cliente+<marca>@creafacil.test`. */
  incluirAntiguos: boolean;
}

export type OrigenDatoPrueba = 'newman' | 'antiguo';

export interface UsuarioDePrueba {
  id: string;
  email: string;
  origen: OrigenDatoPrueba;
}

/** Categoría o material de prueba (por su prefijo). */
export interface ElementoCatalogoDePrueba {
  id: string;
  nombre: string;
}

export interface RecuentoBorrado {
  usuarios: number;
  cotizaciones: number;
  solicitudes: number;
  pedidos: number;
  historialPedidos: number;
  categorias: number;
  materiales: number;
}

export interface ResultadoLimpieza {
  simulado: boolean;
  usuarios: UsuarioDePrueba[];
  categorias: ElementoCatalogoDePrueba[];
  materiales: ElementoCatalogoDePrueba[];
  /** Filas borradas (todo a 0 en una simulación). */
  borrados: RecuentoBorrado;
}

/** Error esperado de la limpieza: se muestra a la persona sin la pila. */
export class ErrorLimpieza extends Error {
  override readonly name = 'ErrorLimpieza';
}

export const AYUDA = [
  'Uso: npm run db:limpiar-pruebas -- [--simular] [--incluir-antiguos]',
  '',
  `Borra los clientes de prueba de newman (correo *${DOMINIO_NEWMAN}) y sus datos relacionados,`,
  `y las categorías y los materiales de prueba (nombre que empieza por «${PREFIJO_CATALOGO_NEWMAN}»).`,
  '  --simular           Muestra lo que se borraría sin borrar nada.',
  `  --incluir-antiguos  Incluye también los antiguos ${PREFIJO_ANTIGUO}<marca>${DOMINIO_ANTIGUO}.`,
  '  --ayuda             Muestra esta ayuda.',
  'Nunca borra cuentas ADMIN y no se ejecuta con NODE_ENV=production.',
].join('\n');

/** Lee los argumentos de la línea de comandos. Un argumento desconocido es un error. */
export function leerOpciones(argumentos: readonly string[]): OpcionesLimpieza {
  const opciones: OpcionesLimpieza = { simular: false, incluirAntiguos: false };
  for (const argumento of argumentos) {
    if (argumento === '--simular') {
      opciones.simular = true;
    } else if (argumento === '--incluir-antiguos') {
      opciones.incluirAntiguos = true;
    } else {
      throw new ErrorLimpieza(`Argumento desconocido: «${argumento}».\n\n${AYUDA}`);
    }
  }
  return opciones;
}

/** Se niega a trabajar en producción: la limpieza es solo para desarrollo y pruebas. */
export function comprobarEntornoPermitido(nodeEnv: string | undefined): void {
  if (nodeEnv?.trim().toLowerCase() === 'production') {
    throw new ErrorLimpieza(
      'La limpieza de datos de prueba no se ejecuta con NODE_ENV=production. ' +
        'Es una herramienta solo para desarrollo y pruebas.',
    );
  }
}

/** ¿El nombre de una categoría o un material es de prueba («[newman] …»)? Función pura. */
export function esNombreDePrueba(nombre: string): boolean {
  return NOMBRE_CATALOGO_NEWMAN.test(nombre);
}

/** Clasifica un correo como dato de prueba (o `null` si no lo es). Función pura. */
export function origenDatoPrueba(email: string, incluirAntiguos: boolean): OrigenDatoPrueba | null {
  if (CORREO_NEWMAN.test(email)) {
    return 'newman';
  }
  if (incluirAntiguos && CORREO_ANTIGUO.test(email)) {
    return 'antiguo';
  }
  return null;
}

const SIN_BORRADOS: RecuentoBorrado = {
  usuarios: 0,
  cotizaciones: 0,
  solicitudes: 0,
  pedidos: 0,
  historialPedidos: 0,
  categorias: 0,
  materiales: 0,
};

/** Orden por código de carácter: la salida no depende de la collation de PostgreSQL. */
function porCodigo(a: string, b: string): number {
  return a < b ? -1 : 1;
}

/** Busca los clientes de prueba (doble filtro: consulta + expresión regular). */
async function buscarUsuariosDePrueba(
  prisma: PrismaClient,
  incluirAntiguos: boolean,
): Promise<UsuarioDePrueba[]> {
  const criterios = [
    { email: { endsWith: DOMINIO_NEWMAN } },
    ...(incluirAntiguos
      ? [{ email: { startsWith: PREFIJO_ANTIGUO, endsWith: DOMINIO_ANTIGUO } }]
      : []),
  ];
  const candidatos = await prisma.usuario.findMany({
    where: { rol: 'CLIENTE', OR: criterios },
    select: { id: true, email: true, rol: true },
  });
  // Orden en JS por código de carácter: la salida no depende de la collation de PostgreSQL.
  candidatos.sort((a, b) => porCodigo(a.email, b.email));
  const usuarios: UsuarioDePrueba[] = [];
  for (const candidato of candidatos) {
    const origen = origenDatoPrueba(candidato.email, incluirAntiguos);
    if (candidato.rol === 'CLIENTE' && origen !== null) {
      usuarios.push({ id: candidato.id, email: candidato.email, origen });
    }
  }
  return usuarios;
}

/** Categorías y materiales de prueba (doble filtro: prefijo en la consulta + expresión regular). */
async function buscarCatalogoDePrueba(
  prisma: PrismaClient,
): Promise<{ categorias: ElementoCatalogoDePrueba[]; materiales: ElementoCatalogoDePrueba[] }> {
  const consulta = {
    where: { nombre: { startsWith: PREFIJO_CATALOGO_NEWMAN } },
    select: { id: true, nombre: true },
  };
  const [categorias, materiales] = await Promise.all([
    prisma.categoria.findMany(consulta),
    prisma.material.findMany(consulta),
  ]);
  const filtrar = (elementos: ElementoCatalogoDePrueba[]) =>
    elementos
      .filter((elemento) => esNombreDePrueba(elemento.nombre))
      .sort((a, b) => porCodigo(a.nombre, b.nombre));
  return { categorias: filtrar(categorias), materiales: filtrar(materiales) };
}

/**
 * Borra los clientes de prueba y sus datos (cascada explícita, en una transacción).
 * Orden: historial de sus pedidos → pedidos → solicitudes (sus imágenes caen en cascada) →
 * cotizaciones (sus detalles caen en cascada) → usuarios (notificaciones y dispositivos FCM caen
 * en cascada en la BD). Solo se tocan filas cuyo cliente es uno de los usuarios de prueba: si un
 * dato ajeno los referencia, la restricción de la BD hace fallar la transacción y no se borra nada.
 */
async function borrarDatosPrueba(
  prisma: PrismaClient,
  ids: string[],
  idsCategorias: string[],
  idsMateriales: string[],
): Promise<RecuentoBorrado> {
  return prisma.$transaction(async (tx) => {
    const historialPedidos = await tx.historialEstadoPedido.deleteMany({
      where: { pedido: { clienteId: { in: ids } } },
    });
    const pedidos = await tx.pedido.deleteMany({ where: { clienteId: { in: ids } } });
    const solicitudes = await tx.solicitud.deleteMany({ where: { clienteId: { in: ids } } });
    const cotizaciones = await tx.cotizacion.deleteMany({ where: { clienteId: { in: ids } } });
    const usuarios = await tx.usuario.deleteMany({ where: { id: { in: ids }, rol: 'CLIENTE' } });

    // Catálogo de prueba: DESPUÉS de los clientes, porque los detalles de sus cotizaciones (ya
    // borrados en cascada) eran lo único que podía referenciar a un material de prueba.
    const servicios = await tx.servicio.count({ where: { categoriaId: { in: idsCategorias } } });
    if (servicios > 0) {
      throw new ErrorLimpieza(
        `Las categorías de prueba tienen ${servicios} servicio(s) que dependen de ellas. ` +
          'No se ha borrado nada.',
      );
    }
    const usosMateriales =
      (await tx.servicioMaterial.count({ where: { materialId: { in: idsMateriales } } })) +
      (await tx.detalleCotizacionMaterial.count({ where: { materialId: { in: idsMateriales } } }));
    if (usosMateriales > 0) {
      throw new ErrorLimpieza(
        `Los materiales de prueba se usan en ${usosMateriales} servicio(s) o cotización(es) que no ` +
          'son de prueba. No se ha borrado nada.',
      );
    }
    const categorias = await tx.categoria.deleteMany({ where: { id: { in: idsCategorias } } });
    const materiales = await tx.material.deleteMany({ where: { id: { in: idsMateriales } } });
    return {
      usuarios: usuarios.count,
      cotizaciones: cotizaciones.count,
      solicitudes: solicitudes.count,
      pedidos: pedidos.count,
      historialPedidos: historialPedidos.count,
      categorias: categorias.count,
      materiales: materiales.count,
    };
  });
}

/** Limpia los datos de prueba. Comprueba el entorno ANTES de tocar la base de datos. */
export async function limpiarDatosPrueba(
  prisma: PrismaClient,
  opciones: OpcionesLimpieza,
  nodeEnv: string | undefined,
): Promise<ResultadoLimpieza> {
  comprobarEntornoPermitido(nodeEnv);
  const usuarios = await buscarUsuariosDePrueba(prisma, opciones.incluirAntiguos);
  const { categorias, materiales } = await buscarCatalogoDePrueba(prisma);
  const encontrados = { usuarios, categorias, materiales };
  const nada = usuarios.length + categorias.length + materiales.length === 0;
  if (opciones.simular || nada) {
    return { simulado: opciones.simular, ...encontrados, borrados: { ...SIN_BORRADOS } };
  }
  const borrados = await borrarDatosPrueba(
    prisma,
    usuarios.map((usuario) => usuario.id),
    categorias.map((categoria) => categoria.id),
    materiales.map((material) => material.id),
  );
  return { simulado: false, ...encontrados, borrados };
}

/** Texto del resumen para la consola. */
export function describirResultado(resultado: ResultadoLimpieza): string[] {
  const { usuarios, categorias, materiales, borrados } = resultado;
  const newman = usuarios.filter((usuario) => usuario.origen === 'newman').length;
  const antiguos = usuarios.length - newman;
  const lineas = [
    `Clientes de prueba encontrados: ${usuarios.length} (newman: ${newman}, antiguos: ${antiguos})`,
    ...usuarios.map((usuario) => `  - ${usuario.email}`),
    `Categorías de prueba encontradas: ${categorias.length}`,
    ...categorias.map((categoria) => `  - ${categoria.nombre}`),
    `Materiales de prueba encontrados: ${materiales.length}`,
    ...materiales.map((material) => `  - ${material.nombre}`),
  ];
  if (resultado.simulado) {
    lineas.push(
      `SIMULACIÓN: se borrarían ${usuarios.length} usuarios, ${categorias.length} categorías y ` +
        `${materiales.length} materiales. No se ha borrado nada.`,
    );
  } else {
    lineas.push(
      `Borrados: ${borrados.usuarios} usuarios, ${borrados.cotizaciones} cotizaciones, ` +
        `${borrados.solicitudes} solicitudes, ${borrados.pedidos} pedidos, ` +
        `${borrados.historialPedidos} cambios de estado, ${borrados.categorias} categorías y ` +
        `${borrados.materiales} materiales.`,
    );
  }
  return lineas;
}

/** Describe la base de datos sin credenciales («creafacil en localhost:5432»). */
export function describirBaseDatos(url: string): string {
  try {
    const { hostname, port, pathname } = new URL(url);
    return `${pathname.replace(/^\//, '')} en ${hostname}:${port || '5432'}`;
  } catch {
    return '(URL no válida)';
  }
}

export interface DependenciasCli {
  crearPrisma: (url: string) => PrismaClient;
  escribir: (linea: string) => void;
  escribirError: (linea: string) => void;
}

/**
 * Punto de entrada testeable de `npm run db:limpiar-pruebas`. Devuelve el código de salida.
 * No crea la conexión si los argumentos o el entorno no son válidos.
 */
export async function ejecutarCli(
  argumentos: readonly string[],
  entorno: NodeJS.ProcessEnv,
  dependencias: DependenciasCli,
): Promise<number> {
  const { escribir, escribirError } = dependencias;
  if (argumentos.includes('--ayuda')) {
    escribir(AYUDA);
    return 0;
  }
  try {
    const opciones = leerOpciones(argumentos);
    comprobarEntornoPermitido(entorno.NODE_ENV);
    const url = entorno.DATABASE_URL ?? '';
    if (!url.startsWith('postgresql://')) {
      throw new ErrorLimpieza('Falta DATABASE_URL (cadena de conexión de PostgreSQL) en el .env.');
    }
    escribir(`Limpieza de datos de prueba · base de datos: ${describirBaseDatos(url)}`);
    const prisma = dependencias.crearPrisma(url);
    try {
      const resultado = await limpiarDatosPrueba(prisma, opciones, entorno.NODE_ENV);
      describirResultado(resultado).forEach((linea) => {
        escribir(linea);
      });
      return 0;
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    escribirError(`La limpieza de datos de prueba falló: ${mensaje}`);
    return 1;
  }
}

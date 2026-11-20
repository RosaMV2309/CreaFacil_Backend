/**
 * Limpieza de los datos de prueba de newman (RNF-07, RNF-08): partes puras y protecciones del
 * punto de entrada, sin base de datos. El borrado real se prueba en
 * `tests/integracion/limpieza-datos-prueba.integracion.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  AYUDA,
  comprobarEntornoPermitido,
  describirBaseDatos,
  describirResultado,
  ejecutarCli,
  ErrorLimpieza,
  esNombreDePrueba,
  leerOpciones,
  PREFIJO_CATALOGO_NEWMAN,
  limpiarDatosPrueba,
  origenDatoPrueba,
  type DependenciasCli,
} from '../scripts/limpieza-datos-prueba.js';
import type { PrismaClient } from '../src/shared/database/prisma.js';

/** Un «cliente Prisma» que falla si se usa: demuestra que no se ha tocado la base de datos. */
function prismaIntocable(): PrismaClient {
  return new Proxy(
    {},
    {
      get(_objetivo, propiedad) {
        throw new Error(`No se debía usar la base de datos (${String(propiedad)})`);
      },
    },
  ) as PrismaClient;
}

function dependencias(crearPrisma = vi.fn(() => prismaIntocable())): {
  deps: DependenciasCli;
  salida: string[];
  errores: string[];
  crearPrisma: typeof crearPrisma;
} {
  const salida: string[] = [];
  const errores: string[] = [];
  return {
    deps: {
      crearPrisma,
      escribir: (linea) => salida.push(linea),
      escribirError: (linea) => errores.push(linea),
    },
    salida,
    errores,
    crearPrisma,
  };
}

const URL_BD = 'postgresql://usuario:clave-secreta@localhost:5432/creafacil?schema=public';

describe('leerOpciones', () => {
  it('sin argumentos borra de verdad y solo los de newman', () => {
    expect(leerOpciones([])).toEqual({ simular: false, incluirAntiguos: false });
  });

  it('reconoce --simular y --incluir-antiguos', () => {
    expect(leerOpciones(['--simular', '--incluir-antiguos'])).toEqual({
      simular: true,
      incluirAntiguos: true,
    });
  });

  it('rechaza un argumento desconocido (p. ej. una errata de --simular)', () => {
    expect(() => leerOpciones(['--simula'])).toThrow(ErrorLimpieza);
    expect(() => leerOpciones(['--simula'])).toThrow(/Argumento desconocido: «--simula»/);
  });
});

describe('comprobarEntornoPermitido', () => {
  it.each([undefined, '', 'development', 'test'])('permite NODE_ENV=%s', (valor) => {
    expect(() => {
      comprobarEntornoPermitido(valor);
    }).not.toThrow();
  });

  it.each(['production', 'PRODUCTION', ' production '])('se niega con NODE_ENV=%s', (valor) => {
    expect(() => {
      comprobarEntornoPermitido(valor);
    }).toThrow(/no se ejecuta con NODE_ENV=production/);
  });
});

describe('origenDatoPrueba', () => {
  it('reconoce el dominio reservado de newman', () => {
    expect(origenDatoPrueba('cliente+1763390000000@newman.creafacil.test', false)).toBe('newman');
  });

  it('los antiguos solo cuentan con --incluir-antiguos', () => {
    expect(origenDatoPrueba('cliente+1763390000000@creafacil.test', false)).toBeNull();
    expect(origenDatoPrueba('cliente+1763390000000@creafacil.test', true)).toBe('antiguo');
  });

  it.each([
    'maria.lopez@prueba.com',
    'ana@app.creafacil.test',
    'admin@creafacil.local',
    'ana@creafacil.test',
    'otro+1@creafacil.test',
    'cliente+1@app.creafacil.test',
    'x@sub.newman.creafacil.test',
    'x@newman.creafacil.test.ejemplo.com',
    'x@newman.creafacil.testx',
    'newman.creafacil.test',
    'a b@newman.creafacil.test',
  ])('no confunde %s con un dato de prueba', (email) => {
    expect(origenDatoPrueba(email, true)).toBeNull();
  });
});

describe('esNombreDePrueba (categorías y materiales de newman)', () => {
  it.each(['[newman] Categoría 1763390000000', '[newman] Material x'])(
    'reconoce «%s»',
    (nombre) => {
      expect(esNombreDePrueba(nombre)).toBe(true);
      expect(nombre.startsWith(PREFIJO_CATALOGO_NEWMAN)).toBe(true);
    },
  );

  it.each([
    'Murales',
    'Fomix',
    '[NEWMAN] Categoría',
    '[newman]Categoría',
    '[newman]  ',
    '[newman] ',
    ' [newman] Categoría',
    'Categoría [newman] 1',
    '(newman) Categoría',
  ])('no confunde «%s» con un dato de prueba', (nombre) => {
    expect(esNombreDePrueba(nombre)).toBe(false);
  });
});

describe('describirResultado y describirBaseDatos', () => {
  const usuarios = [
    { id: '1', email: 'a@newman.creafacil.test', origen: 'newman' as const },
    { id: '2', email: 'cliente+1@creafacil.test', origen: 'antiguo' as const },
  ];

  const servicios = [{ id: 's', nombre: '[newman] Servicio 1' }];
  const categorias = [{ id: 'c', nombre: '[newman] Categoría 1' }];
  const materiales = [
    { id: 'm1', nombre: '[newman] Material 1' },
    { id: 'm2', nombre: '[newman] Material 2' },
  ];

  it('en una simulación avisa de que no se ha borrado nada', () => {
    const lineas = describirResultado({
      simulado: true,
      usuarios,
      servicios,
      categorias,
      materiales,
      avisos: [],
      borrados: {
        usuarios: 0,
        cotizaciones: 0,
        solicitudes: 0,
        pedidos: 0,
        historialPedidos: 0,
        servicios: 0,
        fotos: 0,
        archivos: 0,
        categorias: 0,
        materiales: 0,
      },
    });
    expect(lineas).toEqual([
      'Clientes de prueba encontrados: 2 (newman: 1, antiguos: 1)',
      '  - a@newman.creafacil.test',
      '  - cliente+1@creafacil.test',
      'Servicios de prueba encontrados: 1',
      '  - [newman] Servicio 1',
      'Categorías de prueba encontradas: 1',
      '  - [newman] Categoría 1',
      'Materiales de prueba encontrados: 2',
      '  - [newman] Material 1',
      '  - [newman] Material 2',
      'SIMULACIÓN: se borrarían 2 usuarios, 1 servicios (con sus fotos), 1 categorías y 2 materiales. ' +
        'No se ha borrado nada.',
    ]);
  });

  it('tras borrar muestra cuántas filas se borraron', () => {
    const lineas = describirResultado({
      simulado: false,
      usuarios,
      servicios,
      categorias,
      materiales,
      avisos: [],
      borrados: {
        usuarios: 2,
        cotizaciones: 3,
        solicitudes: 4,
        pedidos: 5,
        historialPedidos: 6,
        servicios: 1,
        fotos: 3,
        archivos: 2,
        categorias: 1,
        materiales: 2,
      },
    });
    expect(lineas.at(-1)).toBe(
      'Borrados: 2 usuarios, 3 cotizaciones, 4 solicitudes, 5 pedidos, 6 cambios de estado, ' +
        '1 servicios, 3 fotos (2 archivos), 1 categorías y 2 materiales.',
    );
  });

  it('muestra los archivos que no se pudieron borrar antes del recuento', () => {
    const lineas = describirResultado({
      simulado: false,
      usuarios: [],
      servicios,
      categorias: [],
      materiales: [],
      avisos: ['No se pudo borrar el archivo x.png: EPERM'],
      borrados: {
        usuarios: 0,
        cotizaciones: 0,
        solicitudes: 0,
        pedidos: 0,
        historialPedidos: 0,
        servicios: 1,
        fotos: 1,
        archivos: 0,
        categorias: 0,
        materiales: 0,
      },
    });
    expect(lineas.at(-2)).toBe('Aviso: No se pudo borrar el archivo x.png: EPERM');
  });

  it('describe la base de datos sin mostrar el usuario ni la contraseña', () => {
    expect(describirBaseDatos(URL_BD)).toBe('creafacil en localhost:5432');
    expect(describirBaseDatos('postgresql://u:c@db.ejemplo/otra')).toBe('otra en db.ejemplo:5432');
    expect(describirBaseDatos('no es una url')).toBe('(URL no válida)');
  });
});

describe('limpiarDatosPrueba: protección de producción', () => {
  it('se niega en production sin tocar la base de datos', async () => {
    await expect(
      limpiarDatosPrueba(prismaIntocable(), { simular: true, incluirAntiguos: true }, 'production'),
    ).rejects.toThrow(ErrorLimpieza);
  });
});

describe('ejecutarCli (npm run db:limpiar-pruebas)', () => {
  it('--ayuda muestra el uso y no conecta', async () => {
    const { deps, salida, crearPrisma } = dependencias();
    await expect(ejecutarCli(['--ayuda'], {}, deps)).resolves.toBe(0);
    expect(salida).toEqual([AYUDA]);
    expect(crearPrisma).not.toHaveBeenCalled();
  });

  it('con NODE_ENV=production sale con código 1 y no conecta', async () => {
    const { deps, errores, crearPrisma } = dependencias();
    const codigo = await ejecutarCli(
      ['--simular'],
      { NODE_ENV: 'production', DATABASE_URL: URL_BD },
      deps,
    );
    expect(codigo).toBe(1);
    expect(crearPrisma).not.toHaveBeenCalled();
    expect(errores[0]).toMatch(/^La limpieza de datos de prueba falló: .*NODE_ENV=production/);
  });

  it('con un argumento desconocido sale con código 1 y no conecta', async () => {
    const { deps, errores, crearPrisma } = dependencias();
    await expect(ejecutarCli(['--borrar-todo'], { DATABASE_URL: URL_BD }, deps)).resolves.toBe(1);
    expect(crearPrisma).not.toHaveBeenCalled();
    expect(errores[0]).toContain('Argumento desconocido: «--borrar-todo»');
  });

  it('sin DATABASE_URL válida sale con código 1', async () => {
    const { deps, errores, crearPrisma } = dependencias();
    await expect(ejecutarCli([], { DATABASE_URL: 'mysql://x' }, deps)).resolves.toBe(1);
    await expect(ejecutarCli([], {}, deps)).resolves.toBe(1);
    expect(crearPrisma).not.toHaveBeenCalled();
    expect(errores[0]).toContain('Falta DATABASE_URL');
  });

  it('si la base de datos falla, informa, cierra la conexión y sale con código 1', async () => {
    const desconectar = vi.fn(() => Promise.resolve());
    const prisma = {
      usuario: { findMany: () => Promise.reject(new Error('conexión rechazada')) },
      $disconnect: desconectar,
    } as unknown as PrismaClient;
    const { deps, salida, errores } = dependencias(vi.fn(() => prisma));

    await expect(ejecutarCli([], { DATABASE_URL: URL_BD }, deps)).resolves.toBe(1);
    expect(desconectar).toHaveBeenCalledOnce();
    expect(salida[0]).toBe(
      'Limpieza de datos de prueba · base de datos: creafacil en localhost:5432',
    );
    expect(salida.join('\n')).not.toContain('clave-secreta');
    expect(errores).toEqual(['La limpieza de datos de prueba falló: conexión rechazada']);
  });

  it('informa también de errores que no son instancias de Error', async () => {
    const { deps, errores } = dependencias(
      vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- se prueba ese caso
        throw 'fallo raro';
      }),
    );
    await expect(ejecutarCli([], { DATABASE_URL: URL_BD }, deps)).resolves.toBe(1);
    expect(errores).toEqual(['La limpieza de datos de prueba falló: fallo raro']);
  });
});

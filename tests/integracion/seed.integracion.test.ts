import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CATEGORIAS_BASE, MATERIALES_BASE, sembrarDatosBase } from '../../prisma/seed-datos.js';
import { verificarPassword } from '../../src/shared/security/password.js';
import { crearPrismaDePrueba, vaciarBaseDatos } from './base-datos.js';

const admin = {
  email: 'Admin.Prueba@CreaFacil.local',
  password: 'Clave-Segura-2026',
  nombre: 'Administradora de prueba',
};

describe('seed de datos base (integración)', () => {
  const prisma = crearPrismaDePrueba();

  beforeAll(async () => {
    await vaciarBaseDatos(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crea la administradora con la contraseña en hash bcrypt verificable (RNF-01)', async () => {
    const resumen = await sembrarDatosBase(prisma, admin);

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: 'admin.prueba@creafacil.local' },
    });
    expect(resumen.administradora.email).toBe('admin.prueba@creafacil.local');
    expect(usuario.rol).toBe('ADMIN');
    expect(usuario.activo).toBe(true);
    expect(usuario.passwordHash).toMatch(/^\$2b\$12\$/);
    expect(usuario.passwordHash).not.toContain(admin.password);
    await expect(verificarPassword(admin.password, usuario.passwordHash)).resolves.toBe(true);
    await expect(verificarPassword('otra-clave', usuario.passwordHash)).resolves.toBe(false);
  });

  it('crea las categorías del DERCAS, los materiales y una configuración de precios vigente', async () => {
    const categorias = await prisma.categoria.findMany({ orderBy: { orden: 'asc' } });
    expect(categorias.map((c) => c.nombre)).toEqual([
      'Manualidades con fomix',
      'Decoraciones',
      'Murales',
    ]);

    const fomix = await prisma.material.findUniqueOrThrow({ where: { nombre: 'Fomix' } });
    // Decimal exacto, sin errores de coma flotante (RF-07).
    expect(fomix.precioUnitario.toFixed(2)).toBe('0.75');

    const vigentes = await prisma.configuracionPrecios.findMany({ where: { vigenteHasta: null } });
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]?.factorComplejidadAlta.toFixed(2)).toBe('1.50');
  });

  it('es idempotente: una segunda ejecución no duplica nada ni cambia la contraseña', async () => {
    const hashAntes = (
      await prisma.usuario.findUniqueOrThrow({ where: { email: 'admin.prueba@creafacil.local' } })
    ).passwordHash;

    const resumen = await sembrarDatosBase(prisma, { ...admin, password: 'Otra-Clave-2026' });

    expect(resumen.configuracionCreada).toBe(false);
    await expect(prisma.usuario.count()).resolves.toBe(1);
    await expect(prisma.categoria.count()).resolves.toBe(CATEGORIAS_BASE.length);
    await expect(prisma.material.count()).resolves.toBe(MATERIALES_BASE.length);
    await expect(prisma.configuracionPrecios.count()).resolves.toBe(1);
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: 'admin.prueba@creafacil.local' },
    });
    expect(usuario.passwordHash).toBe(hashAntes);
  });
});

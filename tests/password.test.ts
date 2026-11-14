import { describe, expect, it } from 'vitest';

import {
  COSTE_BCRYPT,
  generarHashPassword,
  verificarPassword,
} from '../src/shared/security/password.js';

// bcryptjs (JavaScript puro) con coste 12 tarda ~1 s por hash; con todas las pruebas en
// paralelo puede superar los 5 s por defecto de Vitest, así que se amplía el margen.
describe('contraseñas con bcrypt (RNF-01)', { timeout: 20_000 }, () => {
  it('usa un coste de 12 o más', () => {
    expect(COSTE_BCRYPT).toBeGreaterThanOrEqual(12);
  });

  it('genera un hash bcrypt que no contiene la contraseña y la verifica', async () => {
    const hash = await generarHashPassword('Secreta-2026');

    expect(hash).toMatch(/^\$2[aby]\$12\$.{53}$/);
    expect(hash).not.toContain('Secreta-2026');
    await expect(verificarPassword('Secreta-2026', hash)).resolves.toBe(true);
    await expect(verificarPassword('otra-clave', hash)).resolves.toBe(false);
  });

  it('genera hashes distintos para la misma contraseña (sal aleatoria)', async () => {
    const [a, b] = await Promise.all([
      generarHashPassword('igual-1234'),
      generarHashPassword('igual-1234'),
    ]);
    expect(a).not.toBe(b);
  });
});

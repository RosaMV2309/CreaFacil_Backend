import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { datosValidados, validate } from '../src/shared/middlewares/validate.js';
import { crearAppDePrueba } from './helpers.js';

// Ruta que solo existe en esta prueba.
const esquemas = {
  params: z.object({ id: z.coerce.number().int().positive('El id debe ser positivo') }),
  query: z.object({ detalle: z.enum(['si', 'no']).default('no') }),
  body: z.object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
    cantidad: z.number().int().min(1),
  }),
};

const rutas = Router();
rutas.post('/items/:id', validate(esquemas), (_req, res) => {
  const { params, query, body } = datosValidados(res, esquemas);
  res.json({ id: params.id, detalle: query.detalle, nombre: body.nombre, cantidad: body.cantidad });
});

const app = crearAppDePrueba(rutas);

describe('middleware validate', () => {
  it('deja pasar datos válidos ya transformados por Zod', async () => {
    const res = await request(app)
      .post('/items/7?detalle=si')
      .send({ nombre: '  Mural  ', cantidad: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 7, detalle: 'si', nombre: 'Mural', cantidad: 2 });
  });

  it('aplica los valores por defecto de la query', async () => {
    const res = await request(app).post('/items/1').send({ nombre: 'Caja', cantidad: 1 });
    expect(res.status).toBe(200);
    expect((res.body as { detalle: string }).detalle).toBe('no');
  });

  it('responde 400 VALIDACION con los detalles de body, query y params', async () => {
    const res = await request(app).post('/items/-3?detalle=quizas').send({ nombre: '   ' });

    expect(res.status).toBe(400);
    const cuerpo = res.body as {
      error: {
        codigo: string;
        mensaje: string;
        detalles: { campo: string; ubicacion: string; mensaje: string }[];
      };
    };
    expect(cuerpo.error.codigo).toBe('VALIDACION');
    expect(cuerpo.error.mensaje).toBe('Los datos enviados no son válidos.');
    expect(cuerpo.error.detalles).toEqual(
      expect.arrayContaining([
        { campo: 'nombre', ubicacion: 'body', mensaje: 'El nombre es obligatorio' },
        { campo: 'cantidad', ubicacion: 'body', mensaje: expect.any(String) as unknown },
        { campo: 'detalle', ubicacion: 'query', mensaje: expect.any(String) as unknown },
        { campo: 'id', ubicacion: 'params', mensaje: 'El id debe ser positivo' },
      ]),
    );
    expect(cuerpo.error.detalles).toHaveLength(4);
  });

  it('usa mensajes de Zod en español cuando el esquema no define uno', async () => {
    const res = await request(app).post('/items/1').send({ nombre: 'Caja' });
    const cuerpo = res.body as { error: { detalles: { campo: string; mensaje: string }[] } };
    const detalle = cuerpo.error.detalles.find((d) => d.campo === 'cantidad');
    expect(detalle?.mensaje).toMatch(/entrada inválida|se esperaba/i);
  });

  it('responde 400 si el cuerpo no es un objeto', async () => {
    const res = await request(app)
      .post('/items/1')
      .set('Content-Type', 'application/json')
      .send('[]');
    expect(res.status).toBe(400);
    const cuerpo = res.body as { error: { codigo: string; detalles: { campo: string }[] } };
    expect(cuerpo.error.codigo).toBe('VALIDACION');
    expect(cuerpo.error.detalles[0]?.campo).toBe('body');
  });
});

describe('datosValidados sin validate()', () => {
  it('lanza un error de programación (500 ERROR_INTERNO) si la ruta no pasó por validate', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rutas = Router();
    rutas.get('/sin-validate', (_req, res) => {
      res.json(datosValidados(res, esquemas));
    });

    const res = await request(crearAppDePrueba(rutas)).get('/sin-validate');

    expect(res.status).toBe(500);
    expect((res.body as { error: { codigo: string } }).error.codigo).toBe('ERROR_INTERNO');
    expect(consola).toHaveBeenCalledOnce();
    consola.mockRestore();
  });
});

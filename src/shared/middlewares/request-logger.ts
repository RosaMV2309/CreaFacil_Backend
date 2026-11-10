import type { RequestHandler } from 'express';

/**
 * Registro sencillo de peticiones: `GET /api/v1/health 200 1.2 ms`.
 * Solo registra método, ruta, estado y duración: nunca cabeceras ni cuerpo,
 * para no exponer tokens ni contraseñas (RNF-01). Se desactiva en `NODE_ENV=test`.
 */
export const registroPeticiones: RequestHandler = (req, res, next) => {
  const inicio = process.hrtime.bigint();
  // Sin la query string: puede llevar datos que no deben quedar en los logs.
  const ruta = req.originalUrl.split('?')[0] ?? req.originalUrl;
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    console.info(`${req.method} ${ruta} ${res.statusCode} ${ms.toFixed(1)} ms`);
  });
  next();
};

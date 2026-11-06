import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import type { Env } from './config/env.js';

export function crearApp(env: Env): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/v1', (_req, res) => {
    res.json({ nombre: 'CreaFácil API', version: '0.1.0' });
  });

  return app;
}

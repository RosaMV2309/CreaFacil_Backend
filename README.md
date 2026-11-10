# CreaFacil_Backend

Servidor y API REST de **CreaFácil**: aplicación multiplataforma para la gestión de pedidos,
cotizaciones y planificación de trabajos personalizados (manualidades, decoraciones y murales).

- Tecnología: Node.js + Express 5 + TypeScript (estricto) + PostgreSQL + Prisma
- Especificación: DERCAS v1.0 (Rosa Virginia Moreira Vidal, Sexto B)

## Requisitos

- Node.js 22 o superior (desarrollado con Node 26) y npm 11
- PostgreSQL 17 con una base de datos `creafacil`

## Instalación

```sh
npm install
cp .env.example .env   # en Windows: copy .env.example .env
# edita .env con tu cadena de conexión y un JWT_SECRET aleatorio de 32 caracteres o más
npm run dev
```

La API queda en `http://localhost:3000/api/v1`.

## Variables de entorno

| Variable         | Obligatoria | Descripción                                                      |
| ---------------- | ----------- | ---------------------------------------------------------------- |
| `NODE_ENV`       | No          | `development`, `test` o `production` (por defecto `development`) |
| `PORT`           | No          | Puerto HTTP (por defecto `3000`)                                 |
| `DATABASE_URL`   | Sí          | Cadena de conexión de PostgreSQL                                 |
| `JWT_SECRET`     | Sí          | Secreto para firmar los tokens (32 caracteres o más)             |
| `JWT_EXPIRES_IN` | No          | Duración del token (por defecto `8h`)                            |
| `CORS_ORIGIN`    | No          | Orígenes permitidos, separados por comas                         |

Si falta una variable obligatoria o tiene un formato incorrecto, el servidor no arranca y muestra qué corregir.

## Comandos

| Comando             | Qué hace                                           |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Servidor en modo desarrollo con recarga automática |
| `npm run build`     | Compila TypeScript en `dist/`                      |
| `npm start`         | Ejecuta la versión compilada                       |
| `npm run lint`      | Revisa el código con ESLint                        |
| `npm run format`    | Formatea el código con Prettier                    |
| `npm run typecheck` | Comprueba los tipos sin compilar                   |
| `npm test`          | Ejecuta las pruebas (Vitest + Supertest)           |

## Endpoints

| Método | Ruta             | Descripción                                  |
| ------ | ---------------- | -------------------------------------------- |
| GET    | `/api/v1`        | Nombre y versión de la API                   |
| GET    | `/api/v1/health` | Estado de la API (para monitoreo y las apps) |

Ejemplo de `GET /api/v1/health`:

```json
{
  "estado": "ok",
  "servicio": "CreaFácil API",
  "version": "0.1.0",
  "entorno": "development",
  "marcaTiempo": "2026-11-09T22:45:00.000Z",
  "tiempoActividadSegundos": 12
}
```

> En la subfase 0.4 `/health` también comprobará la conexión con PostgreSQL.

## Formato de errores

Todas las respuestas de error son JSON con la misma forma (RNF-02). `detalles` solo aparece si hay:

```json
{
  "error": {
    "codigo": "VALIDACION",
    "mensaje": "Los datos enviados no son válidos.",
    "detalles": [{ "campo": "nombre", "ubicacion": "body", "mensaje": "El nombre es obligatorio" }]
  }
}
```

| Estado | `codigo`                  | Cuándo                                                  |
| ------ | ------------------------- | ------------------------------------------------------- |
| 400    | `VALIDACION`              | Los datos no cumplen el esquema Zod                     |
| 400    | `JSON_INVALIDO`           | El cuerpo no es un JSON válido                          |
| 401    | `NO_AUTENTICADO`          | Falta el token o no es válido                           |
| 403    | `PROHIBIDO`               | Sin permiso para la acción (RN-05)                      |
| 404    | `NO_ENCONTRADO`           | El recurso no existe                                    |
| 404    | `RUTA_NO_ENCONTRADA`      | La ruta no existe                                       |
| 409    | `CONFLICTO`               | La operación choca con el estado actual                 |
| 413    | `CUERPO_DEMASIADO_GRANDE` | El cuerpo supera 1 MB                                   |
| 500    | `ERROR_INTERNO`           | Error inesperado (se registra en el servidor, sin pila) |

En el código, los servicios lanzan `AppError` con sus fábricas:
`AppError.noEncontrado()`, `AppError.validacion(detalles)`, `AppError.noAutorizado()`,
`AppError.prohibido()`, `AppError.conflicto(mensaje)` y `AppError.noImplementado()`.
El manejador central (`src/shared/errors/error-handler.ts`) los convierte en la respuesta JSON.

## Validación con Zod (`validate`)

Toda entrada se valida en el servidor (RNF-04). En Express 5 `req.query` es de solo lectura,
así que los datos validados se guardan en `res.locals` y se leen con `datosValidados(res, esquemas)`,
que devuelve los tipos inferidos de los esquemas:

```ts
import { z } from 'zod';
import { datosValidados, validate } from '../../shared/middlewares/validate.js';

const esquemas = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({ nombre: z.string().trim().min(1, 'El nombre es obligatorio') }),
};

router.put('/:id', validate(esquemas), (_req, res) => {
  const { params, body } = datosValidados(res, esquemas); // { id: number }, { nombre: string }
  res.json(servicio.actualizar(params.id, body));
});
```

Si algo falla responde 400 `VALIDACION` con un detalle por cada campo de `body`, `query` o `params`.
Los mensajes que no defina el esquema salen en español (`z.locales.es()`).

## Arquitectura por capas (RNF-07)

```
src/
├── app.ts                      # crea la app Express (sin listen; se usa en las pruebas)
├── server.ts                   # arranque del servidor
├── routes.ts                   # router raíz: monta los módulos bajo /api/v1
├── config/
│   ├── env.ts                  # variables de entorno validadas con Zod
│   └── app-info.ts             # nombre y versión de la API
├── shared/
│   ├── errors/                 # AppError, manejador central de errores y 404
│   └── middlewares/
│       ├── validate.ts         # validación de body, query y params con Zod
│       ├── auth.ts             # JWT (esqueleto: se completa en RF-01/RF-02)
│       ├── require-role.ts     # requireRole('ADMIN' | 'CLIENTE') (se aplica en la Fase 1)
│       └── request-logger.ts   # registro de peticiones (desactivado en NODE_ENV=test)
└── modules/
    └── health/
        ├── health.routes.ts      # rutas: conecta las capas
        ├── health.controller.ts  # HTTP: lee req y responde res, sin lógica
        └── health.service.ts     # lógica: no toca req/res
tests/                          # pruebas automáticas (Vitest + Supertest)
```

Flujo de cada petición: **rutas → controlador → servicio → repositorio**. El controlador no tiene
lógica de negocio y el servicio no conoce Express. Los repositorios (acceso a datos con Prisma)
llegan en la subfase 0.4. Cada módulo nuevo se registra en `src/routes.ts`.

## Ramas

- `main`: versiones estables.
- `develop`: integración. Todo cambio entra por Pull Request desde `feature/*`, `fix/*` o `refactor/*`.

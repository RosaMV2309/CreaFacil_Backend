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

## Estructura

```
src/
├── app.ts          # crea la app Express (sin listen; se usa en las pruebas)
├── server.ts       # arranque del servidor
└── config/env.ts   # variables de entorno validadas con Zod
tests/              # pruebas automáticas
```

En las siguientes subfases se añaden `src/shared/` (errores, middlewares, base de datos) y
`src/modules/<módulo>/` (rutas → controlador → servicio → repositorio).

## Ramas

- `main`: versiones estables.
- `develop`: integración. Todo cambio entra por Pull Request desde `feature/*`, `fix/*` o `refactor/*`.

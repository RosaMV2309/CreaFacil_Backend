# CreaFacil_Backend

[![CI](https://github.com/RosaMV2309/CreaFacil_Backend/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/RosaMV2309/CreaFacil_Backend/actions/workflows/ci.yml)

Servidor y API REST de **CreaFácil**: aplicación multiplataforma para la gestión de pedidos,
cotizaciones y planificación de trabajos personalizados (manualidades, decoraciones y murales).

- Tecnología: Node.js + Express 5 + TypeScript (estricto) + PostgreSQL + Prisma
- Especificación: DERCAS v1.0 (Rosa Virginia Moreira Vidal, Sexto B)

## Requisitos

- Node.js 22 o superior (desarrollado con Node 26) y npm 11
- PostgreSQL 17 (servicio encendido) con las bases de datos `creafacil` y `creafacil_test`

## Instalación

```sh
npm install                 # también genera el cliente de Prisma (postinstall)
cp .env.example .env        # en Windows: copy .env.example .env
cp .env.test.example .env.test
# edita .env (DATABASE_URL, JWT_SECRET, ADMIN_*) y .env.test (DATABASE_URL_TEST)
npm run db:migrate          # aplica las migraciones en la BD de desarrollo
npm run db:seed             # crea la administradora y los datos base
npm run dev
```

La API queda en `http://localhost:3000/api/v1`.

## Base de datos (PostgreSQL + Prisma 7)

Se usa **Prisma 7.10.1** (fijado: `prisma`, `@prisma/client` y `@prisma/adapter-pg`; no actualizar a 8.x,
que es preliminar) con el _driver adapter_ `PrismaPg`.

| Archivo                         | Para qué sirve                                                          |
| ------------------------------- | ----------------------------------------------------------------------- |
| `prisma.config.ts`              | Configuración de Prisma 7: schema, migraciones, URL y comando del seed  |
| `prisma/schema.prisma`          | Modelo de datos (el datasource solo lleva `provider`)                   |
| `prisma/migrations/`            | Migraciones versionadas en Git                                          |
| `prisma/seed.ts`                | Punto de entrada del seed (`npm run db:seed`)                           |
| `prisma/seed-datos.ts`          | Datos base y función idempotente del seed (también la usan las pruebas) |
| `src/shared/database/prisma.ts` | Cliente Prisma único de la aplicación                                   |
| `src/generated/prisma/`         | Cliente generado. **No se versiona**: se genera con `prisma generate`   |

### 1. Crear las bases de datos

```sh
# Windows (PowerShell): $env:PGPASSWORD="tu-clave"
psql -U postgres -h localhost -c "CREATE DATABASE creafacil;"
psql -U postgres -h localhost -c "CREATE DATABASE creafacil_test;"
```

### 2. Migrar

```sh
npm run db:migrate                              # desarrollo: prisma migrate dev
npm run db:migrate -- --name descripcion-cambio # tras modificar schema.prisma
npm run db:deploy                               # producción/CI: prisma migrate deploy
npx prisma migrate status                       # debe decir "Database schema is up to date"
```

La migración inicial añade en SQL restricciones `CHECK` que Prisma no modela (importes no negativos,
entrega posterior al inicio y pedido con origen). Prisma no las borra en migraciones posteriores.

### 3. Generar el cliente

Decisión: el script `postinstall` ejecuta `prisma generate`, así que `npm install` y `npm ci`
(también en la CI) generan siempre el cliente; no necesita conexión a la base de datos.
Prisma 7 **no** lo regenera solo tras `migrate dev`: después de cambiar el schema ejecuta
`npm run prisma:generate`.

### 4. Seed

```sh
npm run db:seed   # = npx prisma db seed → tsx prisma/seed.ts
```

Es **idempotente** (upsert): puede ejecutarse varias veces sin duplicar nada. Crea:

- la administradora con `ADMIN_EMAIL`, `ADMIN_NOMBRE` y `ADMIN_PASSWORD` guardada como hash bcrypt
  (coste 12). Si ya existe, actualiza nombre, rol y estado, pero **no** cambia su contraseña;
- las categorías del DERCAS: _Manualidades con fomix_, _Decoraciones_ y _Murales_;
- materiales de ejemplo en dólares (fomix, pintura acrílica, silicona y cartulina); si ya existen no se tocan;
- una configuración de precios vigente (mano de obra 5,00 USD/h; factores 1,00 / 1,25 / 1,50), solo si no hay ninguna.

Para explorar los datos: `npm run db:studio` (Prisma Studio en el navegador) o
`psql -U postgres -h localhost -d creafacil -c "\dt"`.

## Modelo de datos (RNF-08)

Tablas en `snake_case` (`@@map`/`@map`); ids UUID; importes en `Decimal(12,2)` (nunca `Float`);
`createdAt`/`updatedAt` en todas las entidades principales.

| Modelo (tabla)                                                 | Contenido                                                                    | Requisitos               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------ |
| `Usuario` (`usuarios`)                                         | nombre, email único, `passwordHash`, teléfono, `rol`, `activo`               | RF-01, RF-02, RNF-01     |
| `Categoria` (`categorias`)                                     | nombre único, descripción, `activa`, `orden`                                 | RF-03, RF-22             |
| `Servicio` (`servicios`)                                       | categoría, descripción, dimensiones orientativas, observaciones, `activo`    | RF-03, RF-04, RF-05      |
| `ImagenServicio` (`imagenes_servicio`)                         | fotografías de referencia con su orden                                       | RF-04                    |
| `ServicioMaterial` (`servicios_materiales`)                    | materiales habituales del servicio                                           | RF-04                    |
| `Material` (`materiales`)                                      | nombre único, unidad, `precioUnitario` (Decimal), `activo`                   | RF-08, RF-22             |
| `ConfiguracionPrecios` (`configuraciones_precios`)             | mano de obra por hora, factor BAJA/MEDIA/ALTA, vigencia                      | RF-08                    |
| `Cotizacion` (`cotizaciones`)                                  | dimensiones, cantidad, detalles, complejidad, valores copiados, `esEstimada` | RF-06, 07, 09, 11, RN-01 |
| `DetalleCotizacionMaterial` (`detalles_cotizacion_materiales`) | cantidad y precio unitario **copiado** al calcular                           | RF-06, RF-07             |
| `Solicitud` (`solicitudes`)                                    | descripción, fecha deseada, cotización opcional, estado                      | RF-10, RF-21, RF-19      |
| `ImagenSolicitud` (`imagenes_solicitud`)                       | imágenes de referencia del cliente                                           | RF-10                    |
| `Pedido` (`pedidos`)                                           | origen único, `precioAcordado` copiado, fechas previstas, duración, estado   | RF-12, 13, 15-17, RN-02  |
| `HistorialEstadoPedido` (`historial_estados_pedido`)           | estado anterior y nuevo, usuario, comentario, fecha                          | RF-13                    |
| `Notificacion` (`notificaciones`)                              | tipo, título, mensaje, `leida`, referencia                                   | RF-20                    |
| `DispositivoFcm` (`dispositivos_fcm`)                          | token FCM único y plataforma                                                 | RF-20, RNF-09            |

Enums: `Rol` (CLIENTE, ADMIN), `NivelComplejidad` (BAJA, MEDIA, ALTA), `EstadoCotizacion` y
`EstadoSolicitud` (PENDIENTE, ENVIADA, ACEPTADA, RECHAZADA), `EstadoPedido` (PENDIENTE, EN_PROCESO,
LISTO, ENTREGADO, CANCELADO), `TipoNotificacion` (COTIZACION_DISPONIBLE, PEDIDO_ACEPTADO,
CAMBIO_ESTADO_PEDIDO, ENTREGA_PROXIMA) y `PlataformaDispositivo` (ANDROID, WEB, IOS).

Decisiones clave:

- **RF-07 reproducible:** la cotización guarda qué configuración usó y copia la tarifa, el factor
  y el precio de cada material; recalcularla con esos datos da siempre el mismo valor.
- **RF-08 versionado:** un cambio de tarifa crea una `ConfiguracionPrecios` nueva y cierra la anterior
  (`vigenteHasta`); la vigente es la que tiene `vigenteHasta = null`. Solo afecta a cotizaciones nuevas.
- **RN-02:** `Pedido.precioAcordado` es una copia, no una relación con los precios de los materiales.
- **RF-05:** servicios, materiales, categorías y usuarios se desactivan; las relaciones usan
  `onDelete: Restrict` para no perder historial (las imágenes y detalles se borran en cascada).

## Variables de entorno

| Variable         | Obligatoria | Descripción                                                      |
| ---------------- | ----------- | ---------------------------------------------------------------- |
| `NODE_ENV`       | No          | `development`, `test` o `production` (por defecto `development`) |
| `PORT`           | No          | Puerto HTTP (por defecto `3000`)                                 |
| `DATABASE_URL`   | Sí          | Cadena de conexión de PostgreSQL                                 |
| `JWT_SECRET`     | Sí          | Secreto para firmar los tokens (32 caracteres o más)             |
| `JWT_EXPIRES_IN` | No          | Duración del token (por defecto `8h`)                            |
| `CORS_ORIGIN`    | No          | Orígenes permitidos, separados por comas                         |
| `ADMIN_EMAIL`    | Seed        | Correo de la administradora inicial                              |
| `ADMIN_PASSWORD` | Seed        | Contraseña inicial (8 a 72 caracteres; se guarda como hash)      |
| `ADMIN_NOMBRE`   | No          | Nombre de la administradora (por defecto `Administradora`)       |

Si falta una variable obligatoria o tiene un formato incorrecto, el servidor no arranca y muestra qué corregir.
Las variables `ADMIN_*` solo las exige el seed (`cargarEnvSeed`): el servidor no necesita la contraseña inicial.

Las pruebas de integración leen `DATABASE_URL_TEST` de `.env.test` (ignorado por Git; plantilla en
`.env.test.example`) o del entorno. Por seguridad, el nombre de esa base de datos debe terminar en `_test`.

## Comandos

| Comando                    | Qué hace                                           |
| -------------------------- | -------------------------------------------------- |
| `npm run dev`              | Servidor en modo desarrollo con recarga automática |
| `npm run build`            | Compila TypeScript en `dist/`                      |
| `npm start`                | Ejecuta la versión compilada                       |
| `npm run lint`             | Revisa el código con ESLint                        |
| `npm run format`           | Formatea el código con Prettier                    |
| `npm run typecheck`        | Comprueba los tipos sin compilar                   |
| `npm test`                 | Ejecuta todas las pruebas (Vitest + Supertest)     |
| `npm run test:unit`        | Solo las pruebas unitarias (sin base de datos)     |
| `npm run test:integracion` | Solo las de integración (contra `creafacil_test`)  |
| `npm run test:coverage`    | Todas las pruebas con informe de cobertura         |
| `npm run test:postman`     | Colección de Postman con newman (servidor en 3000) |
| `npm run prisma:generate`  | Genera el cliente de Prisma                        |
| `npm run db:migrate`       | Crea/aplica migraciones en desarrollo              |
| `npm run db:deploy`        | Aplica las migraciones pendientes (CI/producción)  |
| `npm run db:seed`          | Carga los datos base (idempotente)                 |
| `npm run db:studio`        | Abre Prisma Studio para ver los datos              |

## Endpoints

| Método | Ruta             | Descripción                      |
| ------ | ---------------- | -------------------------------- |
| GET    | `/api/v1`        | Nombre y versión de la API       |
| GET    | `/api/v1/health` | Estado de la API y de PostgreSQL |

`GET /api/v1/health` comprueba la base de datos con `SELECT 1` (rutas → controlador → servicio →
repositorio). Si responde, devuelve **200**:

```json
{
  "estado": "ok",
  "servicio": "CreaFácil API",
  "version": "0.1.0",
  "entorno": "development",
  "baseDatos": "ok",
  "marcaTiempo": "2026-11-10T22:45:00.000Z",
  "tiempoActividadSegundos": 12
}
```

Si PostgreSQL no responde (o tarda más de 3 s), devuelve **503** con `"estado": "degradado"` y
`"baseDatos": "error"`. El motivo solo se registra en la consola del servidor; nunca se envía al cliente.

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
│   ├── database/prisma.ts      # cliente Prisma único (adapter PrismaPg)
│   ├── errors/                 # AppError, manejador central de errores y 404
│   ├── security/password.ts    # hash y verificación de contraseñas con bcrypt (RNF-01)
│   └── middlewares/
│       ├── validate.ts         # validación de body, query y params con Zod
│       ├── auth.ts             # JWT (esqueleto: se completa en RF-01/RF-02)
│       ├── require-role.ts     # requireRole('ADMIN' | 'CLIENTE') (se aplica en la Fase 1)
│       └── request-logger.ts   # registro de peticiones (desactivado en NODE_ENV=test)
├── generated/prisma/           # cliente generado por Prisma (no se versiona)
└── modules/
    └── health/
        ├── health.routes.ts      # rutas: conecta las capas
        ├── health.controller.ts  # HTTP: lee req y responde res, sin lógica
        ├── health.service.ts     # lógica: no toca req/res ni Prisma
        └── health.repository.ts  # acceso a datos: SELECT 1 con Prisma
prisma/                         # schema, migraciones y seed
tests/                          # pruebas unitarias (Vitest + Supertest)
└── integracion/                # pruebas contra creafacil_test (global-setup aplica migraciones)
```

Flujo de cada petición: **rutas → controlador → servicio → repositorio**. El controlador no tiene
lógica de negocio, el servicio no conoce Express y solo el repositorio usa Prisma. `crearApp(env, { prisma })`
recibe el cliente inyectado, de modo que las pruebas eligen la base de datos. Al recibir SIGINT o SIGTERM,
`server.ts` deja de aceptar peticiones y cierra las conexiones con PostgreSQL antes de salir.
Cada módulo nuevo se registra en `src/routes.ts`.

## Pruebas (RNF-07; DERCAS §6)

| Tipo        | Dónde                                                   | Cómo se ejecuta            |
| ----------- | ------------------------------------------------------- | -------------------------- |
| Unitarias   | `tests/*.test.ts` (sin base de datos)                   | `npm run test:unit`        |
| Integración | `tests/integracion/*.test.ts` (contra `creafacil_test`) | `npm run test:integracion` |
| Todas       | Vitest + Supertest                                      | `npm test`                 |
| Cobertura   | Informe en `coverage/`                                  | `npm run test:coverage`    |
| Postman     | `postman/` (colección + entornos)                       | `npm run test:postman`     |

- **Unitarias**: capas, contrato de errores (404, 400 `JSON_INVALIDO`, 413, 415, 500, 503 degradado),
  401/403 de `auth` y `requireRole`, validación con Zod, variables de entorno y hash de contraseñas.
- **Integración**: necesitan `.env.test` con `DATABASE_URL_TEST` (copia `.env.test.example`). Por seguridad,
  el nombre de la base de datos **debe terminar en `_test`**; el `globalSetup` aplica las migraciones antes.
- **Cobertura** (`@vitest/coverage-v8`): mide solo `src/`, sin `src/generated/` (cliente de Prisma) ni
  `src/server.ts` (arranque; se comprueba con newman en la CI). Umbrales mínimos: **80 %** de líneas,
  sentencias y funciones y **75 %** de ramas; si no se alcanzan, el comando (y la CI) falla.
  El informe HTML queda en `coverage/index.html`.
- **Postman**: con el servidor en marcha (`npm run dev`), `npm run test:postman` ejecuta la colección con
  newman (descargado con `npx` en la versión fijada 6.2.3; no es dependencia del proyecto). Cómo importarla
  en la app de Postman: [`postman/README.md`](postman/README.md).

## Integración continua (GitHub Actions)

El flujo [`.github/workflows/ci.yml`](.github/workflows/ci.yml) se ejecuta en cada push a `develop` y `main`
y en cada pull request, en `ubuntu-latest` con **Node.js 24 LTS** y un servicio **PostgreSQL 17**:

1. `npm ci` (con caché de npm). Los scripts de instalación permitidos están en `allowScripts`
   (`esbuild`, `prisma`, `@prisma/engines`); el `postinstall` genera el cliente de Prisma y un paso lo comprueba.
2. Crea `creafacil_test` y aplica las migraciones en las dos bases de datos (`prisma migrate deploy`).
3. `lint`, `typecheck`, `format:check` y `build`.
4. `test:coverage` (sube el informe `cobertura` como artefacto).
5. Arranca el servidor compilado (`npm start`), espera a `/health`, ejecuta `db:seed` y la colección de
   Postman con newman (informe JUnit como artefacto `newman`). Si algo falla, sube `servidor.log`.

Las variables de la CI son **de prueba** (no hay secretos reales). Los resultados se ven en la pestaña
**Actions** del repositorio y en el badge del inicio de este README.

## Ramas

- `main`: versiones estables.
- `develop`: integración. Todo cambio entra por Pull Request desde `feature/*`, `fix/*` o `refactor/*`.

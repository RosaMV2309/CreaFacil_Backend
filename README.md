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

| Variable                | Obligatoria | Descripción                                                                                |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`              | No          | `development`, `test` o `production` (por defecto `development`)                           |
| `PORT`                  | No          | Puerto HTTP (por defecto `3000`)                                                           |
| `DATABASE_URL`          | Sí          | Cadena de conexión de PostgreSQL                                                           |
| `JWT_SECRET`            | Sí          | Secreto para firmar los tokens (32 caracteres o más)                                       |
| `JWT_EXPIRES_IN`        | No          | Duración del token: número + `s`/`m`/`h`/`d` (por defecto `8h`)                            |
| `CORS_ORIGIN`           | No          | Orígenes permitidos, separados por comas                                                   |
| `LOGIN_MAX_INTENTOS`    | No          | Intentos fallidos de inicio de sesión por IP (por defecto `5`; `1000` con `NODE_ENV=test`) |
| `LOGIN_VENTANA_MINUTOS` | No          | Ventana del límite de intentos en minutos, de 1 a 1440 (por defecto `15`)                  |
| `UPLOADS_DIR`           | No          | Carpeta de las fotos del catálogo (por defecto `uploads`, ignorada por Git)                |
| `PUBLIC_BASE_URL`       | No          | Origen público de la API para las URL de las fotos (por defecto `http://localhost:<PORT>`) |
| `ADMIN_EMAIL`           | Seed        | Correo de la administradora inicial                                                        |
| `ADMIN_PASSWORD`        | Seed        | Contraseña inicial (8 a 72 caracteres; se guarda como hash)                                |
| `ADMIN_NOMBRE`          | No          | Nombre de la administradora (por defecto `Administradora`)                                 |

Si falta una variable obligatoria o tiene un formato incorrecto, el servidor no arranca y muestra qué corregir.
Las variables `ADMIN_*` solo las exige el seed (`cargarEnvSeed`): el servidor no necesita la contraseña inicial.

Las pruebas de integración leen `DATABASE_URL_TEST` de `.env.test` (ignorado por Git; plantilla en
`.env.test.example`) o del entorno. Por seguridad, el nombre de esa base de datos debe terminar en `_test`.

## Comandos

| Comando                      | Qué hace                                               |
| ---------------------------- | ------------------------------------------------------ |
| `npm run dev`                | Servidor en modo desarrollo con recarga automática     |
| `npm run build`              | Compila TypeScript en `dist/`                          |
| `npm start`                  | Ejecuta la versión compilada                           |
| `npm run lint`               | Revisa el código con ESLint                            |
| `npm run format`             | Formatea el código con Prettier                        |
| `npm run typecheck`          | Comprueba los tipos sin compilar                       |
| `npm test`                   | Ejecuta todas las pruebas (Vitest + Supertest)         |
| `npm run test:unit`          | Solo las pruebas unitarias (sin base de datos)         |
| `npm run test:integracion`   | Solo las de integración (contra `creafacil_test`)      |
| `npm run test:coverage`      | Todas las pruebas con informe de cobertura             |
| `npm run test:postman`       | Colección de Postman con newman (servidor en 3000)     |
| `npm run prisma:generate`    | Genera el cliente de Prisma                            |
| `npm run db:migrate`         | Crea/aplica migraciones en desarrollo                  |
| `npm run db:deploy`          | Aplica las migraciones pendientes (CI/producción)      |
| `npm run db:seed`            | Carga los datos base (idempotente)                     |
| `npm run db:limpiar-pruebas` | Borra los clientes de prueba de newman (ver «Pruebas») |
| `npm run db:studio`          | Abre Prisma Studio para ver los datos                  |

## Endpoints

| Método | Ruta                             | Autenticación  | Descripción                                  |
| ------ | -------------------------------- | -------------- | -------------------------------------------- |
| GET    | `/api/v1`                        | No             | Nombre y versión de la API                   |
| GET    | `/api/v1/health`                 | No             | Estado de la API y de PostgreSQL             |
| POST   | `/api/v1/auth/registro`          | No             | Registro de clientes (RF-01)                 |
| POST   | `/api/v1/auth/login`             | No             | Inicio de sesión (clientes y ADMIN)          |
| GET    | `/api/v1/auth/perfil`            | Bearer         | Datos de la persona autenticada (RF-01)      |
| PATCH  | `/api/v1/auth/perfil`            | Bearer         | Editar el propio nombre y teléfono (RF-01)   |
| GET    | `/api/v1/admin/clientes`         | Bearer + ADMIN | Listado paginado de clientes (RF-02)         |
| GET    | `/api/v1/admin/categorias`       | Bearer + ADMIN | Categorías con recuento de servicios (RF-22) |
| POST   | `/api/v1/admin/categorias`       | Bearer + ADMIN | Crear una categoría (RF-22)                  |
| GET    | `/api/v1/admin/categorias/:id`   | Bearer + ADMIN | Una categoría (RF-22)                        |
| PATCH  | `/api/v1/admin/categorias/:id`   | Bearer + ADMIN | Editar, activar o desactivar (RF-22, RF-05)  |
| GET    | `/api/v1/admin/materiales`       | Bearer + ADMIN | Materiales paginados (RF-22, RF-08)          |
| POST   | `/api/v1/admin/materiales`       | Bearer + ADMIN | Crear un material con su precio (RF-08)      |
| GET    | `/api/v1/admin/materiales/:id`   | Bearer + ADMIN | Un material (RF-22)                          |
| PATCH  | `/api/v1/admin/materiales/:id`   | Bearer + ADMIN | Editar precio, unidad, activar o desactivar  |
| GET    | `/api/v1/catalogo`               | No             | Catálogo público por categorías (RF-03)      |
| GET    | `/api/v1/catalogo/servicios/:id` | No             | Ficha pública de un servicio (RF-04)         |

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

## Autenticación (RF-01, RF-02, RNF-01)

Sesiones con **JWT** firmados con HS256 (`JWT_SECRET`), emisor `creafacil-api` y audiencia
`creafacil-app`. El token dura **8 horas** (`JWT_EXPIRES_IN`) y **no hay refresh token**: al expirar,
la persona vuelve a iniciar sesión. El payload solo lleva `sub` (UUID del usuario) y `rol`.
Las contraseñas se guardan con bcrypt (coste 12) y nunca se devuelven ni se registran en los logs.

- El **registro público solo crea clientes** (`rol: "CLIENTE"`). Si el cuerpo incluye `rol`, se
  responde 400 (no se ignora en silencio). La **administradora** solo se crea con el seed
  (`ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`) e inicia sesión con esas credenciales.
- No hay recuperación de contraseña en la v1.

### Cómo usar el token

Envía el token en la cabecera de cada petición protegida:

```
Authorization: Bearer <token>
```

### `POST /api/v1/auth/registro`

```json
{
  "nombre": "María Pérez",
  "email": "maria@example.com",
  "password": "Clave-Segura-2026",
  "telefono": "+593 99 123 4567"
}
```

| Campo      | Reglas                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nombre`   | Obligatorio, de 2 a 120 caracteres (se quitan los espacios de los extremos)                                                                                                     |
| `email`    | Obligatorio, correo válido; se guarda sin espacios y en minúsculas                                                                                                              |
| `password` | Obligatoria, de 8 a 72 caracteres (y como máximo 72 bytes: es el límite de bcrypt)                                                                                              |
| `telefono` | Opcional: `+` opcional y de 7 a 15 dígitos; se admiten espacios, guiones y paréntesis, que se eliminan (`"+593 99 123 4567"` → `"+593991234567"`). `""` o `null` = sin teléfono |
| `rol`      | **No se admite**: cualquier valor devuelve 400                                                                                                                                  |

Respuesta **201** (la misma forma que el inicio de sesión):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "tipo": "Bearer",
  "expiraEn": "2026-11-14T11:28:09.000Z",
  "usuario": {
    "id": "8d7fdcbc-0e64-49df-895b-b89c21dca0f5",
    "nombre": "María Pérez",
    "email": "maria@example.com",
    "telefono": "+593991234567",
    "rol": "CLIENTE"
  }
}
```

`expiraEn` es la fecha y hora ISO 8601 (UTC) en que caduca el token. `usuario.id` es un UUID (texto).

### `POST /api/v1/auth/login`

```json
{ "email": "maria@example.com", "password": "Clave-Segura-2026" }
```

Respuesta **200** con `{ token, tipo, expiraEn, usuario }` (igual que el registro; para la
administradora, `usuario.rol` es `"ADMIN"`).

### `GET /api/v1/auth/perfil`

Requiere `Authorization: Bearer <token>`. Lee los datos de la base de datos con el id del token
(nunca con un id enviado por el cliente, RN-05). Respuesta **200**:

```json
{
  "usuario": {
    "id": "8d7fdcbc-0e64-49df-895b-b89c21dca0f5",
    "nombre": "María Pérez",
    "email": "maria@example.com",
    "telefono": "+593991234567",
    "rol": "CLIENTE"
  }
}
```

### Errores de autenticación

| Estado | `codigo`                 | Cuándo                                                                                            |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------- |
| 400    | `VALIDACION`             | Datos inválidos (con `detalles` por campo), incluido enviar `rol` en el registro                  |
| 401    | `CREDENCIALES_INVALIDAS` | «Correo o contraseña incorrectos.»: el MISMO mensaje si el correo no existe o la contraseña falla |
| 401    | `NO_AUTENTICADO`         | Falta el token (o la cuenta del token ya no existe o fue desactivada)                             |
| 401    | `TOKEN_INVALIDO`         | Token con firma incorrecta, alterado, de otro emisor/audiencia o mal formado                      |
| 401    | `TOKEN_EXPIRADO`         | El token caducó (pasaron las 8 h): hay que iniciar sesión de nuevo                                |
| 403    | `CUENTA_DESACTIVADA`     | La cuenta está desactivada (solo se indica si la contraseña es correcta)                          |
| 409    | `CONFLICTO`              | «Ya existe una cuenta con ese correo.» (registro)                                                 |
| 429    | `DEMASIADOS_INTENTOS`    | Se superó el límite de intentos de inicio de sesión (con cabecera `Retry-After`)                  |

Decisiones de seguridad:

- **No se revela qué cuentas existen** al iniciar sesión: correo inexistente y contraseña incorrecta
  devuelven el mismo cuerpo, y con un correo inexistente se compara igualmente contra un hash bcrypt
  ficticio para que la respuesta tarde lo mismo. En el registro sí se indica el correo duplicado
  (409): es inevitable para que la persona sepa que debe iniciar sesión.
- Una cuenta desactivada solo recibe 403 si la contraseña es correcta; con una contraseña incorrecta
  recibe el 401 genérico.

### Límite de intentos de inicio de sesión

`POST /auth/login` admite **5 intentos fallidos cada 15 minutos por IP** (configurable con
`LOGIN_MAX_INTENTOS` y `LOGIN_VENTANA_MINUTOS`). Solo cuentan los intentos fallidos: un inicio de
sesión correcto no consume intentos. Al superarlo, la API responde **429** con el código
`DEMASIADOS_INTENTOS`, el mensaje «Demasiados intentos de inicio de sesión. Inténtalo de nuevo en
N minutos.» y las cabeceras `Retry-After` (segundos) y `RateLimit`/`RateLimit-Policy`. Mientras dura
el bloqueo se rechazan todos los intentos de esa IP, también los correctos. El registro no está sujeto
a este límite.

- Los contadores se guardan **en memoria**: se reinician al reiniciar el servidor.
- Con `NODE_ENV=test` y sin `LOGIN_MAX_INTENTOS` explícito, el límite por defecto es 1000, para que las
  pruebas no se bloqueen; la CI fija `LOGIN_MAX_INTENTOS=1000`.
- **newman en local**: cada ejecución de la colección hace 1 inicio de sesión fallido a propósito. Con
  el límite por defecto puedes ejecutarla 5 veces seguidas en 15 minutos; para más, reinicia
  `npm run dev` o pon `LOGIN_MAX_INTENTOS=50` en tu `.env`.
- Si en producción la API queda detrás de un proxy inverso, habrá que configurar `trust proxy` para
  que se use la IP real del cliente.

## Permisos por rol (RF-02, RNF-03, RN-05)

Hay dos roles: `CLIENTE` y `ADMIN`. Los permisos se comprueban **siempre en el servidor** con el rol
del token firmado (no se puede falsificar: un token alterado da 401 `TOKEN_INVALIDO`).

| Situación                                           | Respuesta                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| Ruta protegida sin token                            | **401** `NO_AUTENTICADO` «Debes iniciar sesión para continuar.»    |
| Cliente en una ruta de la administradora            | **403** `PROHIBIDO` «No tienes permiso para realizar esta acción.» |
| Cliente que pide un recurso de otra persona (RN-05) | **404** `NO_ENCONTRADO` (no se revela que el recurso existe)       |

### Patrón RN-05: «el cliente solo ve lo suyo»

El id de la persona sale **siempre del token**, nunca de la URL, del cuerpo ni de la query.
`src/shared/middlewares/usuario-actual.ts` ofrece dos piezas para las fases siguientes
(solicitudes, cotizaciones, pedidos, notificaciones):

```ts
// Controlador: el id del token (401 si la ruta no pasó por auth)
const usuarioId = idUsuarioActual(res);

// Repositorio: filtrar SIEMPRE por ese id
prisma.pedido.findMany({ where: { usuarioId } });

// Detalle por id: 404 si no existe o es de otra persona (mismo mensaje en ambos casos)
const pedido = exigirPropietario(await repositorio.buscar(id), usuarioId, 'El pedido no existe.');
```

`PATCH /auth/perfil` ya lo aplica: actualiza la persona del token y rechaza cualquier `id` en el cuerpo.

## Editar el perfil (RF-01, RN-05)

### `PATCH /api/v1/auth/perfil`

Requiere `Authorization: Bearer <token>` (clientes y administradora). Solo cambia **tu** perfil.

```json
{ "nombre": "María Pérez Vidal", "telefono": "+593 98 765 4321" }
```

| Campo      | Reglas                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------- |
| `nombre`   | Opcional, de 2 a 120 caracteres (se quitan los espacios de los extremos)                     |
| `telefono` | Opcional, mismo formato que el registro. **`null` o `""` borran el teléfono**                |
| otro campo | **No se admite** (`email`, `rol`, `password`, `id`, `activo`…): 400 con un detalle por campo |

Debe llegar al menos uno de los dos campos. Respuesta **200** con la misma forma que `GET /auth/perfil`:

```json
{
  "usuario": {
    "id": "8d7fdcbc-0e64-49df-895b-b89c21dca0f5",
    "nombre": "María Pérez Vidal",
    "email": "maria@example.com",
    "telefono": "+593987654321",
    "rol": "CLIENTE"
  }
}
```

Ejemplo de **400** al intentar cambiar el rol (`{ "nombre": "María", "rol": "ADMIN" }`):

```json
{
  "error": {
    "codigo": "VALIDACION",
    "mensaje": "Los datos enviados no son válidos.",
    "detalles": [
      {
        "campo": "rol",
        "ubicacion": "body",
        "mensaje": "Este campo no se puede modificar: solo se pueden cambiar nombre y telefono"
      }
    ]
  }
}
```

| Estado | `codigo`                                               | Cuándo                                                                      |
| ------ | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| 400    | `VALIDACION`                                           | Sin campos, nombre o teléfono inválidos, o un campo que no se puede cambiar |
| 401    | `NO_AUTENTICADO` / `TOKEN_INVALIDO` / `TOKEN_EXPIRADO` | Sin token, token no válido o caducado, o cuenta borrada o desactivada       |

El correo y la contraseña no se cambian en esta versión (sin recuperación de contraseña en la v1).

## Rutas de la administradora (RF-02, RNF-03)

Todas las rutas administrativas cuelgan de **`/api/v1/admin`**. El grupo, definido en
`src/modules/admin/admin.routes.ts`, aplica `auth` + `requireRole('ADMIN')` **una sola vez** a todo
`/admin`, antes de cualquier ruta. Por eso:

- Ninguna ruta administrativa puede quedar sin proteger por olvido.
- Incluso una ruta inexistente bajo `/admin` responde 401/403 a quien no es administradora.

**Cómo añadir una sección en las fases siguientes** (categorías, materiales, precios, pedidos…):
crea su router (sin repetir `auth` ni `requireRole`) y regístralo en `MODULOS_ADMIN`:

```ts
export const MODULOS_ADMIN: readonly ModuloAdmin[] = [
  { prefijo: '/clientes', crearRouter: ({ prisma }) => crearClientesAdminRouter(prisma) },
  { prefijo: '/categorias', crearRouter: ({ prisma }) => crearCategoriasAdminRouter(prisma) },
];
```

Nunca montes rutas administrativas fuera de este grupo. La prueba `tests/admin-rutas.test.ts`
recorre todas las rutas de `MODULOS_ADMIN` y comprueba que dan **401 sin token y 403 con un token de
cliente**; si un módulo anida otro router, la prueba falla y pide registrarlo como módulo propio.

### `GET /api/v1/admin/clientes`

Listado de las cuentas con rol `CLIENTE`, de la más reciente a la más antigua.

| Parámetro   | Reglas                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------- |
| `pagina`    | Entero desde 1 (por defecto 1). Una página sin resultados devuelve `datos: []`           |
| `porPagina` | Entero de 1 a 100 (por defecto 20)                                                       |
| `q`         | Opcional: busca en el nombre o el correo sin distinguir mayúsculas (máx. 100 caracteres) |

Ejemplo: `GET /api/v1/admin/clientes?q=maria&pagina=1&porPagina=20` → **200**:

```json
{
  "datos": [
    {
      "id": "8d7fdcbc-0e64-49df-895b-b89c21dca0f5",
      "nombre": "María Pérez Vidal",
      "email": "maria@example.com",
      "telefono": "+593987654321",
      "activo": true,
      "creadoEn": "2026-11-13T15:20:00.000Z"
    }
  ],
  "paginacion": { "pagina": 1, "porPagina": 20, "total": 1, "totalPaginas": 1 }
}
```

Nunca devuelve contraseñas ni hashes. `{ datos, paginacion }` será la forma común de los listados
paginados de la API.

| Estado | `codigo`         | Cuándo                                                            |
| ------ | ---------------- | ----------------------------------------------------------------- |
| 400    | `VALIDACION`     | `pagina` o `porPagina` no válidos, `q` repetido o demasiado largo |
| 401    | `NO_AUTENTICADO` | Sin token (o token no válido o caducado)                          |
| 403    | `PROHIBIDO`      | El token es de un cliente                                         |

## Catálogo · Administración (RF-22, RF-08, RF-05, RF-03)

Gestión de **categorías** y **materiales** por la administradora (Fase 2 · 2.1). Todas las rutas van en el
grupo `/api/v1/admin` (registradas en `MODULOS_ADMIN`): exigen `Authorization: Bearer <token de la ADMIN>`;
sin token → 401 `NO_AUTENTICADO`; con token de cliente → 403 `PROHIBIDO`. Capas: rutas → controlador →
servicio → repositorio (`src/modules/categorias` y `src/modules/materiales`).

Decisiones:

- **Solo se desactiva, nunca se borra.** No hay `DELETE` (ni `PUT`): un `DELETE /admin/categorias/:id` o
  `/admin/materiales/:id` responde **404 `RUTA_NO_ENCONTRADA`**, como cualquier ruta inexistente. Así se
  conserva el historial de cotizaciones y pedidos. Se desactiva con `PATCH { "activa": false }` (categoría) o
  `PATCH { "activo": false }` (material).
- Una categoría desactivada **no desactiva sus servicios**: el catálogo público (subfase 2.3) los ocultará.
  Para que el panel pueda avisar, cada categoría trae `serviciosActivos` y `serviciosTotales`.
- **Nombre único** sin distinguir mayúsculas y tras recortar y reducir los espacios
  (`"  [x]  Murales "` → `"[x] Murales"`). Duplicado → **409 `CONFLICTO`** con un detalle en `nombre`.
- Cuerpos **estrictos**: un campo desconocido (`id`, `creadoEn`, `stock`…) → 400 con un detalle por campo.
  En `PATCH` se envía cualquier subconjunto de campos, pero al menos uno.
- Id que no es UUID → **400** (detalle `{ campo: "id", ubicacion: "params" }`); id inexistente → **404
  `NO_ENCONTRADO`** («La categoría no existe.» / «El material no existe.»).
- Fechas en ISO 8601 (UTC): `creadoEn`, `actualizadoEn`. Nunca se devuelven campos internos.

### Categorías: `/api/v1/admin/categorias`

| Método | Ruta   | Cuerpo / query                                                                                                       | Respuesta              |
| ------ | ------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| GET    | `/`    | `?activa=true\|false` y `?q=` (busca en el nombre) opcionales; sin paginación                                        | 200 `{ datos: [...] }` |
| GET    | `/:id` | —                                                                                                                    | 200 `{ categoria }`    |
| POST   | `/`    | `{ nombre (2–80), descripcion? (≤ 500, null o "" = sin descripción), orden? (0–9999, def. 0), activa? (def. true) }` | 201 `{ categoria }`    |
| PATCH  | `/:id` | Cualquier subconjunto de los campos de POST (al menos uno)                                                           | 200 `{ categoria }`    |

El listado se ordena por `orden` y después por `nombre`.

```http
POST /api/v1/admin/categorias
Authorization: Bearer <token de la ADMIN>
Content-Type: application/json

{ "nombre": "Cuadros decorativos", "descripcion": "Cuadros pintados a mano", "orden": 4 }
```

```json
{
  "categoria": {
    "id": "4bd892cb-f2a6-4c9b-84e6-3c3188a89208",
    "nombre": "Cuadros decorativos",
    "descripcion": "Cuadros pintados a mano",
    "activa": true,
    "orden": 4,
    "serviciosActivos": 0,
    "serviciosTotales": 0,
    "creadoEn": "2026-11-19T03:31:37.126Z",
    "actualizadoEn": "2026-11-19T03:31:37.126Z"
  }
}
```

### Materiales: `/api/v1/admin/materiales`

| Método | Ruta   | Cuerpo / query                                                                                | Respuesta                   |
| ------ | ------ | --------------------------------------------------------------------------------------------- | --------------------------- |
| GET    | `/`    | `?pagina` (def. 1), `?porPagina` (1–100, def. 20), `?q=` (nombre), `?activo=true\|false`      | 200 `{ datos, paginacion }` |
| GET    | `/:id` | —                                                                                             | 200 `{ material }`          |
| POST   | `/`    | `{ nombre (2–80), unidad (1–30), precioUnitario, descripcion? (≤ 500), activo? (def. true) }` | 201 `{ material }`          |
| PATCH  | `/:id` | Cualquier subconjunto de los campos de POST (al menos uno)                                    | 200 `{ material }`          |

El listado se ordena por nombre. `unidad` es la unidad de medida o de compra: «plancha», «litro»,
«unidad», «m²»…

```http
POST /api/v1/admin/materiales
Authorization: Bearer <token de la ADMIN>
Content-Type: application/json

{ "nombre": "Fomix escarchado", "unidad": "plancha", "precioUnitario": 1.25 }
```

```json
{
  "material": {
    "id": "36210a4b-0b4b-4da6-938a-dbc7c878d031",
    "nombre": "Fomix escarchado",
    "descripcion": null,
    "unidad": "plancha",
    "precioUnitario": "1.25",
    "activo": true,
    "creadoEn": "2026-11-19T03:31:37.160Z",
    "actualizadoEn": "2026-11-19T03:31:37.160Z"
  }
}
```

### Formato del precio (`precioUnitario`) — importante para las apps

- **Se devuelve SIEMPRE como texto con 2 decimales**: `"0.75"`, `"12.50"`. Las apps deben tratarlo como
  importe exacto (en Dart, guardarlo como `String` o en céntimos; no hacer cuentas con `double`).
- **Se acepta** como número JSON (`0.75`) o como texto (`"0.75"`): mayor que 0, como máximo **2
  decimales**, con **punto** decimal y hasta **99999.99**. Se normaliza: `2.5` → `"2.50"`, `"7"` → `"7.00"`.
- **Nunca se redondea en silencio**: `1.234`, `"0,75"`, `0`, `-1`, `100000` o `0.1 + 0.2` calculado en
  JavaScript (que vale `0.30000000000000004`) → 400 `VALIDACION` en `precioUnitario`.
- Por qué: en la BD es `Decimal(12, 2)` (RF-07 exige cotizaciones exactas y reproducibles). Un número JSON
  se lee como `double` en JavaScript y en Dart; como texto no se pierde precisión. El servidor valida y
  normaliza el precio **como texto** y Prisma lo guarda en `Decimal` sin pasar por `float`.
- **RF-08 / RN-02:** cambiar el precio de un material solo afecta a las cotizaciones **nuevas**. Las
  cotizaciones ya guardadas tienen su propia copia del precio (`DetalleCotizacionMaterial.precioUnitario`) y
  los pedidos su `precioAcordado`; editar un material no los toca (hay una prueba de integración que lo
  comprueba).

### Errores del catálogo

| Estado | `codigo`             | Cuándo                                                                              |
| ------ | -------------------- | ----------------------------------------------------------------------------------- |
| 400    | `VALIDACION`         | Campos inválidos o desconocidos, PATCH vacío, id no UUID, query no válida           |
| 401    | `NO_AUTENTICADO`     | Sin token (o token no válido o caducado)                                            |
| 403    | `PROHIBIDO`          | El token es de un cliente                                                           |
| 404    | `NO_ENCONTRADO`      | «La categoría no existe.» / «El material no existe.»                                |
| 404    | `RUTA_NO_ENCONTRADA` | `DELETE` o `PUT` (no existen: solo se desactiva)                                    |
| 409    | `CONFLICTO`          | «Ya existe una categoría con ese nombre.» / «Ya existe un material con ese nombre.» |

## Catálogo · Servicios y fotos (RF-22, RF-04, RF-05)

Todo bajo `/api/v1/admin/servicios`, protegido por el grupo `/admin` (Bearer de ADMIN; 401
`NO_AUTENTICADO` sin token y 403 `PROHIBIDO` a un cliente, ANTES de leer ningún archivo).
**No hay DELETE de servicios** (RF-05: solo se desactivan con `PATCH { "activo": false }`); el único
DELETE es el de una foto.

| Método y ruta                                 | Cuerpo                                                            | Respuesta                              |
| --------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| `GET /admin/servicios`                        | query `pagina`, `porPagina` (1–100), `q`, `categoriaId`, `activo` | 200 `{ datos: [resumen], paginacion }` |
| `GET /admin/servicios/:id`                    | —                                                                 | 200 `{ servicio }` (ficha) · 404       |
| `POST /admin/servicios`                       | ver abajo                                                         | 201 `{ servicio }` · 400 · 409         |
| `PATCH /admin/servicios/:id`                  | cualquier subconjunto (≥ 1 campo)                                 | 200 `{ servicio }` · 400 · 404 · 409   |
| `POST /admin/servicios/:id/fotos`             | `multipart/form-data`, campo **`foto`**                           | 201 `{ foto }` · 400 · 404 · 409 · 413 |
| `PATCH /admin/servicios/:id/fotos/orden`      | `{ "fotoIds": [uuid, …] }` (todas)                                | 200 `{ fotos }` · 400 · 404            |
| `DELETE /admin/servicios/:id/fotos/:fotoId`   | —                                                                 | 200 `{ fotos }` (las que quedan) · 404 |
| `GET /uploads/<archivo>` (fuera de `/api/v1`) | — (**sin token**: el catálogo es público)                         | 200 imagen · 404                       |

Cuerpo de `POST` (los mismos campos, opcionales, en `PATCH`; cuerpos estrictos):

```json
{
  "categoriaId": "uuid de una categoría existente (puede estar desactivada)",
  "nombre": "Mural infantil (2–120, único DENTRO de su categoría)",
  "descripcion": "≤ 2000, opcional; null o \"\" la borran",
  "dimensionesOrientativas": "≤ 200, opcional",
  "observaciones": "≤ 1000, opcional",
  "precioBaseReferencial": 120.5,
  "materialIds": ["uuid", "uuid"],
  "activo": true
}
```

- **Resumen** (listado): `id`, `nombre`, `categoria { id, nombre, activa }`, `activo`,
  `precioBaseReferencial`, `portadaUrl` (foto con orden 0 o `null`), `numeroFotos`, `creadoEn`, `actualizadoEn`.
- **Ficha**: el resumen + `descripcion`, `dimensionesOrientativas`, `observaciones`,
  `materiales [{ id, nombre, unidad, activo }]` (por nombre) y `fotos [{ id, url, orden }]` (por orden).
- `precioBaseReferencial`: opcional, **mismo formato que `precioUnitario`** (texto con 2 decimales,
  `"120.50"`; `null` lo quita). Es solo orientativo («Desde $X», RN-01).
- `materialIds` **reemplaza** la lista de materiales habituales (`[]` la vacía). Deben existir (400 en
  `materialIds`); los que se **añaden** deben estar activos, pero los que el servicio ya tenía se pueden
  conservar aunque se hayan desactivado después.
- Nombre duplicado en la misma categoría (sin distinguir mayúsculas) → 409 «Ya existe un servicio con ese
  nombre en esta categoría.». El mismo nombre en otra categoría sí se permite. Categoría inexistente → 400
  en `categoriaId` «La categoría no existe.».
- Desactivar una **categoría** no desactiva sus servicios: el catálogo público (2.3) los ocultará.

### Fotos: cómo se guardan

- **Interfaz intercambiable** `AlmacenamientoArchivos` (`src/shared/almacenamiento/almacenamiento.ts`):
  `guardar({ clave, contenido, tipoMime })`, `eliminar(clave)` (idempotente), `urlPublica(clave)` y,
  opcional, `manejadorPublico` (solo si la propia API sirve los archivos). Se inyecta en
  `crearApp(env, { prisma, almacenamiento })`; por defecto, **disco local** (`disco.ts`) en `UPLOADS_DIR`.
- **Para pasar a Cloudinary o Firebase Storage**: crea `src/shared/almacenamiento/<proveedor>.ts` que
  implemente la interfaz (sube con el nombre `clave` recibido, borra por clave y devuelve la URL absoluta del
  proveedor; sin `manejadorPublico`) y pásala a `crearApp` en `src/server.ts`. Las apps no cambian.
- **URL absolutas**: cada foto se devuelve como `url` ABSOLUTA, `${PUBLIC_BASE_URL}/uploads/<archivo>`, que
  las apps usan tal cual en `Image.network`. Se calcula al responder a partir de la clave guardada (columna
  `clave`), así que cambiar `PUBLIC_BASE_URL` o de proveedor no deja URL antiguas. En el emulador de Android,
  `localhost` es el propio emulador: la app debe sustituirlo por `10.0.2.2` o arrancar la API con
  `PUBLIC_BASE_URL=http://10.0.2.2:3000`.
- En la BD (`imagenes_servicio`) se guarda `clave`, `tipo_mime`, `tamano_bytes` y `orden`
  (migración `20261119120000_fotos_servicio_almacenamiento`, que además hace opcional `descripcion`).

### Límites y seguridad de las fotos

- **Máximo 5 MB** por foto (multer en memoria con límite → 413 `ARCHIVO_DEMASIADO_GRANDE`) y **8 fotos por
  servicio** (409). La comprobación definitiva se hace en una transacción que bloquea la fila del servicio
  (`SELECT … FOR UPDATE`): dos subidas simultáneas no pueden superar el máximo.
- **Tipo por el contenido real** (firma o «magic bytes»): JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`,
  WebP `RIFF….WEBP`. La extensión y el Content-Type del cliente se ignoran. Si no coincide → **400
  `VALIDACION`** en el campo `foto` (se usa 400 y no 415 para que las apps lo traten como un error del
  formulario, igual que el resto de validaciones).
- **Nombre aleatorio** `<uuid v4>.<extensión del tipo detectado>`; el nombre original nunca se usa. Toda clave
  se valida con una expresión estricta y la ruta se comprueba dentro de la carpeta: sin path traversal.
- Solo se admite un archivo en el campo `foto` y ningún otro campo (400). Un formulario mal formado → 400
  `SOLICITUD_INVALIDA`.
- `GET /uploads/<archivo>`: sin listado de directorios (solo nombres con el formato de las claves; lo demás
  es 404 JSON), `Content-Type` correcto, `X-Content-Type-Options: nosniff`,
  `Cache-Control: public, max-age=86400` y `Cross-Origin-Resource-Policy: cross-origin` **solo** en esta
  ruta (helmet pone `same-origin` en toda la API, lo que impediría a las apps Flutter web en
  `localhost:5000/5001` mostrar las fotos). CORS ya lo da el middleware `cors` con `CORS_ORIGIN`.
- Al borrar una foto se borra el registro y después el archivo, y las demás se renumeran 0..n-1 (la 0 es la
  portada). Si se borra un registro pero el archivo falla, se registra un aviso y la petición termina bien.
- `uploads/` está en `.gitignore`: ningún archivo subido entra en Git.

## Catálogo público (RF-03, RF-04, RF-05, RN-01)

Lo que ve cualquier persona en la app al pulsar «Explorar el catálogo». **No exige sesión** y no está
bajo `/admin`. Si llega un token, se ignora: la respuesta es la misma para todos. Módulo
`src/modules/catalogo/` (rutas → controlador → servicio → repositorio).

### Regla de visibilidad

- Un servicio se muestra solo si **está activo y su categoría está activa**. Una categoría desactivada
  oculta sus servicios **sin desactivarlos** (al reactivarla vuelven a aparecer).
- Una categoría aparece solo si está activa y tiene al menos un servicio visible (que además cumpla `?q=`).
- Orden: categorías por `orden` y nombre; servicios por nombre; fotos por su orden (la primera es la portada).

### `GET /api/v1/catalogo?q=&categoriaId=`

- `q` (opcional, ≤ 100 caracteres): busca en el **nombre del servicio**, sin distinguir mayúsculas.
  `%` y `_` se buscan como texto literal.
- `categoriaId` (opcional, UUID): solo esa categoría. Si está desactivada, no existe o no tiene servicios
  visibles, la respuesta es `{ "categorias": [] }` (no es un error).
- 400 `VALIDACION` (ubicación `query`) si `categoriaId` no es un UUID o `q` es demasiado largo.

```json
{
  "categorias": [
    {
      "id": "09ec41c6-8d03-4175-80c5-18da7848e28e",
      "nombre": "Murales",
      "descripcion": "Murales decorativos para interiores.",
      "servicios": [
        {
          "id": "43942354-d6d5-4e98-9f19-62a6a38cfa4e",
          "nombre": "Mural infantil",
          "portadaUrl": "http://localhost:3000/uploads/3495016b-064a-423e-b454-5bbfa1f776b5.png",
          "precioReferencial": { "desde": "120.50", "esReferencial": true }
        },
        { "id": "…", "nombre": "Mural abstracto", "portadaUrl": null, "precioReferencial": null }
      ]
    }
  ]
}
```

### `GET /api/v1/catalogo/servicios/:id`

```json
{
  "servicio": {
    "id": "43942354-d6d5-4e98-9f19-62a6a38cfa4e",
    "nombre": "Mural infantil",
    "categoria": { "id": "09ec41c6-8d03-4175-80c5-18da7848e28e", "nombre": "Murales" },
    "descripcion": "Mural para habitaciones infantiles",
    "dimensionesOrientativas": "Pared de hasta 3 m",
    "observaciones": "Incluye boceto previo",
    "materialesHabituales": ["Pintura acrílica"],
    "fotos": [{ "url": "http://localhost:3000/uploads/3495016b-064a-423e-b454-5bbfa1f776b5.png" }],
    "precioReferencial": { "desde": "120.50", "esReferencial": true }
  }
}
```

- 400 `VALIDACION` si el id no es un UUID (detalle `{ campo: "id", ubicacion: "params" }`).
- 404 `NO_ENCONTRADO` **«El servicio no existe o no está disponible.»** si el servicio no existe, está
  desactivado o su categoría está desactivada. Es el **mismo cuerpo** en los tres casos, para no revelar
  si el servicio existe (RF-05).
- `descripcion`, `dimensionesOrientativas` y `observaciones` pueden ser `null`; `fotos` y
  `materialesHabituales` pueden ser `[]`.

### Precio referencial (RN-01), para las apps

`precioReferencial` es `null` si la administradora no ha puesto precio base, o
`{ "desde": "120.50", "esReferencial": true }`. `desde` es **texto con 2 decimales** (no un número
decimal: trátalo como texto o en céntimos). La app lo muestra como **«Desde $120.50 (referencial)»**.
Nunca es un precio final: el precio lo confirma la administradora en la cotización.

### Lista blanca de campos

Las respuestas se construyen campo a campo con DTO públicos (`catalogo.service.ts`), nunca copiando el
objeto de la base de datos. Solo se exponen estos campos:

| Campo                                                               | Por qué se expone                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `categorias[].id`                                                   | Para filtrar con `?categoriaId=` y agrupar en la app                            |
| `categorias[].nombre`, `descripcion`                                | Encabezado de cada grupo del catálogo (RF-03)                                   |
| `servicios[].id` / `servicio.id`                                    | Para abrir la ficha (`/catalogo/servicios/:id`) y, después, pedir la cotización |
| `nombre`, `descripcion`, `dimensionesOrientativas`, `observaciones` | Datos registrados del servicio (RF-04)                                          |
| `servicio.categoria { id, nombre }`                                 | Mostrar la categoría y volver a ella desde la ficha                             |
| `portadaUrl` / `fotos[].url`                                        | Mostrar las imágenes (URL absoluta; la portada es la primera foto)              |
| `materialesHabituales` (solo nombres de materiales **activos**)     | Informar de los materiales (RF-04) sin su configuración de costes               |
| `precioReferencial { desde, esReferencial }`                        | «Desde $X (referencial)» (RN-01)                                                |

**No se exponen nunca:** `activo`/`activa`, `orden`, recuentos de servicios o fotos, fechas, `horasManoObraReferencia`,
cantidades de referencia, ids, unidades y **precios de los materiales** (son configuración interna de la cotización,
RF-08), ni de las fotos su `id`, `clave`, `tipoMime`, `tamanoBytes` u `orden`. Las pruebas de lista blanca recorren
el JSON entero y fallan si aparece cualquier otra clave.

### Caché y CORS

Las respuestas 200 llevan `Cache-Control: public, max-age=60` (son iguales para todos); los errores no se
cachean. CORS es el general de la API (`CORS_ORIGIN`), y las fotos se sirven sin token desde `/uploads`.

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
| 401    | `NO_AUTENTICADO`          | Falta el token                                          |
| 401    | `TOKEN_INVALIDO`          | El token no es válido (firma, formato, emisor…)         |
| 401    | `TOKEN_EXPIRADO`          | El token caducó                                         |
| 401    | `CREDENCIALES_INVALIDAS`  | Correo o contraseña incorrectos (inicio de sesión)      |
| 403    | `PROHIBIDO`               | Sin permiso para la acción (RN-05)                      |
| 403    | `CUENTA_DESACTIVADA`      | La cuenta está desactivada                              |
| 404    | `NO_ENCONTRADO`           | El recurso no existe                                    |
| 404    | `RUTA_NO_ENCONTRADA`      | La ruta no existe                                       |
| 409    | `CONFLICTO`               | La operación choca con el estado actual                 |
| 413    | `CUERPO_DEMASIADO_GRANDE` | El cuerpo supera 1 MB                                   |
| 429    | `DEMASIADOS_INTENTOS`     | Límite de intentos de inicio de sesión superado         |
| 500    | `ERROR_INTERNO`           | Error inesperado (se registra en el servidor, sin pila) |

En el código, los servicios lanzan `AppError` con sus fábricas:
`AppError.noEncontrado()`, `AppError.validacion(detalles)`, `AppError.noAutorizado(mensaje?, codigo?)`,
`AppError.prohibido()`, `AppError.conflicto(mensaje)`, `AppError.demasiadosIntentos(mensaje)` y
`AppError.noImplementado()`.
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
│   ├── security/
│   │   ├── password.ts         # hash y verificación de contraseñas con bcrypt (RNF-01)
│   │   └── tokens.ts           # firmar/verificar JWT (HS256, iss/aud, reloj inyectable)
│   └── middlewares/
│       ├── validate.ts         # validación de body, query y params con Zod
│       ├── auth.ts             # crearAuth(tokens): exige Authorization: Bearer <token>
│       ├── require-role.ts     # requireRole('ADMIN' | 'CLIENTE') con el rol del token
│       ├── usuario-actual.ts   # RN-05: idUsuarioActual(res) y exigirPropietario(recurso, id)
│       ├── limite-intentos.ts  # límite de intentos de inicio de sesión (429)
│       └── request-logger.ts   # registro de peticiones (desactivado en NODE_ENV=test)
├── generated/prisma/           # cliente generado por Prisma (no se versiona)
└── modules/
    ├── admin/
    │   └── admin.routes.ts       # grupo /admin: auth + requireRole('ADMIN') UNA vez; MODULOS_ADMIN
    ├── auth/
    │   ├── auth.routes.ts        # /auth/registro, /auth/login, GET y PATCH /auth/perfil
    │   ├── auth.controller.ts    # HTTP, sin lógica
    │   ├── auth.service.ts       # reglas: registro de clientes, login, perfil
    │   ├── auth.repository.ts    # Prisma: usuarios (nunca devuelve el hash al exterior)
    │   └── auth.schemas.ts       # validación Zod de registro, login y edición del perfil
    ├── usuarios/
    │   ├── usuarios.routes.ts    # GET /admin/clientes (se monta solo a través de /admin)
    │   ├── usuarios.controller.ts
    │   ├── usuarios.service.ts   # { datos, paginacion }; nunca el hash
    │   ├── usuarios.repository.ts # Prisma: clientes con búsqueda (comodines escapados)
    │   └── usuarios.schemas.ts   # query: pagina, porPagina (máx. 100) y q
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
recibe el cliente inyectado, de modo que las pruebas eligen la base de datos; también admite un
`reloj` (para simular la expiración de los tokens) y un `limitadorLogin` (para probar el 429 con un límite bajo). Al recibir SIGINT o SIGTERM,
`server.ts` deja de aceptar peticiones y cierra las conexiones con PostgreSQL antes de salir.
Cada módulo nuevo se registra en `src/routes.ts`; las rutas de la administradora, en `MODULOS_ADMIN`
(ver «Rutas de la administradora»).

## Pruebas (RNF-07; DERCAS §6)

| Tipo        | Dónde                                                   | Cómo se ejecuta            |
| ----------- | ------------------------------------------------------- | -------------------------- |
| Unitarias   | `tests/*.test.ts` (sin base de datos)                   | `npm run test:unit`        |
| Integración | `tests/integracion/*.test.ts` (contra `creafacil_test`) | `npm run test:integracion` |
| Todas       | Vitest + Supertest                                      | `npm test`                 |
| Cobertura   | Informe en `coverage/`                                  | `npm run test:coverage`    |
| Postman     | `postman/` (colección + entornos)                       | `npm run test:postman`     |

- **Unitarias**: capas, contrato de errores (404, 400 `JSON_INVALIDO`, 413, 415, 500, 503 degradado),
  401/403 de `auth` y `requireRole`, tokens JWT (firma, alteración, algoritmo, expiración con reloj simulado),
  servicio/repositorio/esquemas de `auth`, límite de intentos (429), validación con Zod, variables de
  entorno y hash de contraseñas.
- **Integración de `auth`** (`tests/integracion/auth.integracion.test.ts`): registro, duplicado, validaciones,
  login de cliente y de ADMIN, 401 idénticos, cuenta desactivada, perfil, token alterado y expirado, y 429 con
  un límite bajo. Sus usuarios usan el dominio `auth.creafacil.test` y se borran al terminar.
- **Catálogo** (`tests/catalogo-admin.test.ts` y `tests/integracion/catalogo-admin.integracion.test.ts`): CRUD
  de categorías y materiales, 400/404/409, activar y desactivar, recuento de servicios, formato y precisión del
  precio, RN-02 (la copia del precio en una cotización no cambia), 401/403 y ausencia de DELETE. Sus datos usan
  el prefijo `[catalogo-test] ` y el dominio `catalogo.creafacil.test`. La regresión `tests/admin-rutas.test.ts`
  recorre también las rutas nuevas.
- **Integración**: necesitan `.env.test` con `DATABASE_URL_TEST` (copia `.env.test.example`). Por seguridad,
  el nombre de la base de datos **debe terminar en `_test`**; el `globalSetup` aplica las migraciones antes.
- **Cobertura** (`@vitest/coverage-v8`): mide `src/` y `scripts/`, sin `src/generated/` (cliente de Prisma),
  `src/server.ts` (arranque; se comprueba con newman en la CI) ni `scripts/limpiar-datos-prueba.ts` (punto de
  entrada de la limpieza; se ejecuta en la CI). Umbrales mínimos: **80 %** de líneas,
  sentencias y funciones y **75 %** de ramas; si no se alcanzan, el comando (y la CI) falla.
  El informe HTML queda en `coverage/index.html`.
- **Postman**: con el servidor en marcha (`npm run dev`), `npm run test:postman` ejecuta la colección con
  newman (descargado con `npx` en la versión fijada 6.2.3; no es dependencia del proyecto). El script
  `scripts/postman.js` lee `ADMIN_EMAIL` y `ADMIN_PASSWORD` del `.env` para el inicio de sesión de la
  administradora sin mostrarlos. Cómo importarla en la app de Postman: [`postman/README.md`](postman/README.md).

### Limpieza de los datos de prueba de newman

> Desde la 2.2 también borra los **servicios** `[newman] ` con sus fotos (registro **y archivo** en
> `UPLOADS_DIR`). Si una cotización o solicitud que no es de prueba usa uno de esos servicios, no borra nada.

Cada ejecución de la colección registra un cliente con un correo del dominio **reservado**
`@newman.creafacil.test` (solo lo usa newman). Para que no se acumulen:

- `npm run test:postman` ejecuta `npm run db:limpiar-pruebas` **al terminar**, pase o falle newman, y
  conserva el código de salida de newman (si la limpieza falla, solo avisa).
- A mano, contra la BD del `.env`:

  ```sh
  npm run db:limpiar-pruebas -- --simular            # muestra qué borraría, sin borrar nada
  npm run db:limpiar-pruebas                         # borra los clientes *@newman.creafacil.test y el catálogo «[newman] …»
  npm run db:limpiar-pruebas -- --incluir-antiguos   # y también los antiguos cliente+<marca>@creafacil.test
  npm run db:limpiar-pruebas -- --ayuda
  ```

Protecciones (`scripts/limpieza-datos-prueba.ts`, con pruebas en Vitest):

- Solo borra cuentas con rol **CLIENTE** cuyo correo sea del dominio de newman (o, con `--incluir-antiguos`,
  `cliente+<marca>@creafacil.test`). Una cuenta **ADMIN nunca se borra**, aunque su correo coincida.
- Doble filtro: la consulta filtra por dominio y rol, y cada correo se vuelve a comprobar con una expresión
  regular estricta antes de borrarlo por id (`x@sub.newman.creafacil.test` u `otro+1@creafacil.test` no cuentan).
- Se **niega** a ejecutarse con `NODE_ENV=production` (sin forma de saltárselo) y rechaza argumentos desconocidos.
- Borra en una **transacción** sus cotizaciones, solicitudes, pedidos y el historial de esos pedidos
  (las notificaciones y los dispositivos FCM caen en cascada). Si algún dato ajeno referencia a un cliente de
  prueba, la transacción falla y **no se borra nada**.
- Muestra la base de datos (sin credenciales) y cuántos usuarios y filas borra.
- **Catálogo de prueba:** borra también las categorías y los materiales cuyo nombre empieza por el prefijo
  reservado **`[newman] `** (los crea la carpeta «Catálogo · Administración»). Es la única excepción a «el
  catálogo solo se desactiva», porque son datos de prueba. Doble filtro (prefijo en la consulta + expresión
  regular estricta: `[NEWMAN] x` o `[newman]x` no cuentan), en la misma transacción y **después** de los clientes
  de prueba. Si una categoría de prueba tiene servicios o un material de prueba se usa en un servicio o una
  cotización que no es de prueba, **no se borra nada** y se explica el motivo.

No hay ningún endpoint HTTP para borrar usuarios: no es un requisito del DERCAS y sería una superficie de
ataque innecesaria. La limpieza es una herramienta de desarrollo que vive en `scripts/` (fuera de `src/` y de
`dist/`) y solo se ejecuta desde la terminal con acceso a la base de datos.

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
6. Ejecuta `db:limpiar-pruebas` (primero con `--simular`) aunque newman falle, y comprueba con `psql` que no
   queda ningún cliente `@newman.creafacil.test` y que la administradora sigue. La BD de la CI es efímera, pero
   así se ejecuta de verdad el comando y se verifica que solo borra datos de prueba.

Las variables de la CI son **de prueba** (no hay secretos reales). La CI fija `LOGIN_MAX_INTENTOS=1000`
para que newman no se bloquee y pasa a newman las credenciales de prueba de la administradora con
`--env-var adminEmail=… --env-var adminPassword=…` (los entornos versionados no llevan la contraseña). Los resultados se ven en la pestaña
**Actions** del repositorio y en el badge del inicio de este README.

## Ramas

- `main`: versiones estables.
- `develop`: integración. Todo cambio entra por Pull Request desde `feature/*`, `fix/*` o `refactor/*`.

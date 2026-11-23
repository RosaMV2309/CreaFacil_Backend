# Colección de Postman de CreaFácil

Pruebas de la API REST con Postman, que cumplen el criterio general del DERCAS (§6):
«los endpoints responden correctamente en las pruebas con Postman, incluyendo validaciones,
autenticación y errores» (RNF-02, RNF-07).

| Archivo                                    | Para qué sirve                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `CreaFacil.postman_collection.json`        | Colección (formato v2.1) con carpetas por módulo y pruebas `pm.test`                |
| `CreaFacil.local.postman_environment.json` | Entorno «CreaFácil · local»: `baseUrl`, `adminEmail` y `adminPassword` (vacío)      |
| `CreaFacil.ci.postman_environment.json`    | Entorno «CreaFácil · CI»: `baseUrl = http://127.0.0.1:3000/api/v1` (GitHub Actions) |

## Contenido

| Carpeta                   | Petición                                                                      | Respuesta esperada                                     |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Salud                     | `GET {{baseUrl}}`                                                             | 200 con `nombre` y `version`                           |
| Salud                     | `GET {{baseUrl}}/health`                                                      | 200 con `estado: "ok"` y `baseDatos: "ok"`             |
| Autenticación             | `POST {{baseUrl}}/auth/registro` (correo único)                               | 201 con `{ token, tipo, expiraEn, usuario }`           |
| Autenticación             | `POST {{baseUrl}}/auth/registro` (mismo correo)                               | 409 `CONFLICTO`                                        |
| Autenticación             | `POST {{baseUrl}}/auth/registro` (datos inválidos)                            | 400 `VALIDACION` (correo, contraseña y `rol`)          |
| Autenticación             | `POST {{baseUrl}}/auth/login` (cliente)                                       | 200; guarda el token en `tokenCliente`                 |
| Autenticación             | `POST {{baseUrl}}/auth/login` (contraseña incorrecta)                         | 401 `CREDENCIALES_INVALIDAS`                           |
| Autenticación             | `GET {{baseUrl}}/auth/perfil` con Bearer                                      | 200 con `{ usuario }`                                  |
| Autenticación             | `GET {{baseUrl}}/auth/perfil` sin token                                       | 401 `NO_AUTENTICADO`                                   |
| Autenticación             | `GET {{baseUrl}}/auth/perfil` con token alterado                              | 401 `TOKEN_INVALIDO`                                   |
| Autenticación             | `POST {{baseUrl}}/auth/login` (administradora)                                | 200 con `usuario.rol = "ADMIN"`                        |
| Permisos                  | `PATCH {{baseUrl}}/auth/perfil` con `tokenCliente`                            | 200 con `{ usuario }` (nombre y teléfono)              |
| Permisos                  | `PATCH {{baseUrl}}/auth/perfil` con `rol`                                     | 400 `VALIDACION` (detalle en `rol`)                    |
| Permisos                  | `GET {{baseUrl}}/admin/clientes` sin token                                    | 401 `NO_AUTENTICADO`                                   |
| Permisos                  | `GET {{baseUrl}}/admin/clientes` con `tokenCliente`                           | 403 `PROHIBIDO`                                        |
| Permisos                  | `GET {{baseUrl}}/admin/clientes?q=` con `tokenAdmin`                          | 200 con `{ datos, paginacion }`                        |
| Catálogo · Administración | `POST {{baseUrl}}/admin/categorias` con `tokenAdmin`                          | 201 con `{ categoria }`; guarda `idCategoria`          |
| Catálogo · Administración | `POST {{baseUrl}}/admin/categorias` (mismo nombre en mayúsculas)              | 409 `CONFLICTO`                                        |
| Catálogo · Administración | `GET {{baseUrl}}/admin/categorias?q=`                                         | 200 `{ datos }` con `serviciosActivos`                 |
| Catálogo · Administración | `PATCH {{baseUrl}}/admin/categorias/{{idCategoria}}`                          | 200 con `descripcion` y `orden` nuevos                 |
| Catálogo · Administración | `PATCH …/categorias/{{idCategoria}}` `{ activa: false }`                      | 200 con `activa = false`                               |
| Catálogo · Administración | `DELETE …/categorias/{{idCategoria}}`                                         | 404 `RUTA_NO_ENCONTRADA` (solo se desactiva)           |
| Catálogo · Administración | `GET {{baseUrl}}/admin/categorias` sin token                                  | 401 `NO_AUTENTICADO`                                   |
| Catálogo · Administración | `POST {{baseUrl}}/admin/materiales` (`precioUnitario: 2.5`)                   | 201 con `precioUnitario = "2.50"`; guarda `idMaterial` |
| Catálogo · Administración | `POST {{baseUrl}}/admin/materiales` (mismo nombre)                            | 409 `CONFLICTO`                                        |
| Catálogo · Administración | `POST {{baseUrl}}/admin/materiales` (`precioUnitario: 1.234`)                 | 400 `VALIDACION` en `precioUnitario`                   |
| Catálogo · Administración | `PATCH …/materiales/{{idMaterial}}` (`"0.3"`)                                 | 200 con `precioUnitario = "0.30"`                      |
| Catálogo · Administración | `GET {{baseUrl}}/admin/materiales?q=&pagina=1&porPagina=5`                    | 200 `{ datos, paginacion }`                            |
| Catálogo · Administración | `POST {{baseUrl}}/admin/materiales` con `tokenCliente`                        | 403 `PROHIBIDO`                                        |
| Catálogo · Servicios      | `POST {{baseUrl}}/admin/servicios` con `materialIds`                          | 201 `{ servicio }`; `precioBaseReferencial = "35.50"`  |
| Catálogo · Servicios      | `POST {{baseUrl}}/admin/servicios` (mismo nombre)                             | 409 `CONFLICTO`                                        |
| Catálogo · Servicios      | `GET ./servicios?q=&categoriaId=`                                             | 200 resumen paginado                                   |
| Catálogo · Servicios      | `GET ./servicios/{{idServicio}}`                                              | 200 ficha completa                                     |
| Catálogo · Servicios      | `PATCH ./servicios/{{idServicio}}` (precio y `materialIds: []`)               | 200 con `"40.00"` y sin materiales                     |
| Catálogo · Servicios      | `POST ./servicios/{{idServicio}}/fotos` (form-data `foto`)                    | 201 `{ foto }` con URL absoluta aleatoria              |
| Catálogo · Servicios      | `GET {{urlFoto}}` sin token                                                   | 200 `image/png`, CORP `cross-origin`                   |
| Catálogo · Servicios      | `POST ./fotos` con un texto renombrado a `.png`                               | 400 `VALIDACION` en `foto`                             |
| Catálogo · Servicios      | `PATCH ./fotos/orden`                                                         | 200 `{ fotos }` en el orden nuevo                      |
| Catálogo · Servicios      | `DELETE ./fotos/{{idFoto}}`                                                   | 200 `{ fotos: [] }`                                    |
| Catálogo · Servicios      | `GET {{urlFoto}}` tras borrarla                                               | 404 (el archivo ya no existe)                          |
| Catálogo · Servicios      | `PATCH ./servicios/{{idServicio}}` `{ activo: false }`                        | 200 con `activo = false`                               |
| Catálogo · Servicios      | `POST ./servicios` con `tokenCliente`                                         | 403 `PROHIBIDO`                                        |
| Catálogo · Público        | `POST ./admin/categorias` y `POST ./admin/servicios` (preparar, `tokenAdmin`) | 201; guarda `idCategoriaPublica` e `idServicioPublico` |
| Catálogo · Público        | `POST ./admin/servicios/{{idServicioPublico}}/fotos` (preparar)               | 201; guarda `urlFotoPublica`                           |
| Catálogo · Público        | `GET {{baseUrl}}/catalogo?q=` **sin Authorization**                           | 200 con el servicio, lista blanca y `Cache-Control`    |
| Catálogo · Público        | `GET {{baseUrl}}/catalogo?categoriaId=` sin Authorization                     | 200 solo con esa categoría                             |
| Catálogo · Público        | `GET {{baseUrl}}/catalogo/servicios/{{idServicioPublico}}`                    | 200 con claves exactas y sin precios de materiales     |
| Catálogo · Público        | `GET ./catalogo/servicios/no-es-un-uuid`                                      | 400 `VALIDACION` en `id`                               |
| Catálogo · Público        | `PATCH ./admin/categorias/…` `{ activa: false }` y luego ficha y catálogo     | 200; ficha 404 y el servicio desaparece                |
| Catálogo · Público        | Reactivar la categoría y `PATCH ./admin/servicios/…` `{ activo: false }`      | 200 (con `pm.sendRequest`)                             |
| Catálogo · Público        | Ficha y catálogo del servicio desactivado                                     | 404 `NO_ENCONTRADO` (mismo mensaje) y ya no aparece    |
| Errores                   | `GET {{baseUrl}}/no-existe`                                                   | 404 `RUTA_NO_ENCONTRADA`                               |
| Errores                   | `POST {{baseUrl}}/health` con JSON incompleto                                 | 400 `JSON_INVALIDO`                                    |
| Errores                   | `POST {{baseUrl}}/health` con más de 1 MB                                     | 413 `CUERPO_DEMASIADO_GRANDE`                          |
| Errores                   | `POST {{baseUrl}}/health` con `charset=latin1`                                | 415 `SOLICITUD_INVALIDA`                               |

Cada petición comprueba el código HTTP y la forma del cuerpo. A nivel de colección se comprueba en
**todas** las respuestas que el `Content-Type` es JSON (salvo las imágenes de `/uploads`), que están las cabeceras de seguridad
(`X-Content-Type-Options: nosniff`, sin `X-Powered-By`) y, en los errores, la forma
`{ "error": { "codigo", "mensaje" } }` sin pilas de error. En total: **60 peticiones y 272 aserciones**.

Variables de colección que rellenan los scripts: `emailCliente` (generado en cada ejecución como
`cliente+<marca de tiempo>@newman.creafacil.test`, el dominio reservado para los datos de prueba; ver
«Limpieza de los datos de prueba»), `passwordCliente`, `tokenCliente`, `tokenAdmin` y `qCliente`
(el correo del cliente codificado para la URL: el `+` en una query significa espacio).
La carpeta **Catálogo · Administración** añade `marcaCatalogo` (marca de tiempo de la ejecución),
`nombreCategoria`, `nombreCategoriaDuplicado`, `idCategoria`, `nombreMaterial` e `idMaterial`. Los
nombres empiezan por el prefijo reservado `[newman] ` para que la limpieza los borre.
La carpeta **Catálogo · Servicios** añade `nombreServicio`, `idServicio`, `idFoto` y `urlFoto`, y usa
`idCategoria` e `idMaterial` de la carpeta anterior.
La carpeta **Catálogo · Público** (sin Authorization en las peticiones del catálogo) añade `nombreCategoriaPublica`,
`idCategoriaPublica`, `nombreServicioPublico`, `idServicioPublico` y `urlFotoPublica`; usa `idMaterial` y
`nombreMaterial` para comprobar que la ficha muestra el nombre del material y nunca su id ni su precio.

### Archivos de las subidas (`postman/fixtures/`)

- `foto-prueba.png`: PNG real de 16×16 (color coral) para «Subir una foto PNG».
- `no-es-imagen.png`: un texto renombrado a `.png`, que la API debe rechazar.

En la colección, el `src` de esos archivos es relativo a la raíz del repositorio. `npm run test:postman` y
`npm run test:postman:ci` pasan `--working-dir` con esa raíz para que newman los encuentre. **En la app de
Postman**, abre la petición, ve a **Body → form-data** y, en la fila `foto` (tipo **File**), pulsa
**Select files** y elige una imagen de tu PC (o estos archivos).

Las carpetas **Permisos** y **Catálogo · Administración** reutilizan `tokenCliente` y `tokenAdmin` de **Autenticación**: si la ejecutas sola,
ejecuta antes «Inicio de sesión del cliente» y «Inicio de sesión de la administradora».
El cuerpo de más de 1 MB lo genera el _pre-request script_ de «Cuerpo demasiado grande (413)».

> RF-02: los 403 por rol se comprueban en la carpeta **Permisos** (un cliente en `/admin/clientes`).

## La contraseña de la administradora no se versiona

`adminPassword` está **vacío** en los archivos de entorno. Para el inicio de sesión de la administradora:

- **App de Postman:** en el entorno «CreaFácil · local», escribe tu `ADMIN_PASSWORD` del `.env` en la
  columna **Current value** (valor actual). Ese valor no se exporta ni se sincroniza. Si tu `ADMIN_EMAIL`
  no es `admin@creafacil.local`, cambia también `adminEmail`.
- **`npm run test:postman`:** el script `scripts/postman.js` lee `ADMIN_EMAIL` y `ADMIN_PASSWORD` del
  `.env`, crea una copia temporal del entorno en la carpeta temporal del sistema y la borra al terminar.
- **CI:** se pasan con `--env-var adminEmail=… --env-var adminPassword=…` desde las variables de prueba
  del workflow.

## Requisitos previos

1. PostgreSQL en marcha, la base de datos migrada (`npm run db:deploy`) y el seed ejecutado (`npm run db:seed`).
2. El servidor en marcha en el puerto 3000: `npm run dev`.

## Ejecutarla en la app de Postman

1. Abre Postman y pulsa **Import** (arriba a la izquierda).
2. Arrastra `CreaFacil.postman_collection.json` y `CreaFacil.local.postman_environment.json` de esta
   carpeta (o elígelos con **files**) e importa. Si ya los tenías, elige **Replace**.
3. Arriba a la derecha, en el selector de entornos, elige **CreaFácil · local** y escribe tu contraseña en
   el **Current value** de `adminPassword` (ver arriba).
4. En **Collections**, abre «CreaFácil API» y pulsa **Run** (o clic derecho → _Run collection_)
   y después **Run CreaFácil API**.
5. Deberías ver las 60 peticiones en verde y 272 pruebas superadas (_Passed_). También puedes abrir una
   petición, pulsar **Send** y ver sus resultados en la pestaña **Test Results** de la respuesta.

## Ejecutarla desde la terminal con newman

[newman](https://github.com/postmanlabs/newman) es el ejecutor de Postman en línea de comandos.
No es una dependencia del proyecto: se descarga con `npx` en una versión fijada (6.2.3),
porque arrastra dependencias con avisos de seguridad que no queremos en el `package-lock.json`.

```sh
npm run dev            # en una terminal
npm run test:postman   # en otra: colección + entorno local (+ credenciales del .env)
```

El comando termina con código 0 si todas las aserciones pasan y con código 1 si alguna falla.
Al final verás la limpieza de los datos de prueba (ver la sección siguiente).
En la CI se usa `npm run test:postman:ci` (entorno CI e informe JUnit en `newman/`) y después un paso
con `npm run db:limpiar-pruebas`.

## Limpieza de los datos de prueba

Cada ejecución registra **un cliente** con un correo del dominio reservado `@newman.creafacil.test` y
crea **dos categorías, un material y dos servicios** (con fotos; la del servicio público la borra la limpieza) con el
prefijo reservado `[newman] `. La limpieza borra también las fotos de esos servicios (registro y archivo).
Para que no se acumulen en tu base de datos de desarrollo:

- `npm run test:postman` ejecuta `npm run db:limpiar-pruebas` **al terminar**, tanto si newman pasa como si
  falla, sin cambiar su código de salida. Al final verás algo así:

  ```text
  Limpiando los datos de prueba de newman (npm run db:limpiar-pruebas)…
  Limpieza de datos de prueba · base de datos: creafacil en localhost:5432
  Clientes de prueba encontrados: 1 (newman: 1, antiguos: 0)
    - cliente+1763400000000@newman.creafacil.test
  Servicios de prueba encontrados: 1
    - [newman] Servicio 1763400000000
  Categorías de prueba encontradas: 1
    - [newman] Categoría 1763400000000
  Materiales de prueba encontrados: 1
    - [newman] Material 1763400000000
  Borrados: 1 usuarios, 0 cotizaciones, 0 solicitudes, 0 pedidos, 0 cambios de estado, 1 servicios, 0 fotos (0 archivos), 1 categorías y 1 materiales.
  ```

- Si ejecutas la colección desde la **app de Postman**, los clientes, categorías y materiales de prueba se quedan: bórralos a mano con
  `npm run db:limpiar-pruebas` (añade `-- --simular` para ver antes qué borraría).
- Las versiones anteriores de la colección usaban `cliente+<marca>@creafacil.test`. Para borrarlos:
  `npm run db:limpiar-pruebas -- --incluir-antiguos`.

El comando solo borra cuentas **CLIENTE** de esos dominios (nunca una ADMIN ni tus otros usuarios) y las
categorías y materiales «[newman] …» (nunca los tuyos; si algo ajeno depende de ellos, no borra nada), no se
ejecuta con `NODE_ENV=production` y no existe ningún endpoint HTTP para hacerlo. Detalles en el
[README principal](../README.md#limpieza-de-los-datos-de-prueba-de-newman).

## Límite de intentos y ejecuciones repetidas

`POST /auth/login` admite 5 intentos **fallidos** cada 15 minutos por IP (`LOGIN_MAX_INTENTOS`,
`LOGIN_VENTANA_MINUTOS`). Cada ejecución de la colección hace **1** intento fallido a propósito
(«contraseña incorrecta»); los inicios de sesión correctos no cuentan. Por tanto:

- Con la configuración por defecto puedes ejecutar la colección **5 veces seguidas** en 15 minutos
  (menos si además pruebas a mano contraseñas incorrectas).
- Si llegas al límite verás `429 DEMASIADOS_INTENTOS` en todos los inicios de sesión. Para seguir:
  reinicia `npm run dev` (los contadores están en memoria) o pon `LOGIN_MAX_INTENTOS=50` en tu `.env`
  mientras pruebas.
- La CI fija `LOGIN_MAX_INTENTOS=1000`, así que nunca se bloquea.

## Al añadir un endpoint

Añade su petición en la carpeta de su módulo con pruebas de éxito, de validación (400),
de autenticación (401) y de permisos (403), y comprueba que `npm run test:postman` sigue en verde.

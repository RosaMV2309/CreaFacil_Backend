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

| Carpeta       | Petición                                              | Respuesta esperada                            |
| ------------- | ----------------------------------------------------- | --------------------------------------------- |
| Salud         | `GET {{baseUrl}}`                                     | 200 con `nombre` y `version`                  |
| Salud         | `GET {{baseUrl}}/health`                              | 200 con `estado: "ok"` y `baseDatos: "ok"`    |
| Autenticación | `POST {{baseUrl}}/auth/registro` (correo único)       | 201 con `{ token, tipo, expiraEn, usuario }`  |
| Autenticación | `POST {{baseUrl}}/auth/registro` (mismo correo)       | 409 `CONFLICTO`                               |
| Autenticación | `POST {{baseUrl}}/auth/registro` (datos inválidos)    | 400 `VALIDACION` (correo, contraseña y `rol`) |
| Autenticación | `POST {{baseUrl}}/auth/login` (cliente)               | 200; guarda el token en `tokenCliente`        |
| Autenticación | `POST {{baseUrl}}/auth/login` (contraseña incorrecta) | 401 `CREDENCIALES_INVALIDAS`                  |
| Autenticación | `GET {{baseUrl}}/auth/perfil` con Bearer              | 200 con `{ usuario }`                         |
| Autenticación | `GET {{baseUrl}}/auth/perfil` sin token               | 401 `NO_AUTENTICADO`                          |
| Autenticación | `GET {{baseUrl}}/auth/perfil` con token alterado      | 401 `TOKEN_INVALIDO`                          |
| Autenticación | `POST {{baseUrl}}/auth/login` (administradora)        | 200 con `usuario.rol = "ADMIN"`               |
| Errores       | `GET {{baseUrl}}/no-existe`                           | 404 `RUTA_NO_ENCONTRADA`                      |
| Errores       | `POST {{baseUrl}}/health` con JSON incompleto         | 400 `JSON_INVALIDO`                           |
| Errores       | `POST {{baseUrl}}/health` con más de 1 MB             | 413 `CUERPO_DEMASIADO_GRANDE`                 |
| Errores       | `POST {{baseUrl}}/health` con `charset=latin1`        | 415 `SOLICITUD_INVALIDA`                      |

Cada petición comprueba el código HTTP y la forma del cuerpo. A nivel de colección se comprueba en
**todas** las respuestas que el `Content-Type` es JSON, que están las cabeceras de seguridad
(`X-Content-Type-Options: nosniff`, sin `X-Powered-By`) y, en los errores, la forma
`{ "error": { "codigo", "mensaje" } }` sin pilas de error. En total: **15 peticiones y 84 aserciones**.

Variables de colección que rellenan los scripts: `emailCliente` (generado en cada ejecución como
`cliente+<marca de tiempo>@creafacil.test`), `passwordCliente`, `tokenCliente` y `tokenAdmin`.
El cuerpo de más de 1 MB lo genera el _pre-request script_ de «Cuerpo demasiado grande (413)».

> Los 403 por rol (cliente en una ruta de administración) llegarán con las rutas de la subfase 1.2 (RF-02).

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
5. Deberías ver las 15 peticiones en verde y 84 pruebas superadas (_Passed_). También puedes abrir una
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
En la CI se usa `npm run test:postman:ci` (entorno CI e informe JUnit en `newman/`).

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

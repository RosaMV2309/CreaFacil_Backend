# Colección de Postman de CreaFácil

Pruebas de la API REST con Postman, que cumplen el criterio general del DERCAS (§6):
«los endpoints responden correctamente en las pruebas con Postman, incluyendo validaciones,
autenticación y errores» (RNF-02, RNF-07).

| Archivo                                    | Para qué sirve                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `CreaFacil.postman_collection.json`        | Colección (formato v2.1) con carpetas por módulo y pruebas `pm.test`                |
| `CreaFacil.local.postman_environment.json` | Entorno «CreaFácil · local»: `baseUrl = http://localhost:3000/api/v1`               |
| `CreaFacil.ci.postman_environment.json`    | Entorno «CreaFácil · CI»: `baseUrl = http://127.0.0.1:3000/api/v1` (GitHub Actions) |

## Contenido

| Carpeta | Petición                                       | Respuesta esperada                         |
| ------- | ---------------------------------------------- | ------------------------------------------ |
| Salud   | `GET {{baseUrl}}`                              | 200 con `nombre` y `version`               |
| Salud   | `GET {{baseUrl}}/health`                       | 200 con `estado: "ok"` y `baseDatos: "ok"` |
| Errores | `GET {{baseUrl}}/no-existe`                    | 404 `RUTA_NO_ENCONTRADA`                   |
| Errores | `POST {{baseUrl}}/health` con JSON incompleto  | 400 `JSON_INVALIDO`                        |
| Errores | `POST {{baseUrl}}/health` con más de 1 MB      | 413 `CUERPO_DEMASIADO_GRANDE`              |
| Errores | `POST {{baseUrl}}/health` con `charset=latin1` | 415 `SOLICITUD_INVALIDA`                   |

Cada petición comprueba el código HTTP y la forma del cuerpo. A nivel de colección se comprueba en
**todas** las respuestas que el `Content-Type` es JSON, que están las cabeceras de seguridad
(`X-Content-Type-Options: nosniff`, sin `X-Powered-By`) y, en los errores, la forma
`{ "error": { "codigo", "mensaje" } }` sin pilas de error. En total: **6 peticiones y 31 aserciones**.

El cuerpo de más de 1 MB no está guardado en el archivo: lo genera el _pre-request script_ de la
petición «Cuerpo demasiado grande (413)» en la variable `cuerpoGrande`.

> El 503 «degradado» (PostgreSQL caído) y los 401/403 de `auth` y `requireRole` se prueban con
> Vitest (`tests/contrato-errores.test.ts`), porque aún no hay rutas protegidas: las carpetas
> **Auth** y las peticiones 401/403 se añadirán con las rutas de la Fase 1 (RF-01, RF-02).

## Requisitos previos

1. PostgreSQL en marcha y la base de datos migrada (`npm run db:deploy`).
2. El servidor en marcha en el puerto 3000: `npm run dev`.

## Ejecutarla en la app de Postman

1. Abre Postman y pulsa **Import** (arriba a la izquierda).
2. Arrastra los archivos `CreaFacil.postman_collection.json` y
   `CreaFacil.local.postman_environment.json` de esta carpeta (o elígelos con **files**) e importa.
3. Arriba a la derecha, en el selector de entornos, elige **CreaFácil · local**.
4. En **Collections**, abre «CreaFácil API» y pulsa **Run** (o clic derecho → _Run collection_)
   y después **Run CreaFácil API**.
5. Deberías ver las 6 peticiones en verde y 31 pruebas superadas (_Passed_). También puedes abrir una
   petición, pulsar **Send** y ver sus resultados en la pestaña **Test Results** de la respuesta.

## Ejecutarla desde la terminal con newman

[newman](https://github.com/postmanlabs/newman) es el ejecutor de Postman en línea de comandos.
No es una dependencia del proyecto: el script lo descarga con `npx` en una versión fijada (6.2.3),
porque arrastra dependencias con avisos de seguridad que no queremos en el `package-lock.json`.

```sh
npm run dev            # en una terminal
npm run test:postman   # en otra: colección + entorno local
```

El comando termina con código 0 si todas las aserciones pasan y con código 1 si alguna falla.
En la CI se usa `npm run test:postman:ci` (entorno CI e informe JUnit en `newman/`).

## Al añadir un endpoint

Añade su petición en la carpeta de su módulo con pruebas de éxito, de validación (400),
de autenticación (401) y de permisos (403), y comprueba que `npm run test:postman` sigue en verde.

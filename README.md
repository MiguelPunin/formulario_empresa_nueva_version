# Reportes de servicio: historial privado

La aplicación conserva React + HTM, el formulario biomédico, las tres marcas, las firmas y la impresión nativa. Ahora utiliza una API Node.js/Express y PostgreSQL. No es un sistema de facturación monetaria: el formulario original no contiene precios, subtotales, impuestos ni totales; no se inventaron esos campos.

## Uso

1. Inicia sesión con tu cuenta personal guardada en PostgreSQL. Cada dispositivo recibe su propia sesión; salir en uno no desconecta a los demás.
2. Elige la empresa, llena el reporte y pulsa **Guardar reporte** o **Guardar e imprimir**. Cliente y fecha son obligatorios. El servidor asigna el número `RS-000001`, etc.; nunca se calcula en el dispositivo.
3. El reporte confirmado es inmutable. El historial permite **Ver**, **Duplicar** e **Imprimir**. No se ofrecen edición ni eliminación de confirmados.
4. **Duplicar** crea en PostgreSQL un borrador nuevo, con otro identificador/número y la fecha local actual. Conserva cliente, equipos, repuestos, marca y textos. Limpia ambas firmas y autorizaciones: cada documento nuevo requiere clave, aceptación y firma. Reinicia las horas, first time fix y estado final. Revisa los textos de la visita anterior antes de confirmar.
5. Un borrador duplicado puede retomarse mediante **Continuar borrador**. Sus cambios abiertos solo se persisten al guardar/confirmar. No hay autoguardado ni modo sin conexión.
6. El historial busca cliente, número y texto del formulario/equipos/repuestos, filtra por fechas/estado, muestra 20 registros por página y actualiza cada 30 segundos mientras está visible. También tiene Actualizar.

El historial y los documentos guardados siempre vienen de PostgreSQL. Los campos que aún estás escribiendo y el token de sesión viven solo en memoria temporal de React. Recargar requiere iniciar sesión nuevamente; no borra el historial. Al expirar una sesión, volver a ingresar conserva el reporte abierto. Nunca se guardan reportes ni tokens en localStorage/sessionStorage. Se elimina, de forma tolerante a errores, la antigua entrada `loggedUser`.

**Impresión:** se reutiliza `downloadPDF()` → `window.print()` y el CSS existente. Guardar e imprimir confirma primero; cancelar el diálogo de impresión no elimina lo guardado. La reimpresión recupera el mismo contenido y las firmas desde la API. Ctrl/Cmd+P pasa por guardar; el menú nativo del navegador solo permite imprimir un reporte confirmado. Los controles del historial no se imprimen.

## Arquitectura y archivos

```text
Frontend React/HTM (Vercel, o servido por Express)
    → HTTPS /api + sesión Bearer en memoria
    → Express / validación Zod / consultas parametrizadas pg
    → PostgreSQL compartido
```

Antes de esta integración no existían backend, API Gateway, API, base de datos, package.json, migraciones ni build. `index.html` carga bibliotecas locales. `js/react-app.js` contiene la aplicación activa. `js/app.js` y `js/components/*` son módulos antiguos no cargados; no se reutilizó su exportador html2pdf porque el flujo activo utiliza impresión nativa. Solo se retiraron las contraseñas de demostración del módulo antiguo de estado.

Archivos nuevos:

| Archivo | Función |
|---|---|
| `package.json`, `package-lock.json` | Dependencias y comandos reproducibles |
| `.gitignore`, `.env.example` | Exclusión de secretos y plantilla de configuración |
| `server/index.js`, `server/config.js` | Arranque, conexión y configuración |
| `server/app.js` | Autenticación, API, historial, creación, duplicación y confirmación |
| `server/password.js`, `scripts/password.js` | Hash scrypt y generación interactiva sin mostrar contraseña |
| `server/validation.js` | Contrato basado en los campos reales |
| `server/migrate.js`, `server/migrations/1790553600000_initial.cjs` | Migraciones con node-pg-migrate |
| `scripts/build.js` | Valida JavaScript, copia frontend a dist y genera configuración pública |
| `formulario/formulario_empresa/programa_formulario/config.js` | Configuración local de API del frontend |
| `formulario/formulario_empresa/programa_formulario/js/api.js` | Cliente HTTP y sesión en memoria |
| `formulario/formulario_empresa/programa_formulario/js/history.js` | Historial responsive |
| `tests/reports.test.js` | Integración con PostgreSQL real |
| `render.yaml`, `vercel.json` | Preparación del despliegue |
| `README.md`, `docs/VALIDACION.md` | Operación y evidencia de pruebas |

Archivos modificados, dentro de `formulario/formulario_empresa/programa_formulario/`:

- `index.html`: carga configuración, cliente API e historial.
- `js/react-app.js`: login servidor, guardado, numeración automática, carga de históricos y duplicados; reutiliza campos y firmas existentes.
- `css/styles.css`: estilos del historial, vista protegida y exclusión de controles al imprimir; mantiene las paletas y el diseño existente.
- `js/components/state.js`: elimina credenciales de demostración del módulo inactivo.

## Datos y concurrencia

`reports` tiene UUID generado por PostgreSQL, secuencia numérica única, número legible generado, cliente, fecha del reporte, estado `draft/confirmed`, `payload` JSONB, versión, origen de copia y timestamps. `payload` contiene `schemaVersion`, `brandId`, `form`, `equipoRows`, `repuestoRows`, `repuestosEnabled` y ambas firmas PNG. `form` conserva unidad de soporte, cliente, fecha, ciudad, área, teléfono, actividad, condición, falla, actividad realizada, horas, first time fix, estado final, técnico y observaciones. El tiempo trabajado se sigue calculando a partir de las horas.

`users` guarda usuario, nombre completo, siglas, hash scrypt y estado activo. `sessions` referencia al usuario y guarda el hash del token, versión de credenciales y vencimiento. `pgmigrations` registra las migraciones.

- La secuencia y las restricciones UNIQUE evitan colisiones incluso con guardados simultáneos. Puede haber saltos de numeración (reintentos/borradores); no es numeración fiscal.
- `requestId` identifica una operación, no el documento. Los POST repetidos con la misma clave devuelven el mismo registro; reutilizarla con otros datos devuelve 409.
- La confirmación de borradores usa una transacción, bloqueo de fila y versión. Dos cambios diferentes no se sobrescriben; uno recibe 409.
- Un trigger bloquea modificación/eliminación de reportes confirmados, también fuera de la API. Las migraciones no incluyen un rollback destructivo.
- La vista se bloquea durante un guardado incierto y ofrece reintentar con la misma operación. Si recargas o cambias de vista tras un fallo, consulta el historial antes de generar otra copia.

## API

Todos los endpoints de reportes requieren `Authorization: Bearer <token>`. Los cuerpos son JSON, máximo 2 MB; textos, fechas, opciones, cantidades, filas (máximo 100 por tabla) y firmas se validan en el servidor.

| Método y ruta | Uso |
|---|---|
| `GET /api/health` | Comprobación de conexión a PostgreSQL, sin datos de documentos |
| `POST /api/auth/login` | `{user,password}` → `{token,user}`; límite de intentos |
| `GET /api/auth/me` | Cuenta autenticada |
| `POST /api/auth/logout` | Revoca la sesión de ese dispositivo |
| `POST /api/reports` | `{requestId,payload}` → documento confirmado |
| `GET /api/reports?q=&from=&to=&status=&page=` | Historial paginado, sin firmas ni payload completo |
| `GET /api/reports/:id` | Snapshot completo para ver/reimprimir |
| `POST /api/reports/:id/duplicate` | `{requestId,date}` → nuevo borrador persistido |
| `PATCH /api/reports/:id/confirm` | `{version,payload}` → confirmación inmutable |

Fechas: `YYYY-MM-DD`. Estados: `draft`, `confirmed`. Errores: 400 datos inválidos, 401 acceso/sesión, 403 origen, 404 inexistente, 409 conflicto, 413 tamaño, 429 intentos, 503 servicio/base no disponible. No se devuelven stack traces ni credenciales. La API no expone PATCH/DELETE de confirmados.

## Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `DATABASE_URL` | Backend | URL PostgreSQL; usar la URL interna de Render dentro de la misma región |
| `ALLOWED_ORIGINS` | Backend | Orígenes exactos separados por comas, sin slash final; incluir frontend y origen Render si se usa su frontend |
| `SESSION_HOURS` | Backend | Duración de sesión, 1–168 horas; predeterminado 12 |
| `PORT` | Backend | Puerto; local 3000, en Render se utiliza el proporcionado por la plataforma |
| `PUBLIC_API_BASE_URL` | Build del frontend | Solo origen público de la API, p. ej. `https://TU-API.onrender.com`; vacío usa mismo origen |
| `TEST_DATABASE_URL` | Pruebas | Base PostgreSQL dedicada a pruebas; nunca producción |

Las variables privadas nunca se copian a `dist/`. No configures DATABASE_URL ni contraseñas en Vercel: allí solo se necesita PUBLIC_API_BASE_URL. La URL debe usar HTTPS en producción. Al cambiar usuario/hash, las sesiones anteriores dejan de ser válidas. Si un proveedor externo exige TLS PostgreSQL, configura su URL y CA según sus instrucciones; no desactives la verificación de certificados.

## Ejecutar localmente

Requisitos: Node.js 24 y PostgreSQL 17 o compatible.

Desde la raíz del repositorio (no desde la carpeta del formulario):

```powershell
npm ci
Copy-Item .env.example .env
npm run password
```

Crea una base vacía `reportes` con tu administrador de PostgreSQL (una sola vez). Edita `.env`: DATABASE_URL y ALLOWED_ORIGINS. Copia íntegramente el hash mostrado; no incluyas la contraseña original. En PowerShell no construyas el hash entre comillas dobles porque `$` se interpreta: pégalo directamente en el archivo `.env`.

```powershell
npm run migrate
npm run build
npm start
```

Abre `http://localhost:3000`. Para cambios del backend usa `npm run dev`; para cambios del frontend recarga el navegador (no hay Vite ni compilación JSX). Express sirve los archivos fuente y `/config.js` con API del mismo origen. No uses un servidor estático aislado para esta versión, porque no tendrá `/api`.

En la máquina de desarrollo se creó una instancia PostgreSQL aislada para verificación en el puerto 55432, con configuración local ignorada en `.env`; no es la base compartida de producción. Sus registros de prueba no se migran a Render. Los artefactos y credenciales temporales están en `.test-artifacts/` y no deben subirse.

## Pruebas y migraciones

Configura TEST_DATABASE_URL apuntando a una base vacía de pruebas creada una sola vez. El usuario de pruebas necesita crear/eliminar esquemas; la suite usa un esquema aleatorio y elimina únicamente ese esquema al terminar.

```powershell
npm test
npm run build
git diff --check
```

Las pruebas usan PostgreSQL real y fallan si no se configura la base; no se sustituye por almacenamiento en memoria. La migración inicial puede ejecutarse repetidas veces sin perder datos. Para cambios futuros, añade una migración nueva; no edites la ya aplicada. `npm run migrate` aplica solo pendientes con el mecanismo de bloqueo/transacción de node-pg-migrate.

## Desplegar PostgreSQL y backend en Render

Esta implementación está preparada; no crea recursos ni publica cambios por sí sola.

**Opción Blueprint:** sube la rama revisada, entra a Render → New → Blueprint y selecciona el repositorio y esa rama. `render.yaml` define `reportes-db` (PostgreSQL 17, plan 0.1c-256mb) y `reportes-api` (Node, plan 0.5c-512mb). **Son recursos de pago: revisa los planes antes de confirmar.** Completa ALLOWED_ORIGINS cuando Render lo solicite. El Blueprint enlaza DATABASE_URL automáticamente. Incluye en ALLOWED_ORIGINS `https://formularioempresa.vercel.app` y los demás dominios reales que usarás, sin comodines. Añade la URL Render al conocerla si usarás también su frontend.

**Opción manual equivalente:**

1. Render → New → PostgreSQL. Crea una base persistente en la región elegida. Mantén restringido su acceso externo y copia su **Internal Database URL**.
2. Render → New → Web Service, conecta el repositorio/rama, misma región, runtime Node. **Root Directory vacío** (raíz del repositorio).
3. Build Command: `npm ci && npm run build`.
4. Pre-Deploy Command: `npm run migrate`. Este campo requiere un plan compatible (el Blueprint usa 0.5c-512mb).
5. Start Command: `npm start`. Health Check Path: `/api/health`.
6. Configura DATABASE_URL, ALLOWED_ORIGINS y SESSION_HOURS. Node 24. Render suministra PORT. No establezcas TEST_DATABASE_URL en producción.
7. Despliega. Revisa que la migración y `/api/health` terminen correctamente. Comprueba el login en la URL `https://TU-API.onrender.com` si incluiste ese origen en ALLOWED_ORIGINS.
8. Configura y comprueba las copias de seguridad/restauración que incluya tu plan de PostgreSQL. La persistencia no sustituye un respaldo. Evita un plan de base temporal para el historial real.

Si eliges un Web Service sin Pre-Deploy Command, usa `npm run migrate && npm start` como Start Command; conserva las migraciones fuera del build del frontend. La base debe seguir siendo persistente y cada despliegue debe ejecutar las migraciones antes de aceptar tráfico.

## Conectar el frontend actual en Vercel

1. Despliega y verifica primero la API y PostgreSQL. No publiques todavía el frontend nuevo con la API sin configurar.
2. En el proyecto Vercel existente, Settings → Build and Deployment: cambia **Root Directory a la raíz del repositorio** (borra la ruta anidada anterior), Framework Preset **Other**.
3. Build Command: `npm run build`. Output Directory: `dist`. Install Command: `npm ci`. `vercel.json` también declara build/output.
4. En Environment Variables añade `PUBLIC_API_BASE_URL=https://TU-API.onrender.com` para Production y los previews que necesites. No agregues `/api` al final. La variable se incorpora al build: cambiarla exige redeploy.
5. En el backend Render, ALLOWED_ORIGINS debe incluir el dominio exacto del frontend. Para una preview de Vercel, añade su origen exacto, no `*`.
6. Despliega esta rama primero como preview para validar acceso/guardar/historial y después integra a la rama de producción cuando corresponda. El dominio del frontend existente se conserva.
7. Abre desde dos dispositivos, inicia sesión con la misma cuenta, guarda un reporte en uno y usa Actualizar en el otro. Comprueba Ver, Duplicar y la vista previa de impresión en los navegadores/dispositivos habituales.

Los PDF/reportes generados antes de esta funcionalidad no existen en una base central y no se importan automáticamente. La cuenta local antigua con contraseña de demostración deja de funcionar: utiliza las nuevas credenciales configuradas en Render.

Referencias: [Render Blueprints](https://render.com/docs/blueprint-spec), [Node/Express en Render](https://render.com/docs/deploy-node-express-app), [migraciones node-pg-migrate](https://salsita.github.io/node-pg-migrate/api), [transacciones node-postgres](https://node-postgres.com/features/transactions).

## Cuentas individuales

Tras `npm run migrate`, importa las cuentas con:

```powershell
node --env-file-if-exists=.env scripts/import-users.js .test-artifacts/users-local.json
```

El archivo privado contiene un arreglo de objetos con `username`, `name`, `initials` y `password` (al menos 8 caracteres). No se sube al repositorio. El importador guarda hashes scrypt y no altera usuarios existentes. En otra base, ejecuta la migracion y la importacion con su DATABASE_URL; las cuentas locales no se publican automaticamente. Las variables APP_USERNAME/APP_PASSWORD_HASH ya no se usan.

Cada usuario solo puede listar, abrir, duplicar y confirmar sus propios reportes. Los reportes nuevos y duplicados reciben las siglas del usuario en Unidad tecnica de soporte, que sigue siendo editable. Los documentos guardados conservan su contenido. La migracion de usuarios cierra las sesiones antiguas sin eliminar reportes.


## Privacidad y retencion de 14 dias

La propiedad se toma de la sesion autenticada (`owner_id`), nunca de las siglas editables. Todas las rutas del historial comprueban propietario y vencimiento, incluidos reintentos de guardado. El plazo empieza en `created_at`, cuando se guarda por primera vez; abrir o confirmar un borrador no lo prolonga. Las copias nuevas tienen su propio plazo.

Al cumplirse 14 dias, el reporte deja de ser accesible. El servidor borra fisicamente los vencidos al arrancar y cada minuto mientras esta encendido. Si esta apagado, limpia al siguiente arranque. PostgreSQL reutiliza el espacio liberado mediante su mantenimiento habitual. Los PDF ya descargados no se eliminan.

Los reportes anteriores sin autor verificable quedan con owner_id nulo y ocultos a todos; no se atribuyen por un campo editable. Tambien vencen a los 14 dias de su fecha original de guardado. Las copias conservan la referencia UUID de origen aunque el original haya vencido.


## Firmantes autorizados e instituciones

La guía completa de configuración, claves DEMO, endpoints, pruebas y actualización de datos está en [docs/FIRMAS_AUTORIZADAS.md](docs/FIRMAS_AUTORIZADAS.md). La nueva regla de duplicación sustituye la anterior: las copias requieren firmas nuevas.

# Firmas autorizadas e instituciones

Implementado el 3 de octubre de 2026 en la arquitectura existente: React + HTM, Express y PostgreSQL. No se sustituyó el canvas, la carga de imágenes ni la impresión nativa. El historial continúa privado por usuario y con eliminación a los 14 días.

## Datos iniciales

`institutions` contiene Hospital de los Valles (HDLV), Hospital Vozandes de Quito (HVQ), Clínica Hemovida (HV) y Clínica de la Mujer (CM). La migración `server/migrations/1790985600000_authorized_signers.cjs` los inserta sin duplicar códigos. El campo **Cliente** conserva la escritura libre y ofrece sugerencias desde esta tabla. El texto elegido, con nombre y código, se guarda en el mismo campo del reporte y aparece al imprimir. No hay un segundo campo de cliente.

`authorized_signers` contiene los firmantes. Los datos DEMO se centralizan en `scripts/data/signers-demo.json` (solo servidor; el build no lo copia a dist):

| Nombre | Título | Clave DEMO | Cédula |
|---|---|---|---|
| Jennifer Chicango | Ing. | 1234 | PENDIENTE |
| Milton Chango | Dr. | 2345 | PENDIENTE |
| Javier Vinueza | Dr. | 3456 | PENDIENTE |
| Diego Arias | Ing. | 4567 | PENDIENTE |

Son claves públicas exclusivamente de desarrollo. No son las contraseñas de acceso a la web. Se muestra DEMO en el modal y junto a la firma. El importador rechaza estos registros con `NODE_ENV=production`.

## Configuración

Nueva variable exclusiva del backend: `SIGNER_CODE_PEPPER`, secreto aleatorio persistente de al menos 32 caracteres. Se generó localmente en `.env`, que está excluido de Git. Para otra instalación puede generarse con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y guardarse en el gestor de secretos o .env. No debe comenzar por PUBLIC_ ni exponerse al frontend.

```powershell
npm run migrate
npm run seed:signers:demo
npm start
```

El pepper se usa para buscar una clave mediante HMAC-SHA256; además se comprueba el hash scrypt con sal individual. Si se rota el pepper, hay que reimportar las claves de todos los firmantes. No se devuelve ningún hash, lista de claves ni secreto por API. No se guarda la clave en localStorage/sessionStorage. La clave escrita se borra del estado después de validarse y al cerrar el modal.

## Sustituir por datos definitivos / agregar personas

Crear un JSON privado fuera de Git, por ejemplo `.test-artifacts/firmantes-reales.json`, con los mismos campos:

```json
[
  {
    "key": "jennifer-chicango",
    "name": "Jennifer Chicango",
    "title": "Ing.",
    "identification": "REEMPLAZAR_POR_CEDULA_ENTREGADA",
    "code": "REEMPLAZAR_POR_CLAVE_PERSONAL",
    "active": true,
    "demo": false
  }
]
```

No ejecutar el ejemplo literalmente. Con los datos realmente entregados:

```powershell
node --env-file-if-exists=.env scripts/import-signers.js .test-artifacts/firmantes-reales.json --update
```

`key` mantiene el ID de una persona al actualizarla; claves personales repetidas se rechazan. Sin `--update`, el importador no modifica registros existentes. Para añadir otra persona, usar una key nueva. `active:false` deshabilita nuevas autorizaciones sin alterar reportes anteriores. Nombre, cédula, cargo y estado también se pueden modificar en DBeaver en `authorized_signers`; **para cambiar claves usar siempre el importador**, que genera el hash y el índice seguro juntos.

Para más instituciones, insertar filas en `institutions` con `code` único, `name` y `active=true`. El frontend las consulta al iniciar sesión; no hay que cambiar componentes. Las instituciones desactivadas dejan de ofrecerse como sugerencias; los reportes históricos conservan el texto original.

## API y persistencia

Todos los endpoints requieren una sesión normal de la web:

- `GET /api/institutions`: instituciones activas, sin datos de firmantes.
- `POST /api/signers/validate`: `{code, role, payload}`; devuelve `{valid, authorizationId, signer}`. Límite de 20 intentos por IP cada 15 minutos. Error genérico para clave desconocida o firmante inactivo, sin cerrar la sesión normal.
- `POST /api/signers/authorizations/:id/accept`: `{accepted:true}`. Registra fecha de aceptación del servidor; doble clic/reintento conserva la primera fecha.
- `POST /api/signers/authorizations/:id/sign`: `{signature, payload}`. Requiere aceptación previa y contenido idéntico; devuelve imagen y metadata histórica. Una autorización no permite sustituir la imagen después de firmarla.
- `POST /api/reports` y `PATCH /api/reports/:id/confirm`: verifican la autorización, propietario, documento, rol, imagen e identidad dentro de la transacción de guardado. No basta con enviar una imagen y un nombre inventado.
- `POST /api/reports/:id/duplicate`: genera nuevo documentId y limpia ambas firmas y sus metadatos. **Esta regla sustituye la conservación de firmas solicitada en una versión anterior.**

`signature_authorizations` guarda propietario, firmante, huella de credenciales, ID del documento, rol, hash del contenido, snapshot de identidad, aceptación, fecha de firma, hash de imagen y reporte asociado. Las autorizaciones sin usar vencen a los 20 minutos; tras firmar hay 24 horas para guardar el reporte. Una vez vinculada al reporte, la autorización se conserva hasta su eliminación; no puede utilizarse en otro reporte. Los intentos caducados se limpian con el mantenimiento existente. La eliminación del reporte a los 14 días elimina sus autorizaciones asociadas.

El JSONB del reporte mantiene `signatures.tecnico/cliente` (PNG) y agrega `documentId` y `signatureMeta.tecnico/cliente`: `authorizationId`, `signerId`, `signerName`, `signerIdentification`, `signerTitle`, `demo`, `acceptanceText`, `accepted`, `acceptedAt`, `signedAt`. La imagen y los datos históricos viajan juntos al abrir el reporte; cambios futuros en la tabla de personas no alteran el snapshot.

Los reportes antiguos siguen abriéndose e imprimiéndose con sus firmas anteriores; no se inventa una identidad retroactiva. Al duplicarlos o retomar un borrador antiguo sin autorización, se requiere firmar de nuevo. Se mantiene la posibilidad existente de guardar un reporte sin firmas; cualquier firma añadida sí debe estar autorizada.

Si cambia el contenido después de firmar, la interfaz limpia ambas firmas e informa que se requiere nueva aceptación. El backend también detecta esa modificación, aunque se intente saltar la interfaz. Dibujar y cargar una imagen usan el mismo flujo de autorización. Cancelar conserva el reporte y cualquier firma previa sin reemplazarla.

## Prueba manual

1. Abrir http://127.0.0.1:3000/ e ingresar con una cuenta de la web.
2. Elegir marca, completar Cliente (probar sugerencias HDLV/HVQ/HV/CM), fecha y contenido.
3. Pulsar Firmar / cargar imagen de Cliente o Servicio técnico. No debe aparecer el canvas todavía.
4. Probar una clave incorrecta: aparece el mensaje genérico; la sesión permanece abierta.
5. Ingresar 1234: se identifica Ing. Jennifer Chicango, C.I. PENDIENTE y DEMO.
6. Verificar que Aceptar y continuar está deshabilitado; marcar la aceptación y continuar.
7. Dibujar con mouse/táctil o importar PNG/JPG/WebP. Guardar firma.
8. Verificar nombre, título y C.I. debajo de la imagen. Repetir para la otra firma.
9. Guardar el reporte, abrirlo desde Historial y comprobar imagen e identidad.
10. Imprimir/Guardar PDF usando la impresión nativa. La firma y su identificación forman un bloque indivisible; un bloque completo puede saltar de página.
11. Duplicar: la copia debe quedar sin firmas ni identidad; el original mantiene ambas.
12. Probar cancelar/Escape en los modales, borrar trazo y quitar firma. Cambiar el contenido después de firmar debe invalidar la aceptación.
13. Con red caída, el error debe permitir reintentar; no se habilita firma si no llegó confirmación del servidor.

## Archivos de esta mejora

Nuevos: migración `1790985600000_authorized_signers.cjs`, `server/signers.js`, `server/signer-admin.js`, `scripts/import-signers.js`, `scripts/data/signers-demo.json` y esta guía.

Modificados: `server/app.js`, `server/validation.js`, `server/config.js`, `server/retention.js`, `js/react-app.js`, `css/styles.css`, `tests/reports.test.js`, `package.json`, `.env.example`, `render.yaml`, `README.md` y `docs/VALIDACION.md`. Las rutas JS/CSS corresponden a `formulario/formulario_empresa/programa_formulario/`.

No se ha publicado esta mejora en producción. No se necesita una pantalla administrativa nueva ni cambiar de tecnologías.

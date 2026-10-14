# Consecutivos por usuario y edición de reportes

## Reglas acordadas

- Cada usuario tiene una secuencia persistente, independientemente de ciudad, institución o marca. El prefijo conserva `UNIDAD.CIUDAD.INSTITUCIÓN.` y el sufijo tiene al menos tres dígitos.
- El prefijo se completa con los campos. Antes de la primera firma o guardado se reserva el número por `owner_id` y `documentId`. Los reintentos devuelven la misma reserva. Después no se cambia el número, tampoco al editar los datos del reporte.
- Una reserva abandonada deja un salto. Se conserva para no reutilizar números; borrar un reporte o cumplir 14 días no reinicia el contador.
- Un reporte sin firma del cliente se guarda como `draft` y se puede editar desde el historial. La firma técnica por sí sola no lo bloquea.
- Guardar la firma del cliente cambia a `confirmed`: datos, resultados y firmas existentes quedan protegidos. Solo se admite agregar la firma adicional si aún no existe.
- La firma técnica obtiene el nombre de la cuenta autenticada en servidor. Documento y cargo siguen siendo manuales y opcionales. La firma requiere acción y aceptación explícitas.
- La tercera firma aparece al pulsar **Añadir firma adicional**, es opcional y no afecta el estado del reporte.
- Cambiar datos de un borrador invalida las firmas anteriores: se deben realizar de nuevo sobre el contenido actualizado.
- Duplicar ya no está disponible: interfaz sin botones y ruta antigua responde 410. Las copias históricas se conservan.
- El PDF usa el número persistido en mayúsculas como nombre sugerido. Se conserva la impresión nativa; el usuario selecciona **Guardar como PDF** en su navegador.

## Persistencia y migración

Ejecutar `npm run migrate` con la API detenida antes de iniciar la nueva versión. Refrescar los clientes web después del despliegue. No requiere cambiar variables de entorno ni credenciales.

`1791936000000_user_sequences_editing.cjs` crea `report_counters` y `report_number_reservations`. Añade `reports.number_reservation` y `reports.original_number`, normaliza el número y su campo dentro de `payload`, y establece el estado según la firma del cliente. Conserva imágenes, identidades y hashes históricos de autorización como evidencia; `original_number` conserva la representación anterior. Los nuevos números tienen unicidad por propietario y las reservas tienen unicidad por propietario/documento y propietario/consecutivo.

El contador inicial parte del mayor sufijo numérico de los reportes que todavía existen en la base. Los números de documentos eliminados antes de esta actualización no pueden reconstruirse si no existe un respaldo. Desde la migración, las reservas permanecen después del borrado o vencimiento.

La migración transaccional bloquea la tabla durante la conversión. Si dos números del mismo usuario coinciden al pasarlos a mayúsculas, se detiene y revierte, sin fusionar ni eliminar registros. Revisar ese caso con el propietario antes de publicar. No ejecutar una migración inversa destructiva.

Los resultados (horas, first time fix, estado final, técnico y observaciones) siguen dentro de `reports.payload.form`. El tiempo trabajado se calcula con las horas guardadas. Recargar o volver a iniciar sesión recupera el reporte desde el historial. Los cambios todavía no guardados permanecen únicamente en memoria; no se copian reportes privados al almacenamiento del navegador.

## Archivos y validación

- `server/report-numbering.js`: reserva transaccional con bloqueo por usuario.
- `server/app.js`: reserva, creación, edición versionada, bloqueo y duplicación deshabilitada.
- `server/signers.js`: identidad técnica del usuario, comprobación de número y conservación de firmas históricas sin cambios.
- `server/validation.js`: normalización a mayúsculas y validación de campos/firmas.
- `js/react-app.js`: reserva antes de firmar, edición, sección Resultados, firma opcional y nombre PDF.
- `js/history.js`: acción Editar para borradores y eliminación de Duplicar.
- `css/styles.css`: tres columnas de firmas en impresión cuando existe la adicional, sin cambiar el resto del formato.
- `tests/reports.test.js`, `tests/report-migration.test.js`: integración con PostgreSQL real en esquemas aislados. `npm test` ejecuta los archivos secuencialmente para respetar el bloqueo de migraciones de PostgreSQL.

Se comprueban concurrencia, reintentos, independencia por usuario, persistencia tras reinicio, edición sin cambiar el número, protección API/SQL, firma técnica, firma adicional después del bloqueo, catálogos institucionales, privacidad, eliminación, retención y migración histórica. La prueba de navegador cubre escritorio, tablet y móvil; guardar, recargar, editar, firmar, añadir firma y nombre de impresión. El PDF de prueba se revisa visualmente y por extracción de texto.

## Resultado de validación local (14 de octubre de 2026)

- `npm test`: 18 pruebas aprobadas, incluidas migración de históricos y reversión ante colisiones en mayúsculas.
- `npm run build` y `git diff --check`: correctos.
- Navegador Chrome real: flujos completos sin errores JavaScript; comprobación de móvil (390 px), tablet (768 px) y escritorio (1440 px).
- PDF: nombre verificado desde formulario e historial; texto de resultados e identidades conservado; caso de prueba con firma adicional en una página. Los reportes con contenido extenso pueden ocupar varias páginas.
- Migración aplicada en PostgreSQL local y servicio iniciado en `http://127.0.0.1:3000/`. Publicación en producción pendiente.

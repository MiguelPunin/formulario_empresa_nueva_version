# Verificación de la integración

Entorno: Windows, Node.js 24.13.0, PostgreSQL 17 real en una instancia local aislada, navegador integrado Chromium. No se utilizó una base en memoria ni se modificó producción.

## Automatizada

`npm test`: **10 pruebas aprobadas, 0 fallidas, 0 omitidas**.

- Login válido/inválido y acceso anónimo rechazado.
- Dos sesiones independientes de la misma cuenta.
- Cinco reintentos simultáneos del mismo guardado producen un solo documento.
- Cinco guardados independientes producen números distintos.
- Otro dispositivo recupera exactamente el snapshot guardado.
- Búsqueda por equipos, filtros de fecha/estado y texto de inyección tratado como texto.
- Duplicación persistida con nueva identidad; fecha/horarios/firmas reiniciados; original sin cambios.
- Confirmación de borrador con bloqueo/versiones, rechazo de conflictos y reintento seguro.
- Rechazo de actualización y eliminación de confirmados, incluso directamente en PostgreSQL.
- Validación de fechas, firmas, páginas, rangos y registros inexistentes.
- Persistencia tras reiniciar Express y revocación independiente al salir.
- Origen no autorizado y sesiones vencidas rechazados.
- Error de base de datos traducido a un mensaje público sin información sensible.
- Migración ejecutada dos veces sobre el mismo esquema sin duplicar tablas/datos.

`npm run build`: correcto. El proyecto sigue siendo React/HTM sin JSX; el build valida la sintaxis y genera el frontend estático en `dist/`.

`npm run migrate`: correcto sobre la base local. `npm start`: servidor escuchando en el puerto 3000 y `/api/health` operativo.

`git diff --check`: sin errores. `npm audit --omit=dev`: 0 vulnerabilidades conocidas en la ejecución de esta revisión.

## Navegador

- Login real del backend y selector de marca después del acceso.
- Guardado de un reporte nuevo desde el formulario existente; número asignado `RS-000001`.
- Horarios 23:30 → 00:30: 60 minutos.
- Desactivar repuestos mantiene Resultado como punto 4.
- Historial muestra el documento guardado; búsqueda por descripción de equipo lo encuentra.
- Ver abre una vista con los campos deshabilitados.
- Duplicar crea `RS-000002`, mantiene el cliente/equipo inicial y deja horas vacías.
- Edición de la copia y captura de un trazo de prueba en el cuadro de firma.
- Confirmación de la copia; original y copia aparecen separados en el historial.
- Tras recargar y volver a iniciar sesión, ambos documentos siguen disponibles; al abrir la copia se recupera su firma PNG desde PostgreSQL.
- Historial revisado en 390×844 (tarjetas), 768×1024 (tablet) y 1366×900 (tabla). Sin desbordamiento horizontal de página en la comprobación de tablet.
- Acciones Imprimir/Descargar PDF invocadas sobre el documento recuperado, sin errores de consola; número, marca y firma corresponden al documento seleccionado.

## Límite de la comprobación de impresión

El navegador integrado no mostró la vista previa nativa de impresión. Se comprobó la recuperación del reporte y la ejecución del flujo existente, pero no se obtuvo un PDF nuevo ni una impresión física para inspeccionar sus páginas. La revisión visual final del papel/PDF debe realizarse en el navegador habitual antes de publicar. Se conservan las reglas de impresión originales, con exclusión de historial/avisos y bloqueo de impresión de reportes sin confirmar.

Render y Vercel quedan configurables mediante los archivos y pasos del README; no se provisionaron recursos ni se realizó un despliegue de esta funcionalidad.


## Ampliacion: firmas autorizadas (3 de octubre de 2026)

`npm test`: 17 pruebas aprobadas; `npm run build` y `git diff --check` correctos.

Se probaron instituciones iniciales, clave correcta/incorrecta, persona inactiva, aceptacion obligatoria, doble aceptacion idempotente, vencimiento, propietario ajeno, firma sin autorizacion, alteracion de identidad, cambio de rol, cambio de contenido, reutilizacion en otro reporte, snapshot historico, duplicacion sin firmas y respuesta segura ante fallo del backend. Reintentar la firma conserva signedAt y metadatos.

En navegador local se comprobo login, validacion incorrecta sin cerrar sesion, clave DEMO 1234, checkbox obligatorio, modal responsive en 390x844, canvas existente con un trazo de prueba, guardado, relectura desde historial y vista de escritorio 1440x1000. Se creo RS-000011 (marcado DEMO FUNCIONAL SIN VALIDEZ) y su copia RS-000012 sin firmas. Cancelar y Escape cierran el modal sin sustituir datos. La captura de evidencia esta en .test-artifacts/firma-autorizada-desktop.jpg.

Se invoco Imprimir desde el historial y se verifico que el modo de impresion mantiene nombre, cedula e imagen. El navegador integrado no entrego un PDF exportado para inspeccionar paginas: queda pendiente comprobar la paginacion final en la vista previa nativa del navegador habitual. No se simulo una desconexion real del navegador; se probo el error del backend y el reintento idempotente a nivel API. La importacion de imagen reutiliza el componente ya existente, ahora detras de la autorizacion.

## Revalidación del 4 de octubre de 2026

Se ejecutaron nuevamente `npm test` (17 aprobadas, ninguna fallida) y `npm run build` (correcto).

En una pestaña independiente se verificó el flujo DEMO de Milton Chango: clave, identidad pendiente, aceptación y carga de imagen. Un archivo PNG dañado se rechazó con mensaje comprensible; después se cargó un PNG válido y se guardó la firma sin reiniciar el diálogo. La imagen apareció con nombre y cédula pendiente. La consola no registró errores.

En 390×844 no hubo desbordamiento horizontal de página. Al cambiar Cliente después de firmar, se eliminaron imagen y autorización y apareció el aviso que exige firmar nuevamente; esto evita asociar una aceptación a contenido modificado. Este reporte de prueba no se guardó en el historial. Se restauró el tamaño normal del navegador.

Continúa pendiente la inspección del PDF final en la vista previa nativa y la sustitución de datos/códigos DEMO por los definitivos antes de producción. Estas pruebas no equivalen a una garantía de ausencia de errores en todos los dispositivos.

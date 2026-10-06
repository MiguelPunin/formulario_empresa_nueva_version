# Responsables por institución y firmas

## Arquitectura y alcance

El frontend React/HTM (`react-app.js`) crea el snapshot del reporte y ofrece el catálogo `GET /api/institutions` en el campo Cliente. El backend Express (`server/app.js`) autentica al usuario, guarda los reportes con su propietario y confirma los borradores. PostgreSQL conserva `reports.payload`, las instituciones, los firmantes y las autorizaciones. La impresión usa el mismo reporte mediante `window.print()`; la firma PNG y su identidad se leen del snapshot guardado, sin consultar el catálogo al imprimir.

Se reutilizan `authorized_signers`, `signature_authorizations`, el componente `SignaturePad` (dibujo y carga de imagen), las rutas de aceptación/firma y la comprobación de integridad al guardar. La tercera firma manual opcional, los reportes anteriores, los códigos existentes, el historial privado y la retención se conservan.

## Flujo actual

Seleccionar una institución del catálogo y abrir la firma de cliente. El modal presenta únicamente sus responsables activos, con tratamiento, nombre y apellido. La cédula/documento se escribe manualmente, admite texto y puede quedar vacía: no se compara con registros ni servicios externos. Después de confirmar el contenido se abre el panel de firma existente.

La opción **Agregar responsable nuevo** está disponible también con una lista vacía. Tratamiento opcional, nombre y apellido obligatorios. Al usarlo se guarda permanentemente en esa institución y queda seleccionado. La cédula escrita en ese formulario se usa únicamente para la firma de ese reporte, no se incorpora al catálogo maestro. El catálogo es compartido por los usuarios autenticados; los reportes siguen siendo privados.

## Base de datos e importación

La migración `1791320100000_client_responsibles.cjs` añade a `authorized_signers` la referencia `institution_id`, tratamiento, nombre, apellido, cargo y ciudad. Conserva sus timestamps existentes y permite códigos nulos para personas nuevas. Los registros anteriores y sus códigos no se modifican.

La carga inicial usa `scripts/data/client-responsibles.json`, extraído y cotejado fila por fila con **Repositorio clientes para entorno virtual.xlsx**, Hoja1, filas 2–36: 35 personas y 14 instituciones. Se recortaron espacios exteriores sin corregir nombres ni inventar tratamientos. Los dos documentos presentes en el Excel se omiten deliberadamente del catálogo: el documento usado se solicita manualmente en cada firma. Producción no necesita el Excel ni librerías para leerlo.

Se usan los códigos entre paréntesis del Excel. Incarvasc - Semedic no trae código: se asignó `INC`. Los códigos existentes HDLV, HVQ, HV y CM se conservan. HLV (Hospital Luis Vernaza) es distinto de HDLV (Hospital de los Valles). La migración inserta instituciones por código único y personas con claves externas estables; el control de migraciones evita repetir la carga.

| Código | Institución | Responsables iniciales |
|---|---|---:|
| HDEC | Hospital de especialidades de la ciudad | 7 |
| KPOLI | Hospital Kennedy Policentro | 1 |
| OMNI | Omnihospital | 4 |
| UEES | UEESClinic | 6 |
| CU | Clinica Union | 2 |
| CSJ | Clinica Saint Joseph | 2 |
| CA | Clinica Angeles | 1 |
| HA | Hospital Alcivar | 2 |
| INC | Incarvasc - Semedic | 1 |
| HSF | Hospital San Francisco | 2 |
| HMS | Hospital Monte Sinaí | 2 |
| HRG | Hospital Roberto Gilbert | 2 |
| HAP | Hospital Alfredo Paulson | 2 |
| HLV | Hospital Luis Vernaza | 1 |

## API y seguridad

- `GET /api/institutions`: incluye `requireSignatureCode` para elegir el flujo.
- `GET /api/institutions/:id/signers`: lista de responsables activos de esa institución; no expone documentos ni claves.
- `POST /api/institutions/:id/signers`: crea un responsable asociado; exige autenticación y limita altas.
- `POST /api/signers/authorize-client`: comprueba institución activa, coincidencia con el cliente del reporte y pertenencia del responsable. Recibe el documento manual y crea la autorización.
- Las rutas existentes `/api/signers/authorizations/:id/accept` y `/sign` conservan aceptación, propietario, vencimiento, hash del contenido e integridad de la imagen. El endpoint manual genérico se mantiene para técnico y firma adicional; para cliente debe usarse el responsable institucional.

`signer_snapshot` y `signatureMeta.cliente` conservan identidad, tratamiento, documento escrito, institución, cargo y fechas de aceptación/firma. Modificar el maestro después no cambia un reporte histórico. El backend rechaza firmas ajenas, responsables de otra institución y cambios en la información firmada.

## Configuración y ejecución

No se necesita ninguna variable nueva. `REQUIRE_SIGNATURE_CODE=false` (valor predeterminado) mantiene desactivada la solicitud de código. Para recuperar el flujo anterior, configurar `REQUIRE_SIGNATURE_CODE=true`, conservar `SIGNER_CODE_PEPPER`, reiniciar el backend y volver a iniciar sesión. Los responsables importados/nuevos no tienen código: para usarlos con ese flujo se debe asignar una clave mediante el importador existente con su `external_key`. Los códigos de las personas antiguas se conservan.

```sh
npm run migrate
npm run build
npm start
```

La migración debe ejecutarse en cada base donde se publique el cambio, antes de arrancar el backend. Render ya usa `npm run migrate && npm start`. No se requiere volver a ejecutar SQL manual ni importar el Excel en Neon.

## Verificación

- Suite PostgreSQL: creación, guardado, duplicación, autenticación, privacidad, retención, números editables, firma por código, firmas manuales, pertenencia institucional, alta permanente, documento opcional/libre, integridad e identidad histórica.
- Navegador real: flujo de OMNI con responsable existente en escritorio; institución vacía y alta en móvil; carga de imagen, confirmación, guardado y ausencia de errores JavaScript.
- PDF real generado y revisado visualmente: firma, tratamiento, nombre y documento manual presentes; firma adicional vacía oculta.
- Build y comprobación de diferencias de Git.

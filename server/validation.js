import { z } from 'zod';
const text = z.string().max(500);
const longText = z.string().max(20000);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Fecha inválida');
const time = z.string().regex(/^(?:|(?:[01]\d|2[0-3]):[0-5]\d)$/);
export const signature = z.string().max(500000).refine(value => value === '' || /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value), 'Firma PNG inválida');
const signerMetadata = z.object({
  authorizationId: z.uuid(), signerId: z.uuid().nullable(), signerName: text,
  signerIdentification: text, signerTitle: text, demo: z.boolean(),
  acceptanceText: z.string().max(1000), accepted: z.literal(true),
  acceptedAt: z.iso.datetime(), signedAt: z.iso.datetime(),
}).strict();
export const payloadSchema = z.object({
  reportNumber: z.string().max(60).optional(),
  schemaVersion: z.literal(1), brandId: z.enum(['totalcare', 'pharmadial', 'mancheno']),
  repuestosEnabled: z.boolean(), documentId: z.uuid().optional(),
  signatureMeta: z.object({ tecnico: signerMetadata.nullable(), cliente: signerMetadata.nullable(), adicional: signerMetadata.nullable().optional() }).strict().optional(),
  form: z.object({
    unidadSoporte: text, cliente: text.trim().min(1, 'Ingresa el cliente'), fecha: date,
    ciudad: text, areaSolicitante: text, telefono: text,
    actividad: z.array(z.enum(['Revisión', 'Mantenimiento preventivo', 'Mantenimiento correctivo', 'Instalación'])).max(4),
    condicion: z.enum(['', 'Funcional', 'No funcional']),
    falla: z.enum(['', 'Operativa externa', 'Técnica', 'No presenta falla']),
    actividadRealizada: longText, horaInicio: time, horaFinal: time,
    firstTimeFix: z.enum(['', 'Sí', 'No', 'N/A']),
    estadoFinal: z.enum(['', 'Habilitado', 'No habilitado']), tecnico: text, observaciones: longText,
  }).strict(),
  equipoRows: z.array(z.object({ descripcion: text, marca: text, modelo: text, serie: text, ubicacion: text }).strict()).min(1).max(100),
  repuestoRows: z.array(z.object({ serie: text, parte: text, descripcion: text,
    cantidad: z.string().regex(/^(?:|\d{1,9})$/), }).strict()).min(1).max(100),
  signatures: z.object({ tecnico: signature, cliente: signature, adicional: signature.optional() }).strict(),
}).strict();
export const createSchema = z.object({ requestId: z.uuid(), payload: payloadSchema }).strict();
export const finalizeSchema = z.object({ version: z.number().int().positive(), payload: payloadSchema }).strict();
export const duplicateSchema = z.object({ requestId: z.uuid(), date }).strict();
export const filtersSchema = z.object({
  q: z.string().max(200).default(''), from: date.optional(), to: date.optional(),
  status: z.enum(['draft', 'confirmed']).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).strict().refine(f => !f.from || !f.to || f.from <= f.to, 'Rango de fechas inválido');

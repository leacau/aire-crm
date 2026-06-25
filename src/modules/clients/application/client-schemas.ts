import { z } from 'zod';

const condicionIvaValues = [
  'Responsable Inscripto',
  'Monotributista',
  'Exento',
  'Consumidor Final',
] as const;
const tipoEntidadValues = ['Pública', 'Privada', 'Mixta'] as const;

const optionalShortText = z.string().trim().max(500).optional();
const optionalId = z.string().trim().max(128).optional();

export const createClientSchema = z.object({
  denominacion: z.string().trim().min(1).max(200),
  razonSocial: z.string().trim().max(200).default(''),
  razonSocialTango: z.string().trim().max(200).optional(),
  cuit: z.string().trim().max(20).optional(),
  idTango: optionalId,
  tangoCompanyId: optionalId,
  idAireSrl: optionalId,
  idAireDigital: optionalId,
  idAire: optionalId,
  condicionIVA: z.enum(condicionIvaValues).default('Consumidor Final'),
  provincia: z.string().trim().max(100).default(''),
  localidad: z.string().trim().max(100).default(''),
  tipoEntidad: z.enum(tipoEntidadValues).default('Privada'),
  rubro: z.string().trim().max(200).default(''),
  email: z.string().trim().email().max(254).or(z.literal('')).default(''),
  phone: z.string().trim().max(80).default(''),
  observaciones: z.string().trim().max(10_000).optional(),
  agencyId: optionalId,
  isNewClient: z.boolean().default(false),
  isDeactivated: z.boolean().optional(),
  needsAttention: z.boolean().optional(),
  allowCanjes: z.boolean().default(false),
  ownerId: optionalId,
  ownerName: z.string().trim().max(200).optional(),
}).strict();

export const updateClientSchema = createClientSchema.partial().extend({
  personIds: z.array(z.string().max(128)).optional(),
}).refine(value => Object.keys(value).length > 0, {
  message: 'Debe enviarse al menos un campo para actualizar.',
});

export const createPersonSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254).or(z.literal('')).optional(),
  phone: z.string().trim().max(80).optional(),
  cargo: optionalShortText,
  observaciones: z.string().trim().max(5_000).optional(),
}).strict();

export const updatePersonSchema = createPersonSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: 'Debe enviarse al menos un campo para actualizar.' },
);

export type CreateClientRequest = z.infer<typeof createClientSchema>;
export type UpdateClientRequest = z.infer<typeof updateClientSchema>;
export type CreatePersonRequest = z.infer<typeof createPersonSchema>;
export type UpdatePersonRequest = z.infer<typeof updatePersonSchema>;

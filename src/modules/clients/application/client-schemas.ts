import { z } from 'zod';

const condicionIvaValues = [
  'Responsable Inscripto',
  'Monotributista',
  'Exento',
  'Consumidor Final',
] as const;
const tipoEntidadValues = ['Pública', 'Privada', 'Mixta'] as const;

const nullableToUndefined = (value: unknown) => value === null ? undefined : value;
const optionalShortText = z.preprocess(nullableToUndefined, z.string().trim().max(500).optional());
const optionalId = z.preprocess(nullableToUndefined, z.string().trim().max(128).optional());
const textWithDefault = (max: number, defaultValue = '') => z.preprocess(
  value => value === null ? undefined : value,
  z.string().trim().max(max).default(defaultValue),
);
const optionalLongText = (max: number) => z.preprocess(
  nullableToUndefined,
  z.string().trim().max(max).optional(),
);
const emailText = z.preprocess(
  value => value === null || value === undefined ? '' : value,
  z.string().trim().email().max(254).or(z.literal('')).default(''),
);
const tipoEntidadSchema = z.preprocess(
  value => {
    if (value === null || value === undefined || value === '') return undefined;
    if (value === 'PÃºblica') return 'Pública';
    return value;
  },
  z.enum(tipoEntidadValues).default('Privada'),
);

export const createClientSchema = z.object({
  denominacion: z.string().trim().min(1).max(200),
  razonSocial: textWithDefault(200),
  razonSocialTango: optionalLongText(200),
  cuit: optionalId,
  idTango: optionalId,
  tangoCompanyId: optionalId,
  idAireSrl: optionalId,
  idAireDigital: optionalId,
  idAire: optionalId,
  condicionIVA: z.enum(condicionIvaValues).default('Consumidor Final'),
  provincia: textWithDefault(100),
  localidad: textWithDefault(100),
  tipoEntidad: tipoEntidadSchema,
  rubro: textWithDefault(200),
  email: emailText,
  phone: textWithDefault(80),
  observaciones: optionalLongText(10_000),
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

import { z } from 'zod';

import { prospectStatusOptions } from '../domain/prospect';

const optionalText = z.string().trim().max(500).optional();

export const createProspectSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  cuit: z.string().trim().max(20).optional(),
  contactName: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(80).optional(),
  contactEmail: z.string().trim().email().max(254).or(z.literal('')).optional(),
  notes: z.string().trim().max(10_000).optional(),
  sector: optionalText,
  status: z.enum(prospectStatusOptions).default('Nuevo'),
  statusChangedAt: z.string().datetime().optional(),
}).strict();

export const updateProspectSchema = z.object({
  companyName: z.string().trim().min(1).max(200).optional(),
  cuit: z.string().trim().max(20).optional(),
  contactName: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(80).optional(),
  contactEmail: z.string().trim().email().max(254).or(z.literal('')).optional(),
  notes: z.string().trim().max(10_000).optional(),
  sector: optionalText,
  status: z.enum(prospectStatusOptions).optional(),
  statusChangedAt: z.string().datetime().optional(),
  ownerId: z.string().max(128).optional(),
  ownerName: z.string().trim().max(200).optional(),
  previousOwnerId: z.string().max(128).optional(),
  unassignedAt: z.string().datetime().nullable().optional(),
  claimStatus: z.literal('Pendiente').nullable().optional(),
  claimantId: z.string().max(128).nullable().optional(),
  claimantName: z.string().trim().max(200).nullable().optional(),
  claimedAt: z.string().datetime().nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
  message: 'Debe enviarse al menos un campo para actualizar.',
});

export type CreateProspectRequest = z.infer<typeof createProspectSchema>;
export type UpdateProspectRequest = z.infer<typeof updateProspectSchema>;

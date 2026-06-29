import { z } from 'zod';

import { opportunityStages } from '../domain/opportunity';

const dateLike = z.string().trim().optional();

const baseOpportunitySchema = z.object({
  organizationId: z.string().trim().optional(),
  title: z.string().trim().min(1, 'El título de la oportunidad es obligatorio.'),
  clientName: z.string().trim().min(1, 'El cliente es obligatorio.'),
  clientId: z.string().trim().min(1, 'El cliente es obligatorio.'),
  value: z.coerce.number().default(0),
  stage: z.enum(opportunityStages),
  closeDate: z.string().trim().optional().default(''),
  startDate: dateLike,
  endDate: dateLike,
}).passthrough();

export const createOpportunitySchema = baseOpportunitySchema;

export const updateOpportunitySchema = baseOpportunitySchema
  .partial()
  .passthrough();

export const updateOpportunityOptionsSchema = z.object({
  manageContractPeriods: z.boolean().optional(),
}).partial().optional();

export const pendingInvoiceSchema = z.object({
  invoiceNumber: z.string().optional().default(''),
  amount: z.coerce.number().optional().default(0),
  date: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.string().optional().default('Pendiente'),
  dateGenerated: z.string().optional(),
}).passthrough();

export const updateOpportunityRequestSchema = z.object({
  data: updateOpportunitySchema,
  pendingInvoices: z.array(pendingInvoiceSchema).optional(),
  options: updateOpportunityOptionsSchema,
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type UpdateOpportunityRequest = z.infer<typeof updateOpportunityRequestSchema>;

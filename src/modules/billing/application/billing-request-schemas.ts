import { z } from 'zod';

import { billingRequestStatuses } from '../domain/billing-request';

export const billingRequestStatusSchema = z.enum(billingRequestStatuses);

export const billingRequestTransitionSchema = z.object({
  status: billingRequestStatusSchema,
  invoiceNumber: z.string().trim().optional(),
  emailPayload: z.object({
    accessToken: z.string().optional(),
    loggedUser: z.string().optional(),
  }).optional(),
}).superRefine((input, context) => {
  if (input.status === 'Confeccionado' && !input.invoiceNumber?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['invoiceNumber'],
      message: 'El número de comprobante Tango es obligatorio.',
    });
  }
});

export type BillingRequestTransitionRequest = z.infer<typeof billingRequestTransitionSchema>;

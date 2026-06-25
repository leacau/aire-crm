import { z } from 'zod';

import { clientActivityTypes } from '../domain/task';

export const rescheduleTaskSchema = z.object({
  dueDate: z.string().datetime('La nueva fecha de vencimiento no es válida.'),
});

const nullableStringToOptional = z.preprocess(
  value => value === null || value === '' || value === 'none' ? undefined : value,
  z.string().trim().min(1).optional(),
);

export const createActivitySchema = z.object({
  clientId: nullableStringToOptional,
  clientName: nullableStringToOptional,
  prospectId: nullableStringToOptional,
  prospectName: nullableStringToOptional,
  opportunityId: nullableStringToOptional,
  opportunityTitle: nullableStringToOptional,
  type: z.enum(clientActivityTypes),
  observation: z.string().trim().min(1, 'La observación es obligatoria.').max(10000),
  isTask: z.boolean().default(false),
  dueDate: z.string().datetime('La fecha de vencimiento no es válida.').optional(),
  completed: z.boolean().optional(),
  googleCalendarEventId: nullableStringToOptional,
}).superRefine((input, context) => {
  if (!input.clientId && !input.prospectId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clientId'],
      message: 'La actividad debe asociarse a un cliente o prospecto.',
    });
  }
  if (input.isTask && !input.dueDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dueDate'],
      message: 'La tarea requiere una fecha de vencimiento.',
    });
  }
});

export const updateActivitySchema = z.object({
  isTask: z.boolean().optional(),
  dueDate: z.string().datetime('La fecha de vencimiento no es válida.').optional(),
  completed: z.boolean().optional(),
  completedByUserId: nullableStringToOptional,
  completedByUserName: nullableStringToOptional,
  googleCalendarEventId: z.union([z.string().trim().min(1), z.null()]).optional(),
}).superRefine((input, context) => {
  if (input.isTask === true && !input.dueDate && input.completed !== true) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dueDate'],
      message: 'Para convertir una actividad en tarea se requiere una fecha de vencimiento.',
    });
  }
});

export type CreateActivityRequest = z.infer<typeof createActivitySchema>;
export type RescheduleTaskRequest = z.infer<typeof rescheduleTaskSchema>;
export type UpdateActivityRequest = z.infer<typeof updateActivitySchema>;

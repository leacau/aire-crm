import { z } from 'zod';

export const rescheduleTaskSchema = z.object({
  dueDate: z.string().datetime('La nueva fecha de vencimiento no es válida.'),
});

export type RescheduleTaskRequest = z.infer<typeof rescheduleTaskSchema>;

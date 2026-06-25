export const clientActivityTypes = [
  'Llamada', 'WhatsApp', 'Meet', 'Reunión', 'Visita Aire',
  'Visita a empresa', 'Mail', 'LinkedIn', 'Otra',
] as const;

export type ClientActivityType = (typeof clientActivityTypes)[number];

export type ClientActivity = {
  id: string;
  organizationId?: string;
  clientId?: string;
  clientName?: string;
  prospectId?: string;
  prospectName?: string;
  opportunityId?: string;
  opportunityTitle?: string;
  userId: string;
  userName: string;
  type: ClientActivityType;
  observation: string;
  timestamp: string;
  isTask: boolean;
  dueDate?: string;
  completed?: boolean;
  completedAt?: string;
  completedByUserId?: string;
  completedByUserName?: string;
  googleCalendarEventId?: string;
};

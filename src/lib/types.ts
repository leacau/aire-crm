export type OpportunityStage =
  | 'Nuevo'
  | 'Propuesta'
  | 'Negociación'
  | 'Cerrado - Ganado'
  | 'Cerrado - Perdido';

export type Opportunity = {
  id: string;
  title: string;
  clientName: string;
  clientId: string;
  value: number;
  stage: OpportunityStage;
  closeDate: string;
  ownerId: string;
};

export type Person = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  clientIds: string[];
};

export type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  avatarUrl: string;
  avatarFallback: string;
  personIds: string[];
};

export type Activity = {
  id: string;
  type: 'Llamada' | 'Email' | 'Reunión' | 'Nota';
  subject: string;
  date: string;
  notes: string;
  clientId: string;
  opportunityId?: string;
};

export type User = {
  id: string;
  name:string;
  avatarUrl: string;
  initials: string;
};

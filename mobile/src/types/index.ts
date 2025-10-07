export type OpportunityStage =
  | 'Nuevo'
  | 'Propuesta'
  | 'Negociación'
  | 'Cerrado - Ganado'
  | 'Cerrado - Perdido';

type TimestampString = string;

export type Opportunity = {
  id: string;
  title: string;
  clientName: string;
  clientId: string;
  value: number;
  stage: OpportunityStage;
  closeDate?: TimestampString;
};

export type Client = {
  id: string;
  denominacion: string;
  razonSocial?: string;
  email?: string;
  phone?: string;
  ownerId: string;
  ownerName?: string;
  provincia?: string;
  localidad?: string;
};

export type ClientActivity = {
  id: string;
  clientId: string;
  clientName?: string;
  userId: string;
  userName: string;
  observation: string;
  isTask: boolean;
  dueDate?: TimestampString;
  completed?: boolean;
  completedAt?: TimestampString;
};

export type ActivityLog = {
  id: string;
  userId: string;
  userName: string;
  entityType: string;
  entityId: string;
  entityName: string;
  details: string;
  timestamp: TimestampString;
};

export type UserRole = 'Asesor' | 'Administracion' | 'Jefe' | 'Gerencia' | 'Import';

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  photoURL?: string | null;
};

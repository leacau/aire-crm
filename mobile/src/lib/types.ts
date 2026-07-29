export type UserRole = 'Asesor' | 'Administracion' | 'Admin' | 'Jefe' | 'Gerencia' | 'Import' | 'Asesor Canjes';

export type OpportunityStage =
  | 'Nuevo'
  | 'Propuesta'
  | 'Negociación'
  | 'Negociación a Aprobar'
  | 'Cerrado - No Definido'
  | 'Cerrado - Ganado'
  | 'Cerrado - Perdido';

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  area?: string;
  photoURL?: string;
};

export type AuthSession = {
  user: User;
  permissions: Record<string, unknown>;
};

export type MobileBootstrap = {
  session: AuthSession;
  tasks: ClientActivity[];
  clients: Client[];
  opportunities: Opportunity[];
  stats: {
    pendingTasks: number;
    visibleClients: number;
    activeOpportunities: number;
  };
};

export type MobileClientDetail = {
  client: Client;
  activities: ClientActivity[];
  opportunities: Opportunity[];
};

export type MobileOpportunityDetail = {
  opportunity: Opportunity;
};

export type ClientActivity = {
  id: string;
  clientId?: string;
  clientName?: string;
  prospectId?: string;
  prospectName?: string;
  opportunityId?: string;
  opportunityTitle?: string;
  userId: string;
  userName: string;
  type: string;
  observation: string;
  timestamp: string;
  isTask: boolean;
  dueDate?: string;
  completed?: boolean;
};

export type CreateClientActivityInput = {
  clientId?: string;
  clientName?: string;
  prospectId?: string;
  prospectName?: string;
  opportunityId?: string;
  opportunityTitle?: string;
  type: string;
  observation: string;
  isTask: boolean;
  dueDate?: string;
};

export type Client = {
  id: string;
  denominacion: string;
  razonSocial?: string;
  ownerId: string;
  ownerName: string;
  cuit?: string;
  condicionIVA?: string;
  rubro?: string;
  tipoEntidad?: string;
  observaciones?: string;
  phone?: string;
  email?: string;
  localidad?: string;
  provincia?: string;
};

export type Opportunity = {
  id: string;
  title: string;
  clientName: string;
  clientId: string;
  value: number;
  stage: OpportunityStage;
  closeDate: string;
  details?: string;
  observaciones?: string;
  followUpCurrent?: string;
  followUpNext?: string;
  createdAt: string;
  updatedAt?: string;
  ownerId?: string;
  highCloseProbability?: boolean;
  startDate?: string;
  endDate?: string;
  isCanje?: boolean;
};

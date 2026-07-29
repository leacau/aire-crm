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
  people: Person[];
};

export type MobileOpportunityDetail = {
  opportunity: Opportunity;
};

export type BillingBootstrap = {
  payments: PaymentEntry[];
};

export type ApprovalStatus = 'Pendiente' | 'Aprobado' | 'Devuelto' | 'Borrador' | 'Pendiente de Modificación';

export type ApprovalItemType = 'Nota Comercial' | 'Pedido de Redes' | 'Orden de Publicidad' | 'Nota Web / Gacetilla';

export type ApprovalHistoryItem = {
  timestamp: string;
  status: ApprovalStatus;
  userId: string;
  userName: string;
  userRole?: string;
  comments?: string;
};

export type ApprovalItem = {
  id: string;
  type: ApprovalItemType;
  clientId: string;
  clientName: string;
  advisorName: string;
  title: string;
  createdAt: string;
  status: ApprovalStatus;
  adminComments?: string;
  collectionName: string;
  rawData?: Record<string, unknown>;
  approvalHistory?: ApprovalHistoryItem[];
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

export type Person = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cargo?: string;
  observaciones?: string;
  clientIds?: string[];
};

export type ProspectStatus = 'Nuevo' | 'Contactado' | 'Calificado' | 'No Próspero' | 'Convertido';

export type Prospect = {
  id: string;
  companyName: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  createdAt: string;
  creatorId?: string;
  creatorName?: string;
  lastProspectNotificationAt?: string;
  notes?: string;
  ownerId?: string;
  ownerName?: string;
  sector?: string;
  statusChangedAt?: string;
  status: ProspectStatus;
  previousOwnerId?: string;
  unassignedAt?: string;
  claimStatus?: 'Pendiente';
  claimantId?: string;
  claimantName?: string;
  claimedAt?: string;
};

export type PaymentStatus = 'Pendiente' | 'Reclamado' | 'Pagado' | 'Incobrable';

export type PaymentEntry = {
  id: string;
  advisorId: string;
  advisorName: string;
  company: string;
  tipo?: string;
  comprobanteNumber?: string;
  razonSocial?: string;
  amount?: number;
  pendingAmount?: number;
  issueDate?: string;
  dueDate?: string;
  daysLate?: number;
  status: PaymentStatus;
  notes?: string;
  nextContactAt?: string | null;
  createdAt: string;
  updatedAt?: string;
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

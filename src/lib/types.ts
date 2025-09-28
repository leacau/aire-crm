

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
  details?: string;
  observaciones?: string;
  facturaNo?: string;
  valorCerrado?: number;
  propuestaCerrada?: string;
  pagado?: boolean;
};

export type Person = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cargo?: string;
  observaciones?: string;
  clientIds: string[];
};

export type TipoEntidad = 'Pública' | 'Privada' | 'Mixta';

export type Client = {
  id: string;
  denominacion: string;
  razonSocial: string;
  cuit: string;
  provincia: string;
  localidad: string;
  tipoEntidad: TipoEntidad;
  rubro: string;
  email: string;
  phone: string;
  observaciones?: string;
  avatarUrl: string;
  avatarFallback: string;
  personIds: string[];
  ownerId: string;
};

export type ActivityLog = {
  id: string;
  userId: string;
  userName: string;
  type: 'create' | 'update' | 'delete' | 'stage_change';
  entityType: 'client' | 'person' | 'opportunity';
  entityId: string;
  entityName: string;
  details: string; // HTML-enabled string describing the action
  timestamp: string;
};


export type UserRole = 'Asesor' | 'Administracion' | 'Jefe';

export type User = {
  id: string;
  name:string;
  email: string;
  avatarUrl: string;
  initials: string;
  role: UserRole;
};

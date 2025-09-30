
export type OpportunityStage =
  | 'Nuevo'
  | 'Propuesta'
  | 'Negociación'
  | 'Cerrado - Ganado'
  | 'Cerrado - Perdido';

export type BonificacionEstado = 'Pendiente' | 'Autorizado' | 'Rechazado';

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
  facturaNo?: string;
  valorCerrado?: number;
  propuestaCerrada?: string;
  pagado?: boolean;
  bonificacionPorcentaje?: number;
  bonificacionEstado?: BonificacionEstado;
  bonificacionAutorizadoPorId?: string;
  bonificacionAutorizadoPorNombre?: string;
  bonificacionFechaAutorizacion?: string;
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
export type CondicionIVA = 'Responsable Inscripto' | 'Monotributista' | 'Exento' | 'Consumidor Final';


export type Client = {
  id: string;
  denominacion: string;
  razonSocial: string;
  cuit: string;
  condicionIVA: CondicionIVA;
  provincia: string;
  localidad: string;
  tipoEntidad: TipoEntidad;
  rubro: string;
  email: string;
  phone: string;
  observaciones?: string;
  personIds: string[];
  ownerId: string;
  ownerName: string;
};

export type ActivityLog = {
  id: string;
  userId: string;
  userName: string;
  ownerName: string;
  type: 'create' | 'update' | 'delete' | 'stage_change';
  entityType: 'client' | 'person' | 'opportunity';
  entityId: string;
  entityName: string;
  details: string; // HTML-enabled string describing the action
  timestamp: string;
};

export const clientActivityTypes = ['Llamada', 'WhatsApp', 'Meet', 'Reunión', 'Visita Aire', 'Mail'] as const;
export type ClientActivityType = typeof clientActivityTypes[number];

export type ClientActivity = {
    id: string;
    clientId: string;
    clientName?: string; // Add clientName for easier display in dashboard
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
}


export type UserRole = 'Asesor' | 'Administracion' | 'Jefe';

export type User = {
  id: string;
  name:string;
  email: string;
  role: UserRole;
  initials?: string;
};

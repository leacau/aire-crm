

export type OpportunityStage =
  | 'Nuevo'
  | 'Propuesta'
  | 'Negociación'
  | 'Negociación a Aprobar'
  | 'Cerrado - Ganado'
  | 'Cerrado - Perdido';

export type BonificacionEstado = 'Pendiente' | 'Autorizado' | 'Rechazado';

export const periodicidadOptions = ['Ocasional', 'Mensual', 'Trimestral', 'Semestral', 'Anual'] as const;
export type Periodicidad = typeof periodicidadOptions[number];

export const formaDePagoOptions = ['Anticipado', 'A fecha', '30 días', '45 días', '60 días', '90 días'] as const;
export type FormaDePago = typeof formaDePagoOptions[number];

export type ProposalFile = {
  name: string;
  url: string;
};

export const invoiceStatusOptions = ['Generada', 'Enviada a Cobrar', 'Pagada'] as const;
export type InvoiceStatus = typeof invoiceStatusOptions[number];

export type Invoice = {
  id: string;
  opportunityId: string;
  invoiceNumber: string;
  amount: number;
  date: string; // Added invoice date
  status: InvoiceStatus;
  dateGenerated: string;
  datePaid?: string;
};

export type Pautado = {
  id: string;
  fechaInicio: string;
  fechaFin: string;
};

export type OrdenPautado = {
    id: string;
    fecha: string;
    numeroOM: string;
    ajustaPorInflacion: boolean;
    tipoAjuste: string;
    // ... add all other fields from the image
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
  
  // Deprecated fields, kept for legacy data handling
  facturaNo?: string;
  valorCerrado?: number;
  pagado?: boolean;
  fechaInicioPauta?: string;
  fechaFinPauta?: string;

  bonificacionDetalle?: string;
  bonificacionEstado?: BonificacionEstado;
  bonificacionAutorizadoPorId?: string;
  bonificacionAutorizadoPorNombre?: string;
  bonificacionFechaAutorizacion?: string;
  bonificacionObservaciones?: string;
  
  periodicidad?: Periodicidad[];
  facturaPorAgencia?: boolean;
  agencyId?: string;
  formaDePago?: FormaDePago[];
  fechaFacturacion?: string; 
  pautados?: Pautado[];
  proposalFiles?: ProposalFile[];
  ordenesPautado?: OrdenPautado[];
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
  cuit?: string;
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
  agencyId?: string;
  isNewClient?: boolean;
  newClientDate?: string;
  isDeactivated?: boolean;
  deactivationHistory?: string[];
};

export type Agency = {
  id: string;
  name: string;
};

export type ActivityLog = {
  id: string;
  userId: string;
  userName: string;
  ownerName: string;
  type: 'create' | 'update' | 'delete' | 'stage_change';
  entityType: 'client' | 'person' | 'opportunity' | 'agency' | 'invoice' | 'canje';
  entityId: string;
  entityName: string;
  details: string; // HTML-enabled string describing the action
  timestamp: string;
};

export const clientActivityTypes = ['Llamada', 'WhatsApp', 'Meet', 'Reunión', 'Visita Aire', 'Visita a empresa', 'Mail', 'LinkedIn', 'Otra'] as const;
export type ClientActivityType = typeof clientActivityTypes[number];

export type ClientActivity = {
    id: string;
    clientId: string;
    clientName: string;
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
}

export type CanjeEstado = 'Pedido' | 'En gestión' | 'Completo' | 'Aprobado';
export const canjeEstados: CanjeEstado[] = ['Pedido', 'En gestión', 'Completo', 'Aprobado'];

export type CanjeTipo = 'Temporario' | 'Mensual Permanente';
export const canjeTipos: CanjeTipo[] = ['Temporario', 'Mensual Permanente'];

export type CanjeFactura = {
    numero: string;
    monto: number;
};

export type Canje = {
  id: string;
  clienteId?: string; // Optional
  clienteName: string;
  asesorId?: string; // Optional
  asesorName: string;
  titulo: string;
  pedido: string;
  facturas?: CanjeFactura[];
  valorAsociado: number;
  valorCanje: number;
  estado: CanjeEstado;
  tipo: CanjeTipo;
  observaciones?: string;
  fechaCreacion: string;
  fechaAprobacion?: string;
  aprobadoPorId?: string;
  aprobadoPorName?: string;
};


export type UserRole = 'Asesor' | 'Administracion' | 'Jefe' | 'Gerencia' | 'Import' | 'Admin';

export type User = {
  id: string;
  name:string;
  email: string;
  role: UserRole;
  initials?: string;
  photoURL?: string;
};

// This type is used for mapping columns during import.
// It includes client fields and the ownerName for assignment.
export type ClientImportMapping = Partial<Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName'>> & {
  ownerName?: string;
};

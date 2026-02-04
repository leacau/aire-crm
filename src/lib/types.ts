export type OpportunityStage =
  | 'Nuevo'
  | 'Propuesta'
  | 'Negociación'
  | 'Negociación a Aprobar'
  | 'Cerrado - No Definido'
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
  date?: string;
  dueDate?: string;
  status: InvoiceStatus;
  dateGenerated: string;
  datePaid?: string;
  isCreditNote?: boolean;
  creditNoteMarkedAt?: string | null;
  deletionMarkedAt?: string | null;
  deletionMarkedById?: string;
  deletionMarkedByName?: string;
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
  lastExplanationRequestAt?: string;
  lastExplanationRequestById?: string;
  lastExplanationRequestByName?: string;
  explanationRequestNote?: string;
  createdAt: string;
  updatedAt?: string;
};

export type SupervisorCommentReply = {
  id: string;
  authorId: string;
  authorName: string;
  recipientId?: string;
  recipientName?: string;
  message: string;
  createdAt: string;
};

export type SupervisorComment = {
  id: string;
  entityType: 'client' | 'opportunity';
  entityId: string;
  entityName: string;
  ownerId: string;
  ownerName: string;
  authorId: string;
  authorName: string;
  recipientId?: string;
  recipientName?: string;
  message: string;
  createdAt: string;
  replies?: SupervisorCommentReply[];
  lastMessageAuthorId?: string;
  lastMessageAuthorName?: string;
  lastMessageRecipientId?: string;
  lastMessageRecipientName?: string;
  lastMessageText?: string;
  lastMessageAt?: string;
  lastSeenAtBy?: Record<string, string>;
};

export type PautaType = 'Spot' | 'PNT' | 'Sorteo' | 'Nota';
export const pautaTypes: PautaType[] = ['Spot', 'PNT', 'Sorteo', 'Nota'];

export type OrdenPautado = {
    id: string;
    tipoPauta: PautaType;
    programas?: string[];
    dias?: number[]; // 1-7 for Mon-Sun
    fechaInicio?: string;
    fechaFin?: string;
    // Spot specific
    segundos?: number;
    // PNT/Sorteo/Nota specific
    repeticiones?: number;
    textoPNT?: string;
    textoPNTaprobado?: boolean;
};


export type ProposalItem = {
  id: string;
  programId: string;
  programName: string;
  type: 'spotRadio' | 'spotTv' | 'pnt' | 'pntMasBarrida' | 'auspicio' | 'notaComercial';
  label: string;
  cantidadDia: number;
  cantidadMes: number;
  duracionSegundos?: number; // Only for spots
  valorUnitario: number;
  subtotal: number;
};


export type Opportunity = {
  id: string;
  title: string;
  clientName: string;
  clientId: string;
  value: number; // Valor final de la propuesta
  stage: OpportunityStage;
  closeDate: string;
  details?: string;
  observaciones?: string;
  createdAt: string;
  updatedAt?: string;
  manualUpdateDate?: string;
  manualUpdateHistory?: string[];
  stageChangedAt?: string;

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
  
  proposalFiles?: ProposalFile[];
  ordenesPautado?: OrdenPautado[];
  
  // New proposal fields
  proposalItems?: ProposalItem[];
  valorTarifario?: number; // Calculated value from rates
  finalizationDate?: string;
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
  idTango?: string;
  tangoCompanyId?: string;
  idAireSrl?: string;
  idAireDigital?: string;
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
  needsAttention?: boolean;
};

export const prospectStatusOptions = ['Nuevo', 'Contactado', 'Calificado', 'No Próspero', 'Convertido'] as const;
export type ProspectStatus = typeof prospectStatusOptions[number];

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
  ownerId: string;
  ownerName: string;
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

export type Agency = {
  id: string;
  name: string;
};

export type ActivityLog = {
  id: string;
  userId: string;
  userName: string;
  ownerName: string;
  type: 'create' | 'update' | 'delete' | 'stage_change' | 'comment';
  entityType:
    | 'client'
    | 'person'
    | 'opportunity'
    | 'agency'
    | 'invoice'
    | 'canje'
    | 'prospect'
    | 'user'
    | 'program'
    | 'commercial_item'
    | 'commercial_item_series'
    | 'licencia'
    | 'monthly_closure'
    | 'opportunity_alerts_config'
    | 'payment'
    | 'commercial_note';
  entityId: string;
  entityName: string;
  details: string; // HTML-enabled string describing the action
  timestamp: string;
};

export const clientActivityTypes = ['Llamada', 'WhatsApp', 'Meet', 'Reunión', 'Visita Aire', 'Visita a empresa', 'Mail', 'LinkedIn', 'Otra'] as const;
export type ClientActivityType = typeof clientActivityTypes[number];

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

export type CanjeEstado = 'Pedido' | 'En gestión' | 'Culminado' | 'Aprobado';
export const canjeEstados: CanjeEstado[] = ['Pedido', 'En gestión', 'Culminado', 'Aprobado'];

export type CanjeTipo = 'Una vez' | 'Mensual';
export const canjeTipos: CanjeTipo[] = ['Una vez', 'Mensual'];

export const canjeEstadoFinalOptions = ['Total', 'Parcial'] as const;
export type CanjeEstadoFinal = typeof canjeEstadoFinalOptions[number];

export type CanjeFactura = {
    numero: string;
    monto: number;
};

export type HistorialMensualEstado = 'Pendiente' | 'Aprobado' | 'Rechazado';
export const historialMensualEstados: HistorialMensualEstado[] = ['Pendiente', 'Aprobado', 'Rechazado'];

export type HistorialMensualItem = {
    mes: string; // "YYYY-MM"
    estado: HistorialMensualEstado;
    fechaEstado: string;
    responsableId?: string;
    responsableName?: string;
    comentario?: string;

    // Campos de negociación y aprobación para este mes
    valorCanje?: number;
    observaciones?: string;
    estadoFinal?: CanjeEstadoFinal;
    comentarioFinal?: string;
    fechaCulminacion?: string;
    culminadoPorId?: string;
    culminadoPorName?: string;
};


export type Canje = {
  id: string;
  clienteId?: string;
  clienteName: string;
  asesorId?: string;
  asesorName: string;
  titulo: string;
  pedido: string;
  fechaResolucion?: string;
  facturas?: CanjeFactura[];
  valorAsociado: number;
  valorCanje: number;
  estado: CanjeEstado;
  tipo: CanjeTipo;
  observaciones?: string;
  fechaCreacion: string;
  
  estadoFinal?: CanjeEstadoFinal;
  comentarioFinal?: string;
  fechaCulminacion?: string;
  culminadoPorId?: string;
  culminadoPorName?: string;
  
  historialMensual?: HistorialMensualItem[];
};


export type UserRole = 'Asesor' | 'Administracion' | 'Jefe' | 'Gerencia' | 'Import' | 'Admin';
export const userRoles: UserRole[] = ['Asesor', 'Administracion', 'Jefe', 'Gerencia', 'Import', 'Admin'];

export type AreaType = 'Comercial' | 'Administración' | 'Recursos Humanos' | 'Pautado' | 'Programación' | 'Redacción';
export const areaTypes: AreaType[] = ['Comercial', 'Administración', 'Recursos Humanos', 'Pautado', 'Programación', 'Redacción'];

export const screenNames = [
    'Dashboard', 'Opportunities', 'Prospects', 'Clients', 'Grilla', 'PNTs',
    'Canjes', 'Invoices', 'Billing', 'Calendar', 'Licenses', 'Approvals',
    'Activity', 'Team', 'Rates', 'Reports', 'Import', 'Objectives', 'Chat', 'TangoMapping', 'Quotes', 'Coaching', 'Notas'
] as const;
export type ScreenName = typeof screenNames[number];


export type ScreenPermission = {
    view: boolean;
    edit: boolean;
};

export type Area = {
    id: string;
    name: AreaType;
    managerIds: string[];
    permissions: Partial<Record<ScreenName, ScreenPermission>>;
};

export type MonthlyClosure = {
  // Key is "YYYY-MM"
  [key: string]: number;
};

export type ObjectiveVisibilityConfig = {
  /** Month key in format YYYY-MM representing the objective period to keep visible. */
  activeMonthKey?: string;
  /** ISO date string (YYYY-MM-DD) until which the active month should stay visible. */
  visibleUntil?: string;
  updatedByName?: string;
  updatedAt?: string;
};

// --- ESTRUCTURA PARA CÓDIGOS DE VENDEDOR (NUEVO) ---
export interface SellerCompanyConfig {
  companyName: string;
  codes: string[];
}

export type User = {
  id: string;
  name:string;
  email: string;
  role: UserRole;
  area?: AreaType;
  managerId?: string;
  initials?: string;
  photoURL?: string;
  deletedAt?: string;
  vacationDays?: number;
  monthlyClosures?: MonthlyClosure;
  monthlyObjectives?: Record<string, number>;
  monthlyObjective?: number;
  permissions?: Partial<Record<ScreenName, ScreenPermission>>;
  
  // Campo añadido para configuración de códigos de vendedor
  sellerConfig?: SellerCompanyConfig[];
};

export type ChatSpaceMapping = {
  userId: string;
  userEmail: string;
  spaceId: string;
  updatedById?: string;
  updatedByName?: string;
  updatedAt?: string;
};

export type VacationRequestStatus = 'Pendiente' | 'Aprobado' | 'Rechazado' | 'Anulado';

export type VacationRequest = {
id: string;
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  returnDate: string;
  daysRequested: number;
  status: VacationRequestStatus;
  requestDate: string;
  holidays: string[];
  approvedBy?: string;
  approvedAt?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  cancelledByName?: string;
  cancelledAt?: string;
};


// This type is used for mapping columns during import.
// It includes client fields and the ownerName for assignment.
export type ClientImportMapping = Partial<Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName'>> & {
  ownerName?: string;
};


// --- Grilla Comercial Types ---

export type ProgramSchedule = {
  id: string;
  daysOfWeek: number[];
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}

export type ProgramRates = {
  spotRadio?: number;
  spotTv?: number;
  pnt?: number;
  pntMasBarrida?: number;
  auspicio?: number;
  notaComercial?: number;
};

export type Program = {
  id: string;
  name: string;
  description?: string;
  schedules: ProgramSchedule[];
  color: string; // e.g., 'bg-blue-200'
  conductores?: string;
  productores?: string;
  rates?: ProgramRates;
  // DEPRECATED
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
};

export const commercialItemTypes = ['Bloque temático', 'Auspicio', 'Nota', 'PNT', 'Pauta'] as const;
export type CommercialItemType = typeof commercialItemTypes[number];

export const commercialItemStatus = ['Disponible', 'Vendido', 'Reservado'] as const;
export type CommercialItemStatus = typeof commercialItemStatus[number];

export type CommercialItem = {
  id: string;
  programId: string;
  date: string; // YYYY-MM-DD
  type: CommercialItemType;
  title: string;
  description: string;
  bloque?: string;
  status: CommercialItemStatus;
  seriesId?: string;
  clientId?: string;
  clientName?: string;
  opportunityId?: string;
  opportunityTitle?: string;
  pntRead?: boolean;
  pntReadAt?: string;
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
};

// --- System Config Types ---
export type OpportunityAlertsConfig = Partial<Record<OpportunityStage, number>> & {
  prospectVisibilityDays?: number;
};

// --- Coaching / Seguimiento Semanal ---

export type CoachingItemStatus = 'Pendiente' | 'En Proceso' | 'Completado' | 'Cancelado';

export type CoachingItem = {
  id: string;
  taskId: string; // ID único que persiste a través de las reuniones para la misma tarea
  originalCreatedAt: string; // Fecha en que se creó la tarea originalmente
  entityType: 'client' | 'prospect' | 'opportunity' | 'general';
  entityId?: string; 
  entityName: string; 
  action: string; 
  status: CoachingItemStatus;
  advisorNotes?: string; 
  lastUpdate?: string; 
  origin?: 'manager' | 'advisor'; // NUEVO CAMPO
};

export type CoachingSession = {
  id: string;
  advisorId: string;
  advisorName: string;
  managerId: string;
  managerName: string;
  date: string; // Fecha de la reunión
  items: CoachingItem[];
  generalNotes?: string; 
  createdAt: string;
  status: 'Open' | 'Closed'; 
};

export type SystemHolidays = {
  dates: string[]; // Array de strings "YYYY-MM-DD"
};

// --- Commercial Note Types ---
export type ScheduleItem = {
    date: string; // ISO String
    time?: string; // "HH:MM"
};

export type CommercialNote = {
  id: string;
  clientId: string;
  clientName: string;
  cuit?: string;
  advisorId: string;
  advisorName: string;
  razonSocial: string;
  
  rubro?: string;
  
  replicateWeb?: boolean;
  replicateSocials?: string[]; 
  
  collaboration?: boolean;
  collaborationHandle?: string;
  ctaText?: string;
  ctaDestination?: string;

  programIds: string[]; 
  schedule: Record<string, ScheduleItem[]>; 
  contactPhone?: string; 
  contactName?: string; 

  title?: string;
  location?: 'Estudio' | 'Móvil' | 'Meet' | 'Llamada';
  callPhone?: string; 
  mobileAddress?: string; 
  
  primaryGraf?: string; // Legacy
  secondaryGraf?: string; // Legacy
  
  // NUEVOS CAMPOS (Arrays)
  primaryGrafs?: string[];
  secondaryGrafs?: string[];
  
  questions?: string[];
  topicsToAvoid?: string[];
  
  intervieweeName?: string;
  intervieweeRole?: string;
  intervieweeBio?: string;

  instagram?: string; 
  website?: string;
  noWeb?: boolean;
  whatsapp?: string;
  noWhatsapp?: boolean;
  phone?: string; 
  noCommercialPhone?: boolean;
  
  commercialAddresses?: string[]; 
  noCommercialAddress?: boolean;

  graphicSupport: boolean;
  graphicSupportLink?: string; 
  
  totalValue: number;
  saleValue?: number;
  mismatch?: number;
  
  financialObservations?: string; 
  noteObservations?: string; 
  
  createdAt: string;
};

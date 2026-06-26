import type { Client } from '@/modules/clients/domain/client';
import type { OpportunityStage } from '@/modules/opportunities/domain/opportunity';

export { formaDePagoOptions, pautaTypes, periodicidadOptions } from '@/modules/opportunities/domain/opportunity';
export type { BonificacionEstado, FormaDePago, Opportunity, OpportunityPeriod, OpportunityStage, OrdenPautado, PautaType, Periodicidad, ProposalFile, ProposalItem } from '@/modules/opportunities/domain/opportunity';

export const invoiceStatusOptions = ['Pendiente', 'Generada', 'Enviada a Cobrar', 'Pagada'] as const;
export type InvoiceStatus = typeof invoiceStatusOptions[number];

export type CarpetaBillingStatus = 'Pendiente de Pedido' | 'Pedido Realizado' | 'Facturado';

export type Invoice = {
  id: string;
  opportunityId: string;
  canjeId?: string;
  orderId?: string;
  invoiceNumber: string;
  amount: number;
  date?: string;
  dueDate?: string;
  status: InvoiceStatus;
  dateGenerated: string;
  datePaid?: string;
  isCreditNote?: boolean;
  creditNoteMarkedAt?: string | null;
  markedForDeletion?: boolean;
  deletionMarkedAt?: string | null;
  deletionMarkedById?: string;
  deletionMarkedByName?: string;
  periodStart?: string;
  periodEnd?: string;
  month?: string; 
  concept?: string; 
  orderDate?: string;
  orderNumber?: string;
  billingRequestId?: string; 
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
  entityType: '' | 'opportunity' | 'client' | 'prospect';
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

export type { Person, TipoEntidad, CondicionIVA } from '@/modules/clients/domain/client';
export type ApprovalItemType = 'Nota Comercial' | 'Pedido de Redes' | 'Orden de Publicidad' | 'Nota Web / Gacetilla';

export type { Client } from '@/modules/clients/domain/client';

export { prospectStatusOptions } from '@/modules/prospects/domain/prospect';
export type { Prospect, ProspectStatus } from '@/modules/prospects/domain/prospect';

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
    | 'system_config'
    | 'opportunity_alerts_config'
    | 'payment'
    | 'commercial_note'
    | 'social_media_request'
    | 'pipeline_interaction';
  entityId: string;
  entityName: string;
  details: string; 
  timestamp: string;
};

export { clientActivityTypes } from '@/modules/tasks/domain/task';
export type { ClientActivity, ClientActivityType } from '@/modules/tasks/domain/task';

export type CanjeEstado =
  | 'Necesidad cargada'
  | 'En evaluación'
  | 'Pendiente gerencia'
  | 'Aprobado gerencia'
  | 'Rechazado gerencia'
  | 'En gestión comercial'
  | 'Compra directa'
  | 'Resuelto'
  | 'Pedido'
  | 'En gestión'
  | 'Culminado'
  | 'Aprobado';
export const canjeEstados: CanjeEstado[] = [
  'Necesidad cargada',
  'En evaluación',
  'Pendiente gerencia',
  'Aprobado gerencia',
  'Rechazado gerencia',
  'En gestión comercial',
  'Compra directa',
  'Resuelto',
  'Pedido',
  'En gestión',
  'Culminado',
  'Aprobado'
];
export type NecesidadResolucion = 'Pendiente' | 'Compra directa' | 'Canje';
export const necesidadResoluciones: NecesidadResolucion[] = ['Pendiente', 'Compra directa', 'Canje'];

export type CanjeTipo = 'Una vez' | 'Mensual' | 'Temporario';
export const canjeTipos: CanjeTipo[] = ['Una vez', 'Mensual', 'Temporario'];

export const canjeEstadoFinalOptions = ['Total', 'Parcial'] as const;
export type CanjeEstadoFinal = typeof canjeEstadoFinalOptions[number];

export type CanjeFactura = {
    id?: string;
    numero: string;
    monto: number;
    fecha?: string;
    empresa?: 'CLIENTE' | 'SRL' | 'SAS';
    archivoUrl?: string;
    orderId?: string;
    invoiceId?: string;
};

export type CanjeModalidad = 'Factura contra factura' | 'AVION';
export const canjeModalidades: CanjeModalidad[] = ['Factura contra factura', 'AVION'];

export type CanjeCierreEstado = 'Abierto' | 'En ejecución' | 'Pendiente de conciliación' | 'Conciliado' | 'Conciliado con diferencia' | 'Observado';
export const canjeCierreEstados: CanjeCierreEstado[] = ['Abierto', 'En ejecución', 'Pendiente de conciliación', 'Conciliado', 'Conciliado con diferencia', 'Observado'];

export type CanjeRecepcionItem = {
    id: string;
    descripcion: string;
    cantidad?: number;
    valorUnitario?: number;
    valorTotal: number;
    fechaRecepcion?: string;
    estado?: 'Pendiente' | 'Parcial' | 'Recibido';
};

export type CanjeOrdenVinculada = {
    id: string;
    orderId?: string;
    descripcion: string;
    valorTotal: number;
    fecha?: string;
};

export type HistorialMensualEstado = CanjeCierreEstado | 'Pendiente' | 'Aprobado' | 'Rechazado';
export const historialMensualEstados: HistorialMensualEstado[] = [...canjeCierreEstados, 'Pendiente', 'Aprobado', 'Rechazado'];

export type HistorialMensualItem = {
    mes: string; 
    estado: HistorialMensualEstado;
    fechaEstado: string;
    responsableId?: string;
    responsableName?: string;
    comentario?: string;
    valorCanje?: number;
    observaciones?: string;
    estadoFinal?: CanjeEstadoFinal;
    comentarioFinal?: string;
    fechaCulminacion?: string;
    culminadoPorId?: string;
    culminadoPorName?: string;
    recepciones?: CanjeRecepcionItem[];
    facturasCliente?: CanjeFactura[];
    ordenesPublicidad?: CanjeOrdenVinculada[];
    facturasAire?: CanjeFactura[];
    diferenciaAutorizada?: number;
    motivoDiferencia?: string;
    diferenciaAutorizadaPorId?: string;
    diferenciaAutorizadaPorName?: string;
    diferenciaAutorizadaAt?: string;
};

export type Canje = {
  id: string;
  clienteId?: string;
  clienteName: string;
  asesorId?: string;
  asesorName: string;
  titulo: string;
  solicitanteCanje?: string;
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
  modalidad?: CanjeModalidad;
  necesidadOrganizacion?: string;
  fechaInicio?: string;
  fechaFin?: string;
  valorAcordado?: number;
  presupuestoValor?: number;
  presupuestoDetalle?: string;
  tipoResolucion?: NecesidadResolucion;
  decisionComentario?: string;
  gerenciaComentario?: string;
  gestionComentario?: string;
  diferenciaPermitida?: number;
  opportunityId?: string;
  convenioId?: string;
  advertisingOrderIds?: string[];
  migratedFromConvenio?: boolean;
  creadoPorId?: string;
  creadoPorName?: string;
};

export type UserRole = 'Asesor' | 'Administracion' | 'Admin' | 'Jefe' | 'Gerencia' | 'Import' | 'Asesor Canjes';
export const userRoles: UserRole[] = ['Asesor', 'Administracion', 'Admin', 'Jefe', 'Gerencia', 'Import', 'Asesor Canjes'];

export type AreaType = 'Comercial' | 'Administración' | 'Recursos Humanos' | 'Pautado' | 'Programación' | 'Redacción' | 'Redes' | 'Audiovisual' | 'Canjes';
export const areaTypes: AreaType[] = ['Comercial', 'Administración', 'Recursos Humanos', 'Pautado', 'Programación', 'Redacción', 'Redes', 'Audiovisual', 'Canjes'];

export const screenNames = [
    'Dashboard', 'Opportunities', 'Prospects', 'Clients', 'Grilla', 'PNTs',
    'Canjes', 'Invoices', 'Billing', 'Calendar', 'Licenses', 'Approvals',
    'Activity', 'Team', 'Rates', 'Reports', 'Import', 'Objectives', 'Chat', 'TangoMapping', 'Quotes', 'Coaching', 'Notas', 'Publicidad', 'Carpeta', 'Redes', 'AppCanjes', 'Pipeline',
    'Tasks', 'BillingRequests', 'DataCleanup', 'WorkflowAssignments', 'ActiveProgramming'
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
  [key: string]: number;
};

export type ObjectiveVisibilityConfig = {
  activeMonthKey?: string;
  visibleUntil?: string;
  updatedByName?: string;
  updatedAt?: string;
};

export interface SellerCompanyConfig {
  companyName: string;
  codes: string[];
}

export type User = {
  id: string;
  organizationId?: string;
  name:string;
  email: string;
  role: UserRole;
  area?: AreaType;
  managerId?: string;
  externalUser?: boolean;
  initials?: string;
  photoURL?: string;
  deletedAt?: string;
  vacationDays?: number;
  monthlyClosures?: MonthlyClosure;
  monthlyObjectives?: Record<string, number>;
  monthlyObjective?: number;
  permissions?: Partial<Record<ScreenName, ScreenPermission>>;
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

export type ClientImportMapping = Partial<Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName'>> & {
  ownerName?: string;
};

export type ProgramSchedule = {
  id: string;
  daysOfWeek: number[];
  startTime: string; 
  endTime: string;   
}

// 🟢 CONFIGURACIÓN DINÁMICA DE TARIFAS
export type ProgramRates = {
  spotRadio?: number;
  spotTv?: number;
  pnt?: number;
  pntMasBarrida?: number;
  auspicio?: number;
  notaComercial?: number;
  [key: string]: number | undefined; // Permite infinitas columnas nuevas
};

export type SasProductConfig = {
  id: string;
  format: string;
  type: string;
  detail: string;
  unitRate: number;
  cpm: number;
};

export type Program = {
  id: string;
  name: string;
  description?: string;
  schedules?: ProgramSchedule[];
  schedule?: ProgramSchedule;
  color: string; 
  conductores?: string;
  productores?: string;
  rates?: ProgramRates;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
};

export const commercialItemTypes = ['Bloque temático', 'Auspicio', 'Nota', 'PNT', 'Pauta', 'Sorteo'] as const;
export type CommercialItemType = typeof commercialItemTypes[number];

export const commercialItemStatus = ['Disponible', 'Vendido', 'Reservado'] as const;
export type CommercialItemStatus = typeof commercialItemStatus[number];

export type CommercialItem = {
  id: string;
  programId: string;
  date: string; 
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

export type OpportunityAlertsConfig = Partial<Record<OpportunityStage, number>> & {
  prospectVisibilityDays?: number;
};

export type CoachingItemStatus = 'Pendiente' | 'En Proceso' | 'Completado' | 'Cancelado';

export type CoachingFollowUpEntry = {
  id: string;
  text: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  updatedAt?: string;
  updatedById?: string;
  updatedByName?: string;
};

export type CoachingItem = {
  id: string;
  taskId: string; 
  originalCreatedAt: string; 
  entityType: 'client' | 'prospect' | 'opportunity' | 'general';
  entityId?: string; 
  entityName: string; 
  action: string; 
  status: CoachingItemStatus;
  commercialWorkType?: 'new_company' | 'existing_client' | 'existing_prospect' | 'general';
  commercialIntent?: 'new_contact' | 'renegotiation' | 'new_proposal' | 'renewal' | 'recovery' | 'follow_up' | 'general';
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  businessLine?: string;
  nextActionDate?: string;
  advisorNotes?: string; 
  followUpDone?: string;
  followUpDoneUpdatedAt?: string;
  followUpDoneEntries?: CoachingFollowUpEntry[];
  followUpCurrent?: string;
  followUpCurrentUpdatedAt?: string;
  followUpCurrentEntries?: CoachingFollowUpEntry[];
  followUpNext?: string;
  followUpNextUpdatedAt?: string;
  followUpNextEntries?: CoachingFollowUpEntry[];
  lastUpdate?: string; 
  origin?: 'manager' | 'advisor'; 
};

export type CoachingSession = {
  id: string;
  advisorId: string;
  advisorName: string;
  managerId: string;
  managerName: string;
  date: string; 
  items: CoachingItem[];
  generalNotes?: string; 
  createdAt: string;
  status: 'Open' | 'Closed'; 
};

export type CoachingActiveIndexEntry = {
  entityType: 'client' | 'prospect';
  entityId: string;
  entityName: string;
  sessionId: string;
  itemId: string;
  status: CoachingItemStatus;
  lastUpdate?: string;
};

export type CoachingActiveIndex = {
  advisorId: string;
  advisorName?: string;
  openSessionId?: string;
  updatedAt?: string;
  entities: Record<string, CoachingActiveIndexEntry>;
};

export type SystemHolidays = {
  dates: string[]; 
};

export type ScheduleItem = {
    date: string; 
    time?: string; 
};

export type Interviewee = {
  name: string;
  role: string;
  location: 'Piso' | 'Teléfono' | 'Video Llamada' | 'Móvil';
};

export type ApprovalStatus = 'Borrador' | 'Pendiente' | 'Aprobado' | 'Devuelto' | 'Pendiente de Modificación';

export type ApprovalHistoryItem = {
  timestamp: string;
  status: ApprovalStatus;
  userId: string;
  userName: string;
  userRole: string;
  comments?: string;
};

export type AdvertisingOrderChange = {
  field: string;
  label: string;
  kind: 'Agregado' | 'Modificado' | 'Quitado';
  before?: string;
  after?: string;
  beforeValue?: AdvertisingOrderItemSrl | AdvertisingOrderItemSas;
  afterValue?: AdvertisingOrderItemSrl | AdvertisingOrderItemSas;
};

export type AdvertisingOrderFinancialSummary = {
  srl: {
    gross: number;
    adjustment: number;
    net: number;
  };
  sas: {
    gross: number;
    adjustment: number;
    net: number;
  };
};

export type AdvertisingOrderRevision = {
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  reason: string;
  previousStatus: ApprovalStatus;
  changes: AdvertisingOrderChange[];
  financials?: {
    before: AdvertisingOrderFinancialSummary;
    after: AdvertisingOrderFinancialSummary;
  };
  schedule?: {
    before: Pick<AdvertisingOrder, 'startDate' | 'endDate' | 'srlItems' | 'sasItems'>;
    after: Pick<AdvertisingOrder, 'startDate' | 'endDate' | 'srlItems' | 'sasItems'>;
  };
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
  primaryGraf?: string; 
  secondaryGraf?: string; 
  primaryGrafs?: string[];
  secondaryGrafs?: string[];
  questions?: string[];
  topicsToAvoid?: string[];
  intervieweeName?: string;
  intervieweeRole?: string;
  interviewees?: Interviewee[];
  intervieweeBio?: string;
  instagram?: string; 
  noInstagram?: boolean;
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
  graphicSupportLinks?: string[]; 
  totalValue: number;
  saleValue?: number;
  mismatch?: number;
  financialObservations?: string; 
  noteObservations?: string; 
  createdAt: string;
  orderId?: string;
  orderTitle?: string;

  status?: ApprovalStatus;
  adminComments?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvalHistory?: ApprovalHistoryItem[];
};

export type WebNoteFormat = 
  | 'Gacetilla de prensa enviada por la empresa'
  | 'Nota en web con entrevista telefónica'
  | 'Nota en web con entrevista presencial (sin video)'
  | 'Nota en web con entrevista en empresa + video youtube'
  | 'Nota en WEB a partir de Móvil o entrevista en Radio';

export type WebNoteImageSupport = 
  | 'Fotografías y/o videos enviados por el cliente'
  | 'Fotografías y/o videos realizados por AIRE'
  | 'No requiere';

export type WebNote = {
  id?: string;
  clientId: string;
  clientName: string;
  advisorId: string;
  advisorName: string;
  
  orderId?: string;
  orderTitle?: string;

  contactName: string;
  contactPhone: string;
  clientWebOrSocial?: string;

  objective: string;
  format: WebNoteFormat;
  imageSupport: WebNoteImageSupport;
  inserts?: string; 
  
  repIgStory?: boolean;
  repIgStoryProducer?: 'Produce Aire' | 'Envía Cte';
  repIgReel?: boolean;
  repIgReelProducer?: 'Produce Aire' | 'Envía Cte';
  repFacebook?: boolean;
  repTwitter?: boolean;
  clientIgHandle?: string;
  collaborateReel?: boolean;
  
  materialUrl?: string;
  observations?: string;

  createdAt: string;
  updatedAt?: string;
  
  status?: ApprovalStatus;
  adminComments?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvalHistory?: ApprovalHistoryItem[];
};

export type SocialMediaType = 'Reel' | 'Story' | 'Carrusel';
export type SocialMediaCreator = 'Redes' | 'Audiovisual';

export type CarouselSlide = {
  text: string;
  link: string;
};

export type SocialMediaRequest = {
  id?: string;
  clientId: string;
  clientName: string;
  advisorId: string;
  advisorName: string;
  contactName: string;
  recordingLocation: string;
  recordingDate: string;
  recordingTime: string;
  contentType: SocialMediaType;
  creator: SocialMediaCreator;
  publishDate: string;
  clientValidation: boolean;
  objective: string;
  script: string;
  observations?: string;
  materialUrl?: string;
  isWebReplication?: boolean;
  storyUrl?: string;
  storyCta?: string;
  storyTagClient?: boolean;
  storyTagHandle?: string;
  reelCopy?: string;
  reelCollaboration?: boolean;
  reelCollabHandle?: string;
  carouselSlides?: CarouselSlide[];
  createdAt: string;
  updatedAt?: string;
  orderId?: string;
  orderTitle?: string;

  status?: ApprovalStatus;
  adminComments?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvalHistory?: ApprovalHistoryItem[];
};

export type AdvertisingOrderItemSrl = {
  month?: string; 
  programId?: string;
  adType?: string;
  customType?: string; 
  hasTv?: boolean; 
  seconds?: number;
  dailySpots?: Record<string, number>;
  unitRate?: number;
};

export type AdvertisingOrderItemSas = {
  month?: string; 
  format?: string; 
  type?: string;
  detail?: string;
  customDetail?: string; 
  observations?: string;
  desktop?: boolean;
  mobile?: boolean;
  home?: boolean;
  interiores?: boolean;
  cpm?: number;
  url?: string;
  unitRate?: number;
};

export type BillingRequest = {
  id?: string;
  orderId: string;
  opportunityId: string;
  clientId: string;
  company?: 'SRL' | 'SAS' | 'AVION';
  date?: string;
  grossAmount?: number;
  adjustment?: number;
  ivaSas?: number;
  amount?: number;
  paymentType?: 'Se paga' | 'Canje' | 'Mixto';
  canjeDescription?: string;
  createdAt?: string;
};

export type AdvertisingOrder = {
  id?: string;
  clientId: string;
  clientName?: string; 
  clientRazonSocial?: string;
  clientCuit?: string;
  agencyId?: string;
  agencyName?: string;
  product: string;
  event?: string;
  accountExecutive: string;
  createdAt: string; 
  createdBy: string;  
  opportunityId?: string; 
  opportunityTitle?: string;
  canjeId?: string;
  tangoOrderNo?: string;
  startDate: string; 
  endDate: string; 
  materialSent: boolean;
  materialUrl?: string; 
  materialUrls?: string[]; 
  observations?: string;
  certReq: boolean;
  agencySale: boolean;
  commissionSrl: number;
  srlItems: AdvertisingOrderItemSrl[];
  adjustmentSrl: number;
  sasItems: AdvertisingOrderItemSas[];
  adjustmentSas: number;
  totalSrl?: number;
  totalSas?: number;
  totalOrder?: number;
  billingRequestsSrl?: Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>[]; 
  billingRequestsSas?: Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>[]; 
  billingRequestsAvion?: Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>[];

  status?: ApprovalStatus;
  adminComments?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvalHistory?: ApprovalHistoryItem[];
  revisionHistory?: AdvertisingOrderRevision[];
};

export type ConvenioCanje = {
  id?: string;
  clientId: string;
  clientName: string;
  advisorId: string;
  advisorName: string;
  opportunityId: string;
  radioEntrega: string;
  clienteEntrega: string;
  fechaInicio: string;
  fechaFin: string;
  observaciones?: string;
  createdAt: string;
  updatedAt?: string;
  masterCanjeId?: string;
};

export type PipelineInteraction = {
  id?: string;
  fecha: string;
  empresa: string;
  contacto?: string;
  tipoInteraccion?: string;
  resultado?: string;
  montoHablado?: number;
  proximoPaso?: string;
  fechaFollowUp?: string;
  estadoPipeline?: string;
  observaciones?: string;
  advisorId: string;
  advisorName: string;
  createdAt: string;
  updatedAt?: string;
};

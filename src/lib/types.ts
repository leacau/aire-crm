

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
  date: string; 
  status: InvoiceStatus;
  dateGenerated: string;
  datePaid?: string;
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
  notes?: string;
  status: ProspectStatus;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  statusChangedAt?: string;
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
  entityType: 'client' | 'person' | 'opportunity' | 'agency' | 'invoice' | 'canje' | 'prospect' | 'user' | 'program' | 'commercial_item' | 'commercial_item_series';
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

export type User = {
  id: string;
  name:string;
  email: string;
  role: UserRole;
  managerId?: string;
  initials?: string;
  photoURL?: string;
  deletedAt?: string;
  vacationDays?: number;
};

export type VacationRequest = {
    id: string;
    userId: string;
    userName: string;
    startDate: string;
    endDate: string;
    daysRequested: number;
    returnDate: string;
    status: 'Pendiente' | 'Aprobado' | 'Rechazado';
    requestDate: string;
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

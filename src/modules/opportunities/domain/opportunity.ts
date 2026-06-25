export const opportunityStages = [
  'Nuevo',
  'Propuesta',
  'Negociación',
  'Negociación a Aprobar',
  'Cerrado - No Definido',
  'Cerrado - Ganado',
  'Cerrado - Perdido',
] as const;

export type OpportunityStage = (typeof opportunityStages)[number];
export type BonificacionEstado = 'Pendiente' | 'Autorizado' | 'Rechazado';
export const periodicidadOptions = ['Ocasional', 'Mensual', 'Trimestral', 'Semestral', 'Anual'] as const;
export type Periodicidad = (typeof periodicidadOptions)[number];
export const formaDePagoOptions = ['Anticipado', 'A fecha', '30 días', '45 días', '60 días', '90 días'] as const;
export type FormaDePago = (typeof formaDePagoOptions)[number];

export type ProposalFile = { name: string; url: string };
export type PautaType = 'Spot' | 'PNT' | 'Sorteo' | 'Nota';
export const pautaTypes: PautaType[] = ['Spot', 'PNT', 'Sorteo', 'Nota'];

export type OrdenPautado = {
  id: string;
  tipoPauta: PautaType;
  programas?: string[];
  dias?: number[];
  fechaInicio?: string;
  fechaFin?: string;
  segundos?: number;
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
  duracionSegundos?: number;
  valorUnitario: number;
  subtotal: number;
};

export type OpportunityPeriod = {
  startDate: string;
  endDate: string;
  value: number;
  updatedAt: string;
  updatedBy?: string;
};

export type Opportunity = {
  id: string;
  organizationId?: string;
  title: string;
  clientName: string;
  clientId: string;
  value: number;
  stage: OpportunityStage;
  highCloseProbability?: boolean;
  closeDate: string;
  details?: string;
  observaciones?: string;
  followUpDone?: string;
  followUpDoneUpdatedAt?: string;
  followUpCurrent?: string;
  followUpCurrentUpdatedAt?: string;
  followUpNext?: string;
  followUpNextUpdatedAt?: string;
  createdAt: string;
  updatedAt?: string;
  manualUpdateDate?: string;
  manualUpdateHistory?: string[];
  stageChangedAt?: string;
  bonificacionDetalle?: string;
  bonificacionEstado?: BonificacionEstado;
  bonificacionPorId?: string;
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
  proposalItems?: ProposalItem[];
  valorTarifario?: number;
  finalizationDate?: string;
  startDate?: string;
  endDate?: string;
  periodHistory?: OpportunityPeriod[];
  ownerId?: string;
  isCanje?: boolean;
};

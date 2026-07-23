export type WorkflowAssignments = {
  approvers: string[];
  billingReceptors: string[];
  tangoInvoicers: string[];
  needLoaders: string[];
  needRequestReceivers: string[];
  canjeRequestReceivers: string[];
  canjeManagementApprovers: string[];
  canjeCommercialReferents: string[];
};

export type ClientTangoUpdate = {
  cuit?: string;
  tangoCompanyId?: string;
  idTango?: string;
  email?: string;
  phone?: string;
  rubro?: string;
  razonSocial?: string;
  razonSocialTango?: string;
  denominacion?: string;
  idAireSrl?: string;
  idAireDigital?: string;
  idAire?: string;
  condicionIVA?: string;
  provincia?: string;
  localidad?: string;
  tipoEntidad?: string;
  observaciones?: string;
};

export type ClientTangoIdField = 'idAire' | 'idAireSrl' | 'idAireDigital';
export type ClientTangoSyncedField = 'isTangoSyncedAire' | 'isTangoSyncedSrl' | 'isTangoSyncedSas';

export type ClientTangoMappingOptions = {
  markSyncedField?: ClientTangoSyncedField;
};

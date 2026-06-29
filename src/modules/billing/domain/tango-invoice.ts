export type TangoCompanyId = '4' | '5' | '6';
export type TangoCompanyFilter = TangoCompanyId | 'all';

export type TangoCompany = {
  id: TangoCompanyId;
  label: string;
  shortLabel: string;
  crmClientField: 'idAire' | 'idAireSrl' | 'idAireDigital';
  sellerCompanySearch: string;
};

export const tangoCompanies: readonly TangoCompany[] = [
  { id: '4', label: 'Aire (Avión)', shortLabel: 'Aire', crmClientField: 'idAire', sellerCompanySearch: 'aire' },
  { id: '5', label: 'SRL', shortLabel: 'SRL', crmClientField: 'idAireSrl', sellerCompanySearch: 'srl' },
  { id: '6', label: 'SAS', shortLabel: 'SAS', crmClientField: 'idAireDigital', sellerCompanySearch: 'sas' },
] as const;

export type TangoInvoice = {
  FECHA_DE_EMISION?: string;
  TIPO_COMPROBANTE?: string;
  COD_TIPO_COMPROBANTE?: string;
  DESC_TIPO_COMPROBANTE?: string;
  NRO_COMPROBANTE?: string;
  COD_VENDEDOR?: string;
  NOMBRE_VENDEDOR?: string;
  COD_CLIENTE?: string;
  RAZON_SOCIAL?: string;
  ID_GVA14?: number | null;
  TOTAL?: number | null;
  ID_GVA12?: number | null;
  ID_GVA23?: number | null;
  ID_GVA38?: number | null;
  _company?: string;
  _companyId?: TangoCompanyId;
};

export type TangoInvoiceQuery = {
  company: TangoCompanyFilter;
  fromDate?: string;
  toDate?: string;
  client?: string;
  seller?: string;
  types?: string;
  clients?: string;
  sellers?: string;
};

export type TangoInvoiceResult = {
  list: TangoInvoice[];
  sourceTotalCount: number;
  filteredCount: number;
  truncated: boolean;
  scope: 'all' | 'own';
};

export type ClientTangoInvoiceQuery = {
  aireClientId?: string;
  srlClientId?: string;
  sasClientId?: string;
};

export type TangoBillingSummary = {
  total: number;
  fromDate: string;
  toDate: string;
  companies: Array<{
    company: TangoCompanyId;
    label: string;
    total: number;
    invoiceCount: number;
  }>;
};

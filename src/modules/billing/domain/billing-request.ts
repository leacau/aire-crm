export const billingRequestStatuses = ['Sugerido', 'Solicitado', 'Elevado', 'Confeccionado'] as const;

export type BillingRequestStatus = (typeof billingRequestStatuses)[number];

export type BillingRequestCompany = 'SRL' | 'SAS' | 'AVION';

export type BillingRequest = {
  id: string;
  orderId?: string;
  opportunityId?: string;
  clientId?: string;
  company?: BillingRequestCompany;
  date?: string;
  grossAmount?: number;
  adjustment?: number;
  ivaSas?: number;
  amount?: number;
  paymentType?: 'Se paga' | 'Canje' | 'Mixto';
  canjeDescription?: string;
  billingStatus: BillingRequestStatus;
  invoiceNumber?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type BillingRequestWithMetadata = BillingRequest & {
  accountExecutive: string;
  advisorId: string;
  opportunityTitle: string;
  clientDisplayName: string;
  cuit: string;
};

export type BillingRequestTransitionInput = {
  status: BillingRequestStatus;
  invoiceNumber?: string;
  emailPayload?: {
    accessToken?: string;
    loggedUser?: string;
  };
};

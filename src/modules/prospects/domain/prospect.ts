export const prospectStatusOptions = [
  'Nuevo',
  'Contactado',
  'Calificado',
  'No Próspero',
  'Convertido',
] as const;

export type ProspectStatus = (typeof prospectStatusOptions)[number];

export type Prospect = {
  id: string;
  organizationId?: string;
  companyName: string;
  cuit?: string;
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
  updatedAt?: string;
};

export type CreateProspectInput = Omit<
  Prospect,
  'id' | 'organizationId' | 'createdAt' | 'ownerId' | 'ownerName' | 'updatedAt'
>;

export type UpdateProspectInput = Partial<Omit<Prospect, 'id'>>;

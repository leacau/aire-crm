export type TipoEntidad = 'Pública' | 'Privada' | 'Mixta';

export type CondicionIVA =
  | 'Responsable Inscripto'
  | 'Monotributista'
  | 'Exento'
  | 'Consumidor Final';

export type Person = {
  id: string;
  organizationId?: string;
  name: string;
  email?: string;
  phone?: string;
  cargo?: string;
  observaciones?: string;
  clientIds: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type Client = {
  id: string;
  organizationId?: string;
  denominacion: string;
  razonSocial: string;
  razonSocialTango?: string;
  cuit?: string;
  idTango?: string;
  tangoCompanyId?: string;
  idAireSrl?: string;
  idAireDigital?: string;
  idAire?: string;
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
  allowCanjes?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateClientInput = Omit<
  Client,
  | 'id'
  | 'organizationId'
  | 'personIds'
  | 'ownerId'
  | 'ownerName'
  | 'deactivationHistory'
  | 'newClientDate'
  | 'createdAt'
  | 'updatedAt'
>;

export type UpdateClientInput = Partial<Omit<Client, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>;
export type CreatePersonInput = Omit<Person, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>;
export type UpdatePersonInput = Partial<Omit<Person, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'clientIds'>>;

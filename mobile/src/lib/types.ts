export type UserRole = 'Asesor' | 'Administracion' | 'Admin' | 'Jefe' | 'Gerencia' | 'Import' | 'Asesor Canjes';

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  area?: string;
  photoURL?: string;
};

export type AuthSession = {
  user: User;
  permissions: Record<string, unknown>;
};

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
  type: string;
  observation: string;
  timestamp: string;
  isTask: boolean;
  dueDate?: string;
  completed?: boolean;
};

export type Client = {
  id: string;
  denominacion: string;
  razonSocial?: string;
  ownerId: string;
  ownerName: string;
  phone?: string;
  email?: string;
  localidad?: string;
  provincia?: string;
};

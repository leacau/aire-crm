export type OpportunityStage =
  | 'New'
  | 'Proposal'
  | 'Negotiation'
  | 'Closed Won'
  | 'Closed Lost';

export type Opportunity = {
  id: string;
  title: string;
  clientName: string;
  clientId: string;
  value: number;
  stage: OpportunityStage;
  closeDate: string;
  ownerId: string;
};

export type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  avatarUrl: string;
  avatarFallback: string;
};

export type Activity = {
  id: string;
  type: 'Call' | 'Email' | 'Meeting' | 'Note';
  subject: string;
  date: string;
  notes: string;
  clientId: string;
  opportunityId?: string;
};

export type User = {
  id: string;
  name:string;
  avatarUrl: string;
  initials: string;
};

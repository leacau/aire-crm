export { opportunityStages } from './domain/opportunity';
export type {
  BonificacionEstado,
  FormaDePago,
  Opportunity,
  OpportunityPeriod,
  OpportunityStage,
  OrdenPautado,
  PautaType,
  Periodicidad,
  ProposalFile,
  ProposalItem,
} from './domain/opportunity';
export {
  getAllOpportunities,
  getOpportunities,
  getOpportunitiesByClientId,
  getOpportunitiesForUser,
  getOpportunityById,
} from './infrastructure/http/opportunity-api-client';

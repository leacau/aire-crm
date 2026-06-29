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
  createOpportunity,
  deleteOpportunity,
  getAllOpportunities,
  getOpportunities,
  getOpportunitiesByClientId,
  getOpportunitiesForUser,
  getOpportunityById,
  updateOpportunity,
} from './infrastructure/http/opportunity-api-client';

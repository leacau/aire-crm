export { prospectStatusOptions } from './domain/prospect';
export type {
  CreateProspectInput,
  Prospect,
  ProspectStatus,
  UpdateProspectInput,
} from './domain/prospect';
export {
  approveProspectClaim,
  claimProspect,
  createProspect,
  deleteProspect,
  getProspects,
  rejectProspectClaim,
  updateProspect,
} from './infrastructure/http/prospect-api-client';

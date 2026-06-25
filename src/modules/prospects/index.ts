export {
  prospectStatusOptions,
} from './domain/prospect';
export type {
  CreateProspectInput,
  Prospect,
  ProspectStatus,
  UpdateProspectInput,
} from './domain/prospect';
export type {
  ProspectActor,
  ProspectRepository,
} from './application/prospect-repository';
export {
  approveProspectClaim,
  bulkReleaseProspects,
  claimProspect,
  createProspect,
  deleteProspect,
  getProspects,
  recordProspectNotifications,
  rejectProspectClaim,
  updateProspect,
} from './infrastructure/legacy-prospect-service';

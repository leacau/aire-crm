/**
 * Temporary compatibility adapter.
 *
 * Consumers import the Prospectos public API while its current Firebase
 * implementation is moved behind the server API. Keeping this adapter small
 * gives the module one replaceable infrastructure seam without a big-bang
 * rewrite.
 */
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
} from '@/lib/firebase-service';

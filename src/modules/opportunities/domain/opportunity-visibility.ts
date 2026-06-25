import type { Opportunity } from './opportunity';

export function isOpportunityVisibleInActiveScope(
  opportunity: Opportunity,
  now: Date = new Date(),
): boolean {
  if (opportunity.stage !== 'Cerrado - Perdido') return true;
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - 3);
  return Date.parse(opportunity.createdAt) >= threshold.getTime();
}

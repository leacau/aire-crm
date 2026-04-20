import { addMonths, parseISO, isAfter, isBefore, addDays, differenceInDays } from 'date-fns';
import type { Opportunity } from './types';

export const getOpportunityEndDate = (opp: Opportunity): Date | null => {
  // 1. Si ya tiene el nuevo formato con endDate
  if (opp.endDate) return parseISO(opp.endDate);

  // 2. Si es formato viejo (Periodicidad fija)
  if (opp.createdAt && opp.periodicidad && opp.periodicidad.length > 0) {
    const start = parseISO(opp.createdAt);
    let months = 0;
    switch (opp.periodicidad[0]) {
      case 'Mensual': months = 1; break;
      case 'Trimestral': months = 3; break;
      case 'Semestral': months = 6; break;
      case 'Anual': months = 12; break;
      default: return null; // Ocasional no tiene vencimiento fijo
    }
    return addMonths(start, months);
  }

  return null;
};

export const isOpportunityActive = (opp: Opportunity): boolean => {
  if (opp.stage !== 'Cerrado - Ganado') return false;
  const endDate = getOpportunityEndDate(opp);
  if (!endDate) return true; // Si es ocasional o no tiene fecha, la consideramos activa
  return isAfter(endDate, new Date());
};

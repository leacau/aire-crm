import { addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Client, Invoice, Opportunity, OpportunityStage, Prospect, User } from './types';
import { getManualInvoiceDate } from './invoice-utils';

export type AdvisorAlertSeverity = 'info' | 'warning' | 'critical';
export type AdvisorAlertType = 'invoice' | 'prospect' | 'client' | 'opportunity' | 'stage';

export type AdvisorAlert = {
  id: string;
  type: AdvisorAlertType;
  title: string;
  description: string;
  severity: AdvisorAlertSeverity;
  meta?: { label: string; value: string }[];
  shouldEmail: boolean;
  emailSummary: string;
  entityHref?: string;
};

interface BuildAdvisorAlertsInput {
  user: User;
  opportunities: Opportunity[];
  clients: Client[];
  invoices: Invoice[];
  prospects: Prospect[];
  today?: Date;
}

const stageThresholds: Partial<Record<OpportunityStage, number>> = {
  'Nuevo': 7,
  'Propuesta': 3,
  'Negociación': 7,
  'Negociación a Aprobar': 1,
};

const severityWeights: Record<AdvisorAlertSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

const getPeriodDurationInMonths = (period?: string): number => {
  switch (period) {
    case 'Mensual':
      return 1;
    case 'Trimestral':
      return 3;
    case 'Semestral':
      return 6;
    case 'Anual':
      return 12;
    default:
      return 1;
  }
};

const safeParseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  try {
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch (error) {
    return null;
  }
};

const getOpportunityReferenceDate = (opportunity: Opportunity): Date | null => {
  const manualDate = safeParseDate(opportunity.manualUpdateDate);
  if (manualDate) return manualDate;

  const ordenStartDates = (opportunity.ordenesPautado || [])
    .map(orden => safeParseDate(orden.fechaInicio))
    .filter((date): date is Date => !!date)
    .sort((a, b) => a.getTime() - b.getTime());

  if (ordenStartDates.length > 0) return ordenStartDates[0];

  const closeDate = safeParseDate(opportunity.closeDate);
  if (closeDate) return closeDate;

  return safeParseDate(opportunity.createdAt);
};

const getOpportunityProjectedEndDate = (opportunity: Opportunity): Date | null => {
  const explicitFinal = safeParseDate(opportunity.finalizationDate);
  if (explicitFinal) return explicitFinal;

  const referenceDate = getOpportunityReferenceDate(opportunity);
  if (!referenceDate) return null;

  const period = opportunity.periodicidad?.[0];
  const durationMonths = getPeriodDurationInMonths(period);
  const projected = addMonths(referenceDate, durationMonths);
  return projected;
};

const formatDate = (date: Date | null) => {
  if (!date) return 'Sin fecha';
  return format(date, 'PPP', { locale: es });
};

export const buildAdvisorAlerts = ({
  user,
  opportunities,
  clients,
  invoices,
  prospects,
  today = new Date(),
}: BuildAdvisorAlertsInput): AdvisorAlert[] => {
  const userClientIds = new Set(clients.filter(client => client.ownerId === user.id).map(client => client.id));
  if (userClientIds.size === 0) return [];

  const userClients = clients.filter(client => userClientIds.has(client.id));
  const userOpportunities = opportunities.filter(opportunity => userClientIds.has(opportunity.clientId));
  const opportunityMap = new Map(userOpportunities.map(opportunity => [opportunity.id, opportunity]));
  const clientMap = new Map(userClients.map(client => [client.id, client]));

  const userInvoices = invoices.filter(invoice => opportunityMap.has(invoice.opportunityId));
  const userProspects = prospects.filter(prospect => prospect.ownerId === user.id);

  const alerts: AdvisorAlert[] = [];
  const actionableDate = today;

  // Invoice alerts
  userInvoices.forEach(invoice => {
    if (invoice.status === 'Pagada') return;
    const invoiceDate = getManualInvoiceDate(invoice) || safeParseDate(invoice.dateGenerated);
    if (!invoiceDate) return;

    const daysSince = differenceInCalendarDays(actionableDate, invoiceDate);
    if (daysSince < 7) return;

    const opportunity = opportunityMap.get(invoice.opportunityId);
    const client = opportunity ? clientMap.get(opportunity.clientId) : undefined;

    const shouldEmail = (daysSince - 7) % 3 === 0;
    alerts.push({
      id: `invoice-${invoice.id}`,
      type: 'invoice',
      title: 'Factura sin marcar como pagada',
      description: `La factura ${invoice.invoiceNumber || invoice.id} lleva ${daysSince} días sin cobrarse desde su fecha de emisión.`,
      severity: daysSince >= 14 ? 'critical' : 'warning',
      meta: [
        client ? { label: 'Cliente', value: client.denominacion } : undefined,
        opportunity ? { label: 'Oportunidad', value: opportunity.title } : undefined,
        { label: 'Días sin pago', value: `${daysSince}` },
      ].filter((item): item is { label: string; value: string } => !!item),
      shouldEmail,
      emailSummary: `Factura ${invoice.invoiceNumber || invoice.id} (${client?.denominacion || 'Cliente sin nombre'}) acumula ${daysSince} días sin registrarse como pagada.`,
      entityHref: '/billing?tab=to-collect',
    });
  });

  // Prospect inactivity alerts
  userProspects.forEach(prospect => {
    const lastChange = safeParseDate(prospect.statusChangedAt || prospect.createdAt);
    if (!lastChange) return;

    const daysSince = differenceInCalendarDays(actionableDate, lastChange);
    if (daysSince < 3) return;

    const shouldEmail = (daysSince - 3) % 3 === 0;
    alerts.push({
      id: `prospect-${prospect.id}`,
      type: 'prospect',
      title: 'Prospecto sin avances',
      description: `${prospect.companyName} permanece en "${prospect.status}" desde hace ${daysSince} días.`,
      severity: daysSince >= 6 ? 'warning' : 'info',
      meta: [
        { label: 'Contacto', value: prospect.contactName || 'Sin datos' },
        { label: 'Último cambio', value: formatDate(lastChange) },
      ],
      shouldEmail,
      emailSummary: `Prospecto ${prospect.companyName} sigue en "${prospect.status}" hace ${daysSince} días.`,
      entityHref: `/prospects?prospectId=${prospect.id}`,
    });
  });

  // Clients without opportunities
  const clientsWithoutOpportunities = userClients.filter(client => !userOpportunities.some(opportunity => opportunity.clientId === client.id));
  if (clientsWithoutOpportunities.length > 0) {
    const isStartOfMonth = actionableDate.getDate() <= 3;
    clientsWithoutOpportunities.forEach(clientWithoutOpportunity => {
      alerts.push({
        id: `client-without-opportunities-${clientWithoutOpportunity.id}`,
        type: 'client',
        title: 'Cliente sin propuestas activas',
        description: `${clientWithoutOpportunity.denominacion} todavía no tiene oportunidades cargadas.`,
        severity: 'info',
        meta: [{ label: 'Cliente', value: clientWithoutOpportunity.denominacion }],
        shouldEmail: isStartOfMonth,
        emailSummary: `${clientWithoutOpportunity.denominacion} sin oportunidades activas.`,
        entityHref: `/clients/${clientWithoutOpportunity.id}`,
      });
    });
  }

  // Finalization alerts
  userOpportunities.forEach(opportunity => {
    if (opportunity.finalizationDate) return;
    const endDate = getOpportunityProjectedEndDate(opportunity);
    if (!endDate) return;

    const daysUntilEnd = differenceInCalendarDays(endDate, actionableDate);
    if (daysUntilEnd < 0 || daysUntilEnd > 20) return;

    const client = clientMap.get(opportunity.clientId);
    alerts.push({
      id: `opportunity-end-${opportunity.id}`,
      type: 'opportunity',
      title: 'Propuesta próxima a finalizar',
      description: `${opportunity.title} terminará en ${daysUntilEnd} día(s).`,
      severity: daysUntilEnd <= 10 ? 'critical' : 'warning',
      meta: [
        client ? { label: 'Cliente', value: client.denominacion } : undefined,
        { label: 'Fecha estimada', value: formatDate(endDate) },
      ].filter((item): item is { label: string; value: string } => !!item),
      shouldEmail: daysUntilEnd === 20,
      emailSummary: `La propuesta ${opportunity.title} finalizará el ${formatDate(endDate)} (${daysUntilEnd} días).`,
      entityHref: `/opportunities?opportunityId=${opportunity.id}`,
    });
  });

  // Stage duration alerts
  userOpportunities.forEach(opportunity => {
    const threshold = stageThresholds[opportunity.stage];
    if (!threshold) return;

    const stageAnchor = safeParseDate(opportunity.stageChangedAt || opportunity.updatedAt || opportunity.createdAt);
    if (!stageAnchor) return;

    const daysInStage = differenceInCalendarDays(actionableDate, stageAnchor);
    if (daysInStage < threshold) return;

    const client = clientMap.get(opportunity.clientId);
    alerts.push({
      id: `stage-${opportunity.id}`,
      type: 'stage',
      title: `Oportunidad en ${opportunity.stage}`,
      description: `${opportunity.title} lleva ${daysInStage} días en la etapa ${opportunity.stage}.`,
      severity: daysInStage >= threshold + 3 ? 'critical' : 'warning',
      meta: [
        client ? { label: 'Cliente', value: client.denominacion } : undefined,
        { label: 'Días en etapa', value: `${daysInStage}` },
      ].filter((item): item is { label: string; value: string } => !!item),
      shouldEmail: true,
      emailSummary: `${opportunity.title} permanece ${daysInStage} días en ${opportunity.stage}.`,
      entityHref: `/opportunities?opportunityId=${opportunity.id}`,
    });
  });

  return alerts.sort((a, b) => severityWeights[b.severity] - severityWeights[a.severity]);
};

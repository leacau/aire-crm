import type {
  AdvertisingOrder,
  AdvertisingOrderChange,
  AdvertisingOrderItemSas,
  AdvertisingOrderItemSrl,
  BillingRequest,
} from './types';

type ComparableOrder = Partial<AdvertisingOrder>;
type BillingItem = Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>;

const text = (value: unknown) => {
  if (value === undefined || value === null || value === '') return 'Sin dato';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
};

const money = (value: unknown) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
    .format(Number(value) || 0);

const date = (value: unknown) => {
  if (!value) return 'Sin fecha';
  const raw = String(value);
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('es-AR');
};

const summarizeSrl = (item: AdvertisingOrderItemSrl) => {
  const spots = Object.entries(item.dailySpots || {})
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([day, quantity]) => `${date(day)}: ${quantity}`)
    .join(', ');
  return [
    item.month || 'Sin mes',
    item.adType || 'Sin tipo',
    item.customType,
    item.programId ? `Programa ${item.programId}` : undefined,
    item.seconds ? `${item.seconds}s` : undefined,
    `Tarifa ${money(item.unitRate)}`,
    spots ? `Pauta ${spots}` : 'Sin días pautados',
  ].filter(Boolean).join(' | ');
};

const summarizeSas = (item: AdvertisingOrderItemSas) => [
  item.month || 'Sin mes',
  item.format || 'Sin formato',
  item.type,
  item.detail,
  item.customDetail,
  item.observations,
  item.cpm ? `CPM ${item.cpm}` : undefined,
  `Tarifa ${money(item.unitRate)}`,
].filter(Boolean).join(' | ');

const summarizeBilling = (company: string, item: BillingItem) => [
  company,
  date(item.date),
  `Bruto ${money(item.grossAmount)}`,
  `Ajuste ${money(item.adjustment)}`,
  item.ivaSas ? `IVA ${money(item.ivaSas)}` : undefined,
  `Total ${money(item.amount)}`,
  item.paymentType,
  item.canjeDescription,
].filter(Boolean).join(' | ');

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${key}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

const addScalarChange = (
  changes: AdvertisingOrderChange[],
  field: string,
  label: string,
  before: unknown,
  after: unknown,
  formatter: (value: unknown) => string = text,
) => {
  if (stable(before) === stable(after)) return;
  changes.push({
    field,
    label,
    kind: before === undefined || before === null || before === ''
      ? 'Agregado'
      : after === undefined || after === null || after === ''
        ? 'Quitado'
        : 'Modificado',
    before: formatter(before),
    after: formatter(after),
  });
};

const addArrayChanges = <T>(
  changes: AdvertisingOrderChange[],
  field: string,
  label: string,
  before: T[] = [],
  after: T[] = [],
  identity: (item: T) => string,
  summarize: (item: T) => string,
  includeStructuredValue = false,
) => {
  const group = (items: T[]) => items.reduce((map, item) => {
    const key = identity(item);
    const bucket = map.get(key) || [];
    bucket.push(item);
    map.set(key, bucket);
    return map;
  }, new Map<string, T[]>());
  const previous = group(before);
  const current = group(after);

  new Set([...previous.keys(), ...current.keys()]).forEach(key => {
    const oldItems = previous.get(key) || [];
    const newItems = current.get(key) || [];
    const paired = Math.min(oldItems.length, newItems.length);

    for (let index = 0; index < paired; index += 1) {
      if (stable(oldItems[index]) !== stable(newItems[index])) {
        const change: AdvertisingOrderChange = {
          field,
          label,
          kind: 'Modificado',
          before: summarize(oldItems[index]),
          after: summarize(newItems[index]),
        };
        if (includeStructuredValue) {
          change.beforeValue = oldItems[index] as AdvertisingOrderChange['beforeValue'];
          change.afterValue = newItems[index] as AdvertisingOrderChange['afterValue'];
        }
        changes.push(change);
      }
    }
    for (let index = paired; index < oldItems.length; index += 1) {
      changes.push({
        field,
        label,
        kind: 'Quitado',
        before: summarize(oldItems[index]),
        ...(includeStructuredValue
          ? { beforeValue: oldItems[index] as AdvertisingOrderChange['beforeValue'] }
          : {}),
      });
    }
    for (let index = paired; index < newItems.length; index += 1) {
      changes.push({
        field,
        label,
        kind: 'Agregado',
        after: summarize(newItems[index]),
        ...(includeStructuredValue
          ? { afterValue: newItems[index] as AdvertisingOrderChange['afterValue'] }
          : {}),
      });
    }
  });
};

export const buildAdvertisingOrderChanges = (
  previous: ComparableOrder,
  next: ComparableOrder,
): AdvertisingOrderChange[] => {
  const changes: AdvertisingOrderChange[] = [];

  addScalarChange(changes, 'clientId', 'Cliente', previous.clientName || previous.clientId, next.clientName || next.clientId);
  addScalarChange(changes, 'agencyId', 'Agencia', previous.agencyName || previous.agencyId, next.agencyName || next.agencyId);
  addScalarChange(changes, 'opportunityId', 'Oportunidad', previous.opportunityTitle || previous.opportunityId, next.opportunityTitle || next.opportunityId);
  addScalarChange(changes, 'accountExecutive', 'Ejecutivo de cuenta', previous.accountExecutive, next.accountExecutive);
  addScalarChange(changes, 'tangoOrderNo', 'Número de orden Tango', previous.tangoOrderNo, next.tangoOrderNo);
  addScalarChange(changes, 'startDate', 'Inicio de vigencia', previous.startDate, next.startDate, date);
  addScalarChange(changes, 'endDate', 'Fin de vigencia', previous.endDate, next.endDate, date);
  addScalarChange(changes, 'materialSent', 'Material enviado', previous.materialSent, next.materialSent);
  addScalarChange(changes, 'materialUrls', 'Materiales', previous.materialUrls || previous.materialUrl, next.materialUrls || next.materialUrl);
  addScalarChange(changes, 'observations', 'Observaciones', previous.observations, next.observations);
  addScalarChange(changes, 'certReq', 'Requiere certificación', previous.certReq, next.certReq);
  addScalarChange(changes, 'agencySale', 'Venta por agencia', previous.agencySale, next.agencySale);
  addScalarChange(changes, 'commissionSrl', 'Comisión SRL', previous.commissionSrl, next.commissionSrl, money);
  addScalarChange(changes, 'adjustmentSrl', 'Ajuste SRL', previous.adjustmentSrl, next.adjustmentSrl, money);
  addScalarChange(changes, 'adjustmentSas', 'Ajuste SAS', previous.adjustmentSas, next.adjustmentSas, money);

  addArrayChanges(changes, 'srlItems', 'Contenido SRL', previous.srlItems, next.srlItems, item => `${item.month}|${item.programId}|${item.adType}`, summarizeSrl, true);
  addArrayChanges(changes, 'sasItems', 'Contenido SAS', previous.sasItems, next.sasItems, item => `${item.month}|${item.format}|${item.type}`, summarizeSas, true);
  addArrayChanges(changes, 'billingRequestsSrl', 'Facturación SRL', previous.billingRequestsSrl, next.billingRequestsSrl, item => `${item.date}`, item => summarizeBilling('SRL', item));
  addArrayChanges(changes, 'billingRequestsSas', 'Facturación SAS', previous.billingRequestsSas, next.billingRequestsSas, item => `${item.date}`, item => summarizeBilling('SAS', item));
  addArrayChanges(changes, 'billingRequestsAvion', 'Facturación AVIÓN', previous.billingRequestsAvion, next.billingRequestsAvion, item => `${item.date}`, item => summarizeBilling('AVIÓN', item));

  return changes;
};

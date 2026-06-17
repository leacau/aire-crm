'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCcw } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdvertisingOrdersForDateRange, getPrograms } from '@/lib/firebase-service';
import type { AdvertisingOrder, AdvertisingOrderItemSrl, Program } from '@/lib/types';
import { cn } from '@/lib/utils';

type ActiveAction = {
  id: string;
  orderId: string;
  clientName: string;
  product: string;
  programId: string;
  programName: string;
  adType: string;
  seconds?: number;
  quantity: number;
  dateKey: string;
  hasTv?: boolean;
};

type WeekDay = {
  date: Date;
  key: string;
};

type ActionTypeSummary = {
  type: string;
  quantity: number;
  seconds: number;
};

const toDateKey = (date: Date) => format(date, 'yyyy-MM-dd');

const dateValueToKey = (value?: string) => {
  if (!value) return '';
  const datePart = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : toDateKey(parsed);
};

const getWeekDays = (weekAnchor: Date) => {
  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return { date, key: toDateKey(date) };
  });
};

const isOrderVisible = (order: AdvertisingOrder, dateKey: string) => {
  const startKey = dateValueToKey(order.startDate);
  const endKey = dateValueToKey(order.endDate || order.startDate);
  if (!startKey || !endKey) return false;
  return dateKey >= startKey && dateKey <= endKey;
};

const getActionType = (action: Pick<ActiveAction, 'adType'>) => {
  const rawType = action.adType || 'Accion';
  const normalized = rawType.toLowerCase();
  if (normalized.includes('spot')) return 'Spot';
  if (normalized.includes('pnt')) return 'PNT';
  if (normalized.includes('nota')) return 'Nota Comercial';
  return rawType;
};

const getTypeOrder = (type: string) => {
  const normalized = type.toLowerCase();
  if (normalized === 'spot') return 1;
  if (normalized === 'pnt') return 2;
  if (normalized.includes('nota')) return 3;
  return 10;
};

const groupActionsByType = (actions: ActiveAction[]) => {
  const grouped = new Map<string, ActiveAction[]>();
  actions.forEach(action => {
    const type = getActionType(action);
    grouped.set(type, [...(grouped.get(type) || []), action]);
  });
  return Array.from(grouped.entries())
    .sort(([left], [right]) => getTypeOrder(left) - getTypeOrder(right) || left.localeCompare(right));
};

const getProgramSummaries = (dayMap?: Map<string, ActiveAction[]>) => {
  const summary = new Map<string, ActionTypeSummary>();
  dayMap?.forEach(actions => {
    actions.forEach(action => {
      const type = getActionType(action);
      const current = summary.get(type) || { type, quantity: 0, seconds: 0 };
      current.quantity += action.quantity;
      if (type === 'Spot') current.seconds += action.quantity * (Number(action.seconds) || 0);
      summary.set(type, current);
    });
  });
  return Array.from(summary.values())
    .sort((left, right) => getTypeOrder(left.type) - getTypeOrder(right.type) || left.type.localeCompare(right.type));
};

const formatSummary = (summary: ActionTypeSummary) => {
  if (summary.type === 'Spot') return `Spots: ${summary.quantity} (total ${summary.seconds}s)`;
  if (summary.type === 'PNT') return `PNT's: ${summary.quantity}`;
  if (summary.type === 'Nota Comercial') return `Nota Comercial: ${summary.quantity}`;
  return `${summary.type}: ${summary.quantity}`;
};

export default function ActiveProgrammingPage() {
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [programs, setPrograms] = useState<Program[]>([]);
  const [orders, setOrders] = useState<AdvertisingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDayKey, setSelectedDayKey] = useState(toDateKey(new Date()));

  const days = useMemo(() => getWeekDays(weekAnchor), [weekAnchor]);
  const rangeStart = days[0].date;
  const rangeEnd = days[days.length - 1].date;

  const rangeStartKey = rangeStart.toISOString();
  const rangeEndKey = rangeEnd.toISOString();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedPrograms, fetchedOrders] = await Promise.all([
        getPrograms(),
        getAdvertisingOrdersForDateRange(rangeStart, endOfWeek(rangeEnd, { weekStartsOn: 1 })),
      ]);
      setPrograms(fetchedPrograms);
      setOrders(fetchedOrders);
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    loadData();
  }, [loadData, rangeStartKey, rangeEndKey]);

  const actionsByProgramAndDay = useMemo(() => {
    const programMap = new Map(programs.map(program => [program.id, program]));
    const grouped = new Map<string, Map<string, ActiveAction[]>>();

    orders.forEach(order => {
      (order.srlItems || []).forEach((item: AdvertisingOrderItemSrl, itemIndex) => {
        if (!item.programId || item.programId === 'Personalizado') return;
        const program = programMap.get(item.programId);
        const programName = program?.name || item.programId;

        days.forEach(day => {
          const dateKey = day.key;
          const quantity = Number(item.dailySpots?.[dateKey] || 0);
          if (quantity <= 0 || !isOrderVisible(order, dateKey)) return;

          const action: ActiveAction = {
            id: `${order.id}-${itemIndex}-${dateKey}`,
            orderId: order.id || '',
            clientName: order.clientName || 'Cliente sin nombre',
            product: order.product || order.opportunityTitle || 'Orden de publicidad',
            programId: item.programId || '',
            programName,
            adType: item.adType || item.customType || 'Accion',
            seconds: item.seconds,
            quantity,
            dateKey,
            hasTv: item.hasTv,
          };

          if (!grouped.has(action.programId)) grouped.set(action.programId, new Map());
          const dayMap = grouped.get(action.programId)!;
          dayMap.set(dateKey, [...(dayMap.get(dateKey) || []), action]);
        });
      });
    });

    return grouped;
  }, [orders, programs, days]);

  const visiblePrograms = useMemo(() => {
    const term = search.trim().toLowerCase();
    const programsWithActions = programs.filter(program => actionsByProgramAndDay.has(program.id));
    if (!term) return programsWithActions;
    return programsWithActions.filter(program => {
      const nameMatch = program.name.toLowerCase().includes(term);
      const actionMatch = days.some(day => {
        const actions = actionsByProgramAndDay.get(program.id)?.get(day.key) || [];
        return actions.some(action =>
          action.clientName.toLowerCase().includes(term)
          || action.product.toLowerCase().includes(term)
          || action.adType.toLowerCase().includes(term)
        );
      });
      return nameMatch || actionMatch;
    });
  }, [actionsByProgramAndDay, days, programs, search]);

  return (
    <div className="flex h-full flex-col">
      <Header title="Acciones Vigentes">
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </Header>

      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setWeekAnchor(previous => subWeeks(previous, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setWeekAnchor(new Date())}>
              Semana actual
            </Button>
            <Button variant="outline" size="icon" onClick={() => setWeekAnchor(previous => addWeeks(previous, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-2 text-sm font-medium">
              {format(rangeStart, "dd 'de' MMM", { locale: es })} al {format(rangeEnd, "dd 'de' MMM yyyy", { locale: es })}
            </div>
          </div>
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar programa, cliente o accion..."
            className="w-full md:max-w-sm"
          />
        </div>

        {loading ? (
          <div className="flex h-80 items-center justify-center">
            <Spinner size="large" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-background">
            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 w-[220px] bg-muted font-semibold">Programa</TableHead>
                    {days.map(day => {
                      const isSelected = selectedDayKey === day.key;
                      return (
                      <TableHead
                        key={day.key}
                        className={cn(
                          'cursor-pointer select-none transition-colors',
                          isSameDay(day.date, new Date()) && 'bg-primary/10',
                          isSelected && 'bg-red-100 ring-1 ring-inset ring-red-300',
                        )}
                        onClick={() => setSelectedDayKey(day.key)}
                      >
                        <div className="text-sm font-semibold capitalize">{format(day.date, 'EEEE', { locale: es })}</div>
                        <div className="text-xs text-muted-foreground">{format(day.date, 'dd/MM')}</div>
                      </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePrograms.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                        No hay acciones comerciales vigentes para esta semana.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visiblePrograms.map(program => {
                      const summaries = getProgramSummaries(actionsByProgramAndDay.get(program.id));
                      return (
                      <TableRow key={program.id}>
                        <TableCell className="sticky left-0 z-10 bg-background align-top">
                          <div className="font-semibold">{program.name}</div>
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {summaries.map(summary => (
                              <div key={summary.type}>{formatSummary(summary)}</div>
                            ))}
                          </div>
                        </TableCell>
                        {days.map(day => {
                          const dateKey = day.key;
                          const actions = actionsByProgramAndDay.get(program.id)?.get(dateKey) || [];
                          const isSelected = selectedDayKey === dateKey;
                          return (
                            <TableCell
                              key={dateKey}
                              className={cn(
                                'min-w-[155px] align-top transition-colors',
                                isSelected && 'bg-red-50/80 ring-1 ring-inset ring-red-100',
                              )}
                              onClick={() => setSelectedDayKey(dateKey)}
                            >
                              <div className="space-y-3">
                                {groupActionsByType(actions).map(([type, typeActions]) => (
                                  <div key={type} className="space-y-2 rounded-md border-l-4 border-l-primary/40 pl-2">
                                    <div className="text-[11px] font-semibold uppercase text-muted-foreground">{type}</div>
                                    {typeActions.map(action => (
                                      <Link
                                        key={action.id}
                                        href={`/publicidad/${action.orderId}`}
                                        className="block rounded-md border bg-card p-2 text-xs shadow-sm transition hover:border-primary hover:bg-primary/5"
                                      >
                                        <div className="mb-1 flex items-start justify-between gap-2">
                                          <span className="font-semibold leading-tight">{action.clientName}</span>
                                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                        </div>
                                        <div className="line-clamp-2 text-muted-foreground">{action.product}</div>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                          <Badge variant="secondary" className="text-[10px]">{action.adType}</Badge>
                                          {action.seconds ? <Badge variant="outline" className="text-[10px]">{action.seconds}s</Badge> : null}
                                          {action.hasTv ? <Badge variant="outline" className="text-[10px]">TV</Badge> : null}
                                          <Badge variant="outline" className="text-[10px]">x{action.quantity}</Badge>
                                        </div>
                                      </Link>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

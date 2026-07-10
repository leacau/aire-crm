'use client';

import { useEffect, useMemo, useState } from 'react';
import { startOfMonth, endOfMonth } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { getObjectiveVisibilityConfig } from '@/lib/api/system';
import { Trophy } from 'lucide-react';
import { getObjectiveForDate, resolveObjectiveAnchorDate } from '@/lib/objective-utils';
import { fetchTangoObjectiveInvoices, summarizeTangoObjectiveBilling } from '@/lib/tango-objective-billing';

const HIDDEN_ROLES = new Set(['Jefe', 'Gerencia', 'Administracion', 'Admin']);

interface ObjectiveMetrics {
  monthlyObjective: number;
  currentMonthBilling: number;
  invoiceCount: number;
}

export function ObjectiveReminderBanner() {
  const { userInfo } = useAuth();
  const [metrics, setMetrics] = useState<ObjectiveMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [anchorDate, setAnchorDate] = useState<Date | null>(null);

  const shouldHide = !userInfo || HIDDEN_ROLES.has(userInfo.role);

  useEffect(() => {
    if (shouldHide || !userInfo) {
      setMetrics(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const loadMetrics = async () => {
      if (!isMounted) return;
      setLoading(true);
      try {
        const visibility = await getObjectiveVisibilityConfig();
        if (!isMounted) return;

        const today = new Date();
        const anchor = resolveObjectiveAnchorDate(today, visibility);
        setAnchorDate(anchor);
        const currentMonthStart = startOfMonth(anchor);
        const currentMonthEnd = endOfMonth(anchor);
        const tangoInvoices = await fetchTangoObjectiveInvoices(currentMonthStart, currentMonthEnd);
        const billing = summarizeTangoObjectiveBilling(tangoInvoices, currentMonthStart, currentMonthEnd);

        const { value: monthlyObjective } = getObjectiveForDate(userInfo, anchor);

        setMetrics({
          monthlyObjective,
          currentMonthBilling: billing.total,
          invoiceCount: billing.count,
        });
        setLoading(false);
      } catch (error) {
        console.error('Error cargando el objetivo global', error);
        if (isMounted) {
          const fallbackDate = new Date();
          setAnchorDate(fallbackDate);
          const { value: monthlyObjective } = getObjectiveForDate(userInfo, fallbackDate);

          setMetrics({
            monthlyObjective,
            currentMonthBilling: 0,
            invoiceCount: 0,
          });
          setLoading(false);
        }
      }
    };

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(loadMetrics, { timeout: 1500 });
    } else {
      timeoutId = setTimeout(loadMetrics, 250);
    }

    return () => {
      isMounted = false;
      if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [shouldHide, userInfo]);

  const progressData = useMemo(() => {
    if (!metrics) {
      return { progress: 0, remaining: 0 };
    }

    const { monthlyObjective, currentMonthBilling } = metrics;
    const totalBilling = currentMonthBilling;
    const totalProgress = monthlyObjective > 0 ? Math.min((totalBilling / monthlyObjective) * 100, 999) : 0;
    const remaining = monthlyObjective > 0 ? Math.max(monthlyObjective - totalBilling, 0) : 0;

    return { progress: totalProgress, remaining };
  }, [metrics]);

  if (shouldHide) {
    return null;
  }

  if (!metrics) {
    return (
      <div className="sticky top-0 z-30 min-h-[132px] border-b border-primary/20 bg-background px-4 py-3 sm:min-h-[96px]">
        <div className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-3">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-2 w-full rounded-full bg-muted" />
          <div className="h-3 w-64 max-w-full rounded bg-muted" />
        </div>
      </div>
    );
  }

  const monthlyObjective = metrics?.monthlyObjective ?? 0;
  const totalBilling = metrics?.currentMonthBilling ?? 0;
  const invoiceCount = metrics?.invoiceCount ?? 0;
  const showObjectiveInfo = monthlyObjective > 0;

  return (
    <div className="sticky top-0 z-30 min-h-[132px] border-b border-primary/20 bg-gradient-to-r from-primary/10 via-background to-primary/10 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:min-h-[96px]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <Trophy className="h-4 w-4" />
            <span>Tu objetivo del mes</span>
          </div>
          {showObjectiveInfo ? (
            <div className="text-xs font-medium text-muted-foreground sm:text-sm">
              Llevás ${totalBilling.toLocaleString('es-AR')} facturados de ${monthlyObjective.toLocaleString('es-AR')}.
            </div>
          ) : (
            <div className="text-xs font-medium text-muted-foreground sm:text-sm">
              {loading ? 'Calculando tu progreso...' : 'Configurá tu objetivo mensual para comenzar a medir tu progreso.'}
            </div>
          )}
        </div>
        {showObjectiveInfo ? (
          <>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(progressData.progress, 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground sm:text-xs">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Tango FAC ${totalBilling.toLocaleString('es-AR')}</span>
              <span>{invoiceCount} comprobantes FAC del mes en curso</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {progressData.progress >= 100
                ? '¡Increíble! Superaste tu objetivo este mes.'
                : `Te faltan $${progressData.remaining.toLocaleString('es-AR')} para llegar a tu meta.`}
            </p>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            {loading ? 'Revisando tus facturas FAC de Tango...' : 'Pedile a tu líder que defina un objetivo para vos y mantenete enfocado.'}
          </div>
        )}
      </div>
    </div>
  );
}

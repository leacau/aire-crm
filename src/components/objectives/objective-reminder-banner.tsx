'use client';

import { useEffect, useMemo, useState } from 'react';
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { getClients, getInvoices, getOpportunities } from '@/lib/firebase-service';
import { getManualInvoiceDate } from '@/lib/invoice-utils';
import { Trophy } from 'lucide-react';

const HIDDEN_ROLES = new Set(['Jefe', 'Gerencia', 'Administracion', 'Admin']);

interface ObjectiveMetrics {
  monthlyObjective: number;
  currentMonthPaidBilling: number;
  currentMonthPendingBilling: number;
}

export function ObjectiveReminderBanner() {
  const { userInfo } = useAuth();
  const [metrics, setMetrics] = useState<ObjectiveMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const shouldHide = !userInfo || HIDDEN_ROLES.has(userInfo.role);

  useEffect(() => {
    if (shouldHide || !userInfo) {
      setMetrics(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    Promise.all([getClients(), getOpportunities(), getInvoices()])
      .then(([clients, opportunities, invoices]) => {
        if (!isMounted) return;

        const clientIds = new Set(clients.filter(client => client.ownerId === userInfo.id).map(client => client.id));
        const opportunityIds = new Set(opportunities.filter(opp => clientIds.has(opp.clientId)).map(opp => opp.id));
        const userInvoices = invoices.filter(inv => opportunityIds.has(inv.opportunityId));

        const today = new Date();
        const currentMonthStart = startOfMonth(today);
        const currentMonthEnd = endOfMonth(today);

        const currentMonthInvoices = userInvoices
          .map(invoice => ({ invoice, invoiceDate: getManualInvoiceDate(invoice) }))
          .filter(({ invoice, invoiceDate }) =>
            invoiceDate &&
            !invoice.isCreditNote &&
            isWithinInterval(invoiceDate, { start: currentMonthStart, end: currentMonthEnd })
          );

        const currentMonthPaidInvoices = currentMonthInvoices
          .filter(({ invoice }) => invoice.status === 'Pagada')
          .reduce((sum, { invoice }) => sum + invoice.amount, 0);

        const currentMonthPendingInvoices = currentMonthInvoices
          .filter(({ invoice }) => invoice.status !== 'Pagada')
          .reduce((sum, { invoice }) => sum + invoice.amount, 0);

        setMetrics({
          monthlyObjective: userInfo.monthlyObjective ?? 0,
          currentMonthPaidBilling: currentMonthPaidInvoices,
          currentMonthPendingBilling: currentMonthPendingInvoices,
        });
        setLoading(false);
      })
        .catch(error => {
          console.error('Error cargando el objetivo global', error);
          if (isMounted) {
            setMetrics({
              monthlyObjective: userInfo.monthlyObjective ?? 0,
              currentMonthPaidBilling: 0,
              currentMonthPendingBilling: 0,
            });
            setLoading(false);
          }
        });

    return () => {
      isMounted = false;
    };
  }, [shouldHide, userInfo?.id, userInfo?.monthlyObjective]);

  const progressData = useMemo(() => {
    if (!metrics) {
      return { progress: 0, paidProgress: 0, pendingProgress: 0, remaining: 0 };
    }

    const { monthlyObjective, currentMonthPaidBilling, currentMonthPendingBilling } = metrics;
    const totalBilling = currentMonthPaidBilling + currentMonthPendingBilling;
    const totalProgress = monthlyObjective > 0 ? Math.min((totalBilling / monthlyObjective) * 100, 999) : 0;
    const paidProgress = monthlyObjective > 0 ? Math.min((currentMonthPaidBilling / monthlyObjective) * 100, totalProgress) : 0;
    const pendingProgress = monthlyObjective > 0 ? Math.min((currentMonthPendingBilling / monthlyObjective) * 100, Math.max(totalProgress - paidProgress, 0)) : 0;
    const remaining = monthlyObjective > 0 ? Math.max(monthlyObjective - totalBilling, 0) : 0;

    return { progress: totalProgress, paidProgress, pendingProgress, remaining };
  }, [metrics]);

  if (shouldHide || (!metrics && !loading)) {
    return null;
  }

  const monthlyObjective = metrics?.monthlyObjective ?? 0;
  const currentMonthPaidBilling = metrics?.currentMonthPaidBilling ?? 0;
  const currentMonthPendingBilling = metrics?.currentMonthPendingBilling ?? 0;
  const totalBilling = currentMonthPaidBilling + currentMonthPendingBilling;
  const showObjectiveInfo = monthlyObjective > 0;

  return (
    <div className="sticky top-0 z-30 border-b border-primary/20 bg-gradient-to-r from-primary/10 via-background to-primary/10 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
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
                style={{ width: `${Math.min(progressData.paidProgress, 100)}%` }}
              />
              <div
                className="h-full bg-amber-400"
                style={{
                  width: `${Math.max(
                    Math.min(progressData.paidProgress + progressData.pendingProgress, 100) - Math.min(progressData.paidProgress, 100),
                    0
                  )}%`,
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground sm:text-xs">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Pagadas ${currentMonthPaidBilling.toLocaleString('es-AR')}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />A pagar ${currentMonthPendingBilling.toLocaleString('es-AR')}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {progressData.progress >= 100
                ? '¡Increíble! Superaste tu objetivo este mes.'
                : `Te faltan $${progressData.remaining.toLocaleString('es-AR')} para llegar a tu meta.`}
            </p>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            {loading ? 'Revisando tus facturas pagadas...' : 'Pedile a tu líder que defina un objetivo para vos y mantenete enfocado.'}
          </div>
        )}
      </div>
    </div>
  );
}

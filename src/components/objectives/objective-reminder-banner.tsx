'use client';

import { useEffect, useMemo, useState } from 'react';
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { getClients, getInvoices, getOpportunities } from '@/lib/firebase-service';
import { getPaidInvoiceDate } from '@/lib/invoice-utils';
import { Progress } from '@/components/ui/progress';
import { Trophy } from 'lucide-react';

const HIDDEN_ROLES = new Set(['Jefe', 'Gerencia', 'Administracion', 'Admin']);

interface ObjectiveMetrics {
  monthlyObjective: number;
  currentMonthBilling: number;
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

        const currentMonthPaidInvoices = userInvoices
          .map(inv => ({ invoice: inv, paidDate: getPaidInvoiceDate(inv) }))
          .filter(({ invoice, paidDate }) => invoice.status === 'Pagada' && paidDate &&
            isWithinInterval(paidDate, { start: currentMonthStart, end: currentMonthEnd }))
          .reduce((sum, { invoice }) => sum + invoice.amount, 0);

        setMetrics({
          monthlyObjective: userInfo.monthlyObjective ?? 0,
          currentMonthBilling: currentMonthPaidInvoices,
        });
        setLoading(false);
      })
      .catch(error => {
        console.error('Error cargando el objetivo global', error);
        if (isMounted) {
          setMetrics({ monthlyObjective: userInfo.monthlyObjective ?? 0, currentMonthBilling: 0 });
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [shouldHide, userInfo?.id, userInfo?.monthlyObjective]);

  const progressData = useMemo(() => {
    if (!metrics) {
      return { progress: 0, remaining: 0 };
    }

    const { monthlyObjective, currentMonthBilling } = metrics;
    const progress = monthlyObjective > 0 ? Math.min((currentMonthBilling / monthlyObjective) * 100, 999) : 0;
    const remaining = monthlyObjective > 0 ? Math.max(monthlyObjective - currentMonthBilling, 0) : 0;

    return { progress, remaining };
  }, [metrics]);

  if (shouldHide || (!metrics && !loading)) {
    return null;
  }

  const monthlyObjective = metrics?.monthlyObjective ?? 0;
  const currentMonthBilling = metrics?.currentMonthBilling ?? 0;
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
              Llevás ${currentMonthBilling.toLocaleString('es-AR')} facturados de ${monthlyObjective.toLocaleString('es-AR')}.
            </div>
          ) : (
            <div className="text-xs font-medium text-muted-foreground sm:text-sm">
              {loading ? 'Calculando tu progreso...' : 'Configurá tu objetivo mensual para comenzar a medir tu progreso.'}
            </div>
          )}
        </div>
        {showObjectiveInfo ? (
          <>
            <Progress value={Math.min(progressData.progress, 100)} className="h-2" />
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

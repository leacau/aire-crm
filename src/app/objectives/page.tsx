'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, CheckCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { getOpportunities, getInvoices, getClients, getAllUsers } from '@/lib/firebase-service';
import type { Opportunity, Invoice, Client, User } from '@/lib/types';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, subMonths, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Confetti from 'react-dom-confetti';
import { getManualInvoiceDate } from '@/lib/invoice-utils';

export default function ObjectivesPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (userInfo) {
      setLoadingData(true);
      const advisorsPromise = isBoss ? getAllUsers('Asesor') : Promise.resolve([] as User[]);
      Promise.all([
        getOpportunities(),
        getInvoices(),
        getClients(),
        advisorsPromise
      ]).then(([opps, invs, cls, advs]) => {
        setOpportunities(opps);
        setInvoices(invs);
        setClients(cls);
        setAdvisors(advs);
        setLoadingData(false);
      }).catch(err => {
        console.error("Error fetching objectives data", err);
        setLoadingData(false);
      });
    }
  }, [userInfo, isBoss]);

  const {
    previousMonthBilling,
    monthlyObjective,
    currentMonthBilling,
    progressPercentage,
    billingDifference,
  } = useMemo(() => {
    if (!userInfo) return { previousMonthBilling: 0, monthlyObjective: 0, currentMonthBilling: 0, progressPercentage: 0, billingDifference: 0 };

    const today = new Date();
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);
    const prevMonthDate = subMonths(today, 1);
    const prevMonthStart = startOfMonth(prevMonthDate);
    const prevMonthEnd = endOfMonth(prevMonthDate);
    
    const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
    const userOppIds = new Set(opportunities.filter(opp => userClientIds.has(opp.clientId)).map(opp => opp.id));

    const userInvoices = invoices.filter(inv => userOppIds.has(inv.opportunityId));

    const currentMonthPaidInvoices = userInvoices
      .filter(inv => inv.status === 'Pagada' && inv.datePaid && isWithinInterval(parseISO(inv.datePaid), { start: currentMonthStart, end: currentMonthEnd }))
      .reduce((sum, inv) => sum + inv.amount, 0);

    const prevMonthBilling = userInvoices
      .filter(inv => {
        const invoiceDate = getManualInvoiceDate(inv);
        return invoiceDate ? isWithinInterval(invoiceDate, { start: prevMonthStart, end: prevMonthEnd }) : false;
      })
      .reduce((sum, inv) => sum + inv.amount, 0);
    const monthlyObjective = userInfo.monthlyObjective ?? 0;
    
    const progressPercentage = monthlyObjective > 0 ? (currentMonthPaidInvoices / monthlyObjective) * 100 : 0;
    
    const billingDifference = currentMonthPaidInvoices - prevMonthBilling;

    return {
      previousMonthBilling: prevMonthBilling,
      monthlyObjective,
      currentMonthBilling: currentMonthPaidInvoices,
      progressPercentage,
      billingDifference,
    };
  }, [userInfo, opportunities, invoices, clients]);

  const teamObjectives = useMemo(() => {
    if (!isBoss || advisors.length === 0) return [];

    const today = new Date();
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);
    const prevMonthDate = subMonths(today, 1);
    const prevMonthStart = startOfMonth(prevMonthDate);
    const prevMonthEnd = endOfMonth(prevMonthDate);

    const clientOwnerMap = new Map<string, string>();
    clients.forEach(client => {
      if (client.ownerId) {
        clientOwnerMap.set(client.id, client.ownerId);
      }
    });

    const opportunityOwnerMap = new Map<string, string>();
    opportunities.forEach(opp => {
      const ownerId = clientOwnerMap.get(opp.clientId);
      if (ownerId) {
        opportunityOwnerMap.set(opp.id, ownerId);
      }
    });

    const invoicesByAdvisor = new Map<string, Invoice[]>();
    invoices.forEach(inv => {
      const advisorId = opportunityOwnerMap.get(inv.opportunityId);
      if (!advisorId) return;
      if (!invoicesByAdvisor.has(advisorId)) {
        invoicesByAdvisor.set(advisorId, []);
      }
      invoicesByAdvisor.get(advisorId)!.push(inv);
    });

    const parseMonthKey = (month: string) => {
      const [year, monthString] = month.split('-').map(part => Number(part));
      if (!year || !monthString) return null;
      return new Date(year, monthString - 1, 1);
    };

    return advisors.map(advisor => {
      const advisorInvoices = invoicesByAdvisor.get(advisor.id) ?? [];
      const currentMonthPaidInvoices = advisorInvoices
        .filter(inv => inv.status === 'Pagada' && inv.datePaid && isWithinInterval(parseISO(inv.datePaid), { start: currentMonthStart, end: currentMonthEnd }))
        .reduce((sum, inv) => sum + inv.amount, 0);

      const prevMonthBilling = advisorInvoices
        .filter(inv => {
          const invoiceDate = getManualInvoiceDate(inv);
          return invoiceDate ? isWithinInterval(invoiceDate, { start: prevMonthStart, end: prevMonthEnd }) : false;
        })
        .reduce((sum, inv) => sum + inv.amount, 0);
      const monthlyObjective = advisor.monthlyObjective ?? 0;
      const progressPercentage = monthlyObjective > 0 ? (currentMonthPaidInvoices / monthlyObjective) * 100 : 0;
      const billingDifference = currentMonthPaidInvoices - prevMonthBilling;

      const recentClosures = Object.entries(advisor.monthlyClosures ?? {})
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 3)
        .map(([month, value]) => {
          const parsedDate = parseMonthKey(month);
          return {
            label: parsedDate ? format(parsedDate, 'MMM yyyy', { locale: es }) : month,
            value,
          };
        });

      return {
        advisorId: advisor.id,
        advisorName: advisor.name,
        monthlyObjective,
        currentMonthBilling: currentMonthPaidInvoices,
        progressPercentage,
        billingDifference,
        recentClosures,
      };
    }).sort((a, b) => b.currentMonthBilling - a.currentMonthBilling);
  }, [isBoss, advisors, clients, opportunities, invoices]);

    useEffect(() => {
        if (progressPercentage >= 100) {
            setShowConfetti(true);
        } else {
            setShowConfetti(false);
        }
    }, [progressPercentage]);


  if (authLoading || loadingData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Mis Objetivos" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Facturación Mes Anterior</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${previousMonthBilling.toLocaleString('es-AR')}</div>
              <p className="text-xs text-muted-foreground">Valor de cierre final del mes pasado.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Objetivo de este Mes</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${monthlyObjective.toLocaleString('es-AR')}</div>
              <p className="text-xs text-muted-foreground">Meta de facturación pagada para el mes actual.</p>
            </CardContent>
          </Card>
           <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Facturación vs Mes Anterior</CardTitle>
               {billingDifference >= 0 ? <TrendingUp className="h-4 w-4 text-muted-foreground" /> : <TrendingDown className="h-4 w-4 text-muted-foreground" />}
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", billingDifference >= 0 ? "text-green-600" : "text-red-600")}>
                ${billingDifference.toLocaleString('es-AR')}
              </div>
              <p className="text-xs text-muted-foreground">Diferencia con la facturación del mes anterior.</p>
            </CardContent>
          </Card>
        </div>

        <Card className="relative overflow-hidden">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <Confetti active={showConfetti} config={{
                    angle: 90,
                    spread: 360,
                    startVelocity: 40,
                    elementCount: 100,
                    dragFriction: 0.12,
                    duration: 3000,
                    stagger: 3,
                    width: "10px",
                    height: "10px",
                }} />
           </div>
          <CardHeader>
            <CardTitle>Progreso del Objetivo Mensual</CardTitle>
            <CardDescription>
              Seguimiento de tu facturación pagada en comparación con tu objetivo para este mes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-baseline">
                <p className="text-4xl font-bold text-primary">${currentMonthBilling.toLocaleString('es-AR')}</p>
                <p className="text-lg text-muted-foreground">de ${monthlyObjective.toLocaleString('es-AR')}</p>
            </div>
            <Progress value={Math.min(progressPercentage, 100)} className="h-4" />
            <div className="flex justify-between items-center text-sm font-medium">
                <span>{progressPercentage.toFixed(2)}% Completado</span>
                 {progressPercentage < 100 ? (
                    <span>Te faltan ${(monthlyObjective - currentMonthBilling > 0 ? monthlyObjective - currentMonthBilling : 0).toLocaleString('es-AR')}</span>
                 ) : (
                    <span className="text-green-600">¡Objetivo superado por ${(currentMonthBilling - monthlyObjective).toLocaleString('es-AR')}!</span>
                 )}
            </div>
          </CardContent>
        </Card>

        {isBoss && (
          <Card>
            <CardHeader>
              <CardTitle>Objetivos del Equipo</CardTitle>
              <CardDescription>
                Visibilidad de los objetivos mensuales y la evolución reciente de cada asesor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {teamObjectives.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay datos de asesores disponibles.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[720px]">
                    <thead>
                      <tr className="text-xs uppercase text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Asesor</th>
                        <th className="pb-2 pr-4 font-medium">Objetivo Mensual</th>
                        <th className="pb-2 pr-4 font-medium">Facturación Actual</th>
                        <th className="pb-2 pr-4 font-medium">Vs. Mes Anterior</th>
                        <th className="pb-2 pr-4 font-medium">Progreso</th>
                        <th className="pb-2 font-medium">Evolución Reciente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamObjectives.map(metric => (
                        <tr key={metric.advisorId} className="border-t border-border">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{metric.advisorName}</div>
                          </td>
                          <td className="py-3 pr-4">
                            ${metric.monthlyObjective.toLocaleString('es-AR')}
                          </td>
                          <td className="py-3 pr-4 font-semibold">
                            ${metric.currentMonthBilling.toLocaleString('es-AR')}
                          </td>
                          <td className="py-3 pr-4">
                            <span className={cn('font-semibold', metric.billingDifference >= 0 ? 'text-green-600' : 'text-red-600')}>
                              ${metric.billingDifference.toLocaleString('es-AR')}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="space-y-1">
                              <Progress value={Math.min(metric.progressPercentage, 100)} className="h-2" />
                              <p className="text-xs text-muted-foreground">{metric.progressPercentage.toFixed(1)}%</p>
                            </div>
                          </td>
                          <td className="py-3">
                            {metric.recentClosures.length > 0 ? (
                              <div className="space-y-1">
                                {metric.recentClosures.map(entry => (
                                  <div key={`${metric.advisorId}-${entry.label}`} className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">{entry.label}</span>
                                    <span className="font-medium">${entry.value.toLocaleString('es-AR')}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">Sin registros</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

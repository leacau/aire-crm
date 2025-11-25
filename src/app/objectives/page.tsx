'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Target, CheckCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { getOpportunities, getInvoices, getClients, getAllUsers, getProspects } from '@/lib/firebase-service';
import type { Opportunity, Invoice, Client, User, Prospect } from '@/lib/types';
import { addMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO, format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Confetti from 'react-dom-confetti';
import { getManualInvoiceDate } from '@/lib/invoice-utils';
import { AdvisorAlertsPanel } from '@/components/objectives/advisor-alerts-panel';
import { buildAdvisorAlerts, type AdvisorAlert } from '@/lib/advisor-alerts';
import { sendEmail } from '@/lib/google-gmail-service';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function ObjectivesPage() {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isSendingAlertsEmail, setIsSendingAlertsEmail] = useState(false);
  const [alertsEmailError, setAlertsEmailError] = useState<string | null>(null);
  const [needsAlertsEmailAuth, setNeedsAlertsEmailAuth] = useState(false);
  const [lastAlertsEmailDate, setLastAlertsEmailDate] = useState<string | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [pendingOpportunityId, setPendingOpportunityId] = useState<string | null>(null);
  const isAdvisor = userInfo?.role === 'Asesor';

  useEffect(() => {
    if (userInfo) {
      setLoadingData(true);
      const advisorsPromise = isBoss ? getAllUsers('Asesor') : Promise.resolve([] as User[]);
      Promise.all([
        getOpportunities(),
        getInvoices(),
        getClients(),
        advisorsPromise,
        getProspects()
      ]).then(([opps, invs, cls, advs, prs]) => {
        setOpportunities(opps);
        setInvoices(invs);
        setClients(cls);
        setAdvisors(advs);
        setProspects(prs);
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
    currentMonthPaidBilling,
    currentMonthPendingBilling,
    progressPercentage,
    billingDifference,
    forecastedIncome,
    prospectingIncome,
  } = useMemo(() => {
    if (!userInfo) {
      return {
        previousMonthBilling: 0,
        monthlyObjective: 0,
        currentMonthBilling: 0,
        currentMonthPaidBilling: 0,
        currentMonthPendingBilling: 0,
        progressPercentage: 0,
        billingDifference: 0,
        forecastedIncome: 0,
        prospectingIncome: 0,
      };
    }

    const today = new Date();
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);
    const previousMonthStart = startOfMonth(addMonths(today, -1));
    const previousMonthEnd = endOfMonth(previousMonthStart);

    const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
    const userOpportunities = opportunities.filter(opp => userClientIds.has(opp.clientId));
    const userOppIds = new Set(userOpportunities.map(opp => opp.id));

    const userInvoices = invoices.filter(inv => userOppIds.has(inv.opportunityId) && !inv.isCreditNote);

    const invoicesWithDates = userInvoices
      .map(invoice => ({ invoice, invoiceDate: getManualInvoiceDate(invoice) }))
      .filter(({ invoiceDate }) => invoiceDate !== null) as { invoice: Invoice; invoiceDate: Date }[];

    const currentMonthInvoices = invoicesWithDates.filter(({ invoiceDate }) =>
      isWithinInterval(invoiceDate, { start: currentMonthStart, end: currentMonthEnd })
    );

    const currentMonthTotal = currentMonthInvoices.reduce((sum, { invoice }) => sum + invoice.amount, 0);
    const currentMonthPaid = currentMonthInvoices
      .filter(({ invoice }) => invoice.status === 'Pagada')
      .reduce((sum, { invoice }) => sum + invoice.amount, 0);
    const currentMonthPending = currentMonthTotal - currentMonthPaid;

    const prevMonthBilling = invoicesWithDates
      .filter(({ invoiceDate }) => isWithinInterval(invoiceDate, { start: previousMonthStart, end: previousMonthEnd }))
      .reduce((sum, { invoice }) => sum + invoice.amount, 0);

    const currentMonthOpportunities = userOpportunities.filter(opp => {
      try {
        const createdAt = parseISO(opp.createdAt);
        return isWithinInterval(createdAt, { start: currentMonthStart, end: currentMonthEnd });
      } catch (error) {
        return false;
      }
    });

    const forecastedIncome = currentMonthOpportunities
      .filter(opp => ['Propuesta', 'Negociación', 'Negociación a Aprobar'].includes(opp.stage))
      .reduce((sum, opp) => sum + Number(opp.value || 0), 0);

    const prospectingIncome = currentMonthOpportunities
      .filter(opp => opp.stage === 'Nuevo')
      .reduce((sum, opp) => sum + Number(opp.value || 0), 0);

    const monthlyObjective = userInfo.monthlyObjective ?? 0;
    const progressPercentage = monthlyObjective > 0 ? (currentMonthTotal / monthlyObjective) * 100 : 0;
    const billingDifference = currentMonthTotal - prevMonthBilling;

    return {
      previousMonthBilling: prevMonthBilling,
      monthlyObjective,
      currentMonthBilling: currentMonthTotal,
      currentMonthPaidBilling: currentMonthPaid,
      currentMonthPendingBilling: currentMonthPending,
      progressPercentage,
      billingDifference,
      forecastedIncome,
      prospectingIncome,
    };
  }, [userInfo, opportunities, invoices, clients]);

  const teamObjectives = useMemo(() => {
    if (!isBoss || advisors.length === 0) return [];

    const today = new Date();
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);
    const previousMonthStart = startOfMonth(addMonths(today, -1));
    const previousMonthEnd = endOfMonth(previousMonthStart);

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
      const advisorInvoices = (invoicesByAdvisor.get(advisor.id) ?? []).filter(inv => !inv.isCreditNote);

      const invoicesWithDate = advisorInvoices
        .map(invoice => ({ invoice, invoiceDate: getManualInvoiceDate(invoice) }))
        .filter(({ invoiceDate }) => invoiceDate !== null) as { invoice: Invoice; invoiceDate: Date }[];

      const currentMonthInvoices = invoicesWithDate.filter(({ invoiceDate }) =>
        isWithinInterval(invoiceDate, { start: currentMonthStart, end: currentMonthEnd })
      );

      const currentMonthBilling = currentMonthInvoices.reduce((sum, { invoice }) => sum + invoice.amount, 0);

      const prevMonthBilling = invoicesWithDate
        .filter(({ invoiceDate }) => isWithinInterval(invoiceDate, { start: previousMonthStart, end: previousMonthEnd }))
        .reduce((sum, { invoice }) => sum + invoice.amount, 0);
      const monthlyObjective = advisor.monthlyObjective ?? 0;
      const progressPercentage = monthlyObjective > 0 ? (currentMonthBilling / monthlyObjective) * 100 : 0;
      const billingDifference = currentMonthBilling - prevMonthBilling;

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
          currentMonthBilling,
          progressPercentage,
          billingDifference,
          recentClosures,
        };
    }).sort((a, b) => b.currentMonthBilling - a.currentMonthBilling);
  }, [isBoss, advisors, clients, opportunities, invoices]);

  const teamAggregateProgress = useMemo(() => {
    if (!isBoss || teamObjectives.length === 0) {
      return { totalObjective: 0, totalBilling: 0, progressPercentage: 0 };
    }

    const totalObjective = teamObjectives.reduce((sum, item) => sum + (item.monthlyObjective || 0), 0);
    const totalBilling = teamObjectives.reduce((sum, item) => sum + item.currentMonthBilling, 0);
    const progressPercentage = totalObjective > 0 ? (totalBilling / totalObjective) * 100 : 0;

    return { totalObjective, totalBilling, progressPercentage };
  }, [isBoss, teamObjectives]);

  const advisorAlerts = useMemo(() => {
    if (!userInfo || userInfo.role !== 'Asesor') return [] as AdvisorAlert[];
    return buildAdvisorAlerts({ user: userInfo, opportunities, clients, invoices, prospects });
  }, [userInfo, opportunities, clients, invoices, prospects]);

  const handleAlertSelect = useCallback((alert: AdvisorAlert) => {
    setSelectedProspect(null);
    setSelectedClient(null);
    setSelectedOpportunity(null);

    if (alert.type === 'prospect' && alert.entityId) {
      const target = prospects.find(prospect => prospect.id === alert.entityId);
      if (target) {
        setSelectedProspect(target);
        return;
      }
    }

    if (alert.type === 'client' && alert.entityId) {
      const target = clients.find(client => client.id === alert.entityId);
      if (target) {
        setSelectedClient(target);
        return;
      }
    }

    if ((alert.type === 'opportunity' || alert.type === 'stage') && alert.entityId) {
      const target = opportunities.find(opportunity => opportunity.id === alert.entityId);
      if (target) {
        setSelectedOpportunity(target);
        return;
      }
      setPendingOpportunityId(alert.entityId);
      return;
    }

    if (alert.entityHref) {
      window.location.href = alert.entityHref;
    }
  }, [prospects, clients, opportunities]);

  useEffect(() => {
    if (!pendingOpportunityId) return;
    const pending = opportunities.find(opportunity => opportunity.id === pendingOpportunityId);
    if (pending) {
      setSelectedOpportunity(pending);
      setPendingOpportunityId(null);
    }
  }, [pendingOpportunityId, opportunities]);

  const formatDisplayDate = useCallback((value?: string | null) => {
    if (!value) return 'Sin fecha';
    try {
      const parsed = parseISO(value);
      return Number.isNaN(parsed.getTime()) ? 'Sin fecha' : format(parsed, 'PPP', { locale: es });
    } catch (error) {
      return 'Sin fecha';
    }
  }, []);

  const alertsNeedingEmail = useMemo(() => advisorAlerts.filter(alert => alert.shouldEmail), [advisorAlerts]);
  const emailStorageKey = userInfo?.role === 'Asesor' ? `advisor-alerts:last-email:${userInfo.id}` : null;

  useEffect(() => {
    if (!emailStorageKey || typeof window === 'undefined') return;
    const stored = localStorage.getItem(emailStorageKey);
    if (stored) {
      setLastAlertsEmailDate(stored);
    }
  }, [emailStorageKey]);

  useEffect(() => {
    if (alertsNeedingEmail.length === 0) {
      setNeedsAlertsEmailAuth(false);
      setAlertsEmailError(null);
    }
  }, [alertsNeedingEmail.length]);

  const sendAlertsEmailInternal = useCallback(async (accessToken: string) => {
    if (!userInfo?.email || alertsNeedingEmail.length === 0) return;
    setIsSendingAlertsEmail(true);
    setAlertsEmailError(null);
    try {
      const today = new Date();
      const subject = `Alertas pendientes - ${format(today, 'dd/MM/yyyy')}`;
      const listItems = alertsNeedingEmail.map(alert => `<li>${alert.emailSummary}</li>`).join('');
      const body = `
        <p>Hola ${userInfo.name || 'asesor'},</p>
        <p>Estas alertas necesitan tu seguimiento:</p>
        <ul>${listItems}</ul>
        <p>Ingresá al <a href="https://aire-crm.vercel.app/objectives">CRM</a> para actualizarlas.</p>
      `;
      await sendEmail({ accessToken, to: userInfo.email, subject, body });
      const nowIso = new Date().toISOString();
      setLastAlertsEmailDate(nowIso);
      if (emailStorageKey && typeof window !== 'undefined') {
        localStorage.setItem(emailStorageKey, nowIso);
      }
      setNeedsAlertsEmailAuth(false);
    } catch (error) {
      console.error('Error sending advisor alerts email', error);
      setAlertsEmailError('No pudimos enviar el correo con alertas. Intentalo nuevamente.');
    } finally {
      setIsSendingAlertsEmail(false);
    }
  }, [alertsNeedingEmail, userInfo, emailStorageKey]);

  const handleAlertsEmailRequest = useCallback(async () => {
    if (alertsNeedingEmail.length === 0) return;
    const token = await getGoogleAccessToken();
    if (!token) {
      setNeedsAlertsEmailAuth(true);
      setAlertsEmailError('Necesitamos tu autorización de Gmail para enviar estas alertas.');
      return;
    }
    await sendAlertsEmailInternal(token);
  }, [alertsNeedingEmail, getGoogleAccessToken, sendAlertsEmailInternal]);

  useEffect(() => {
    if (!userInfo || userInfo.role !== 'Asesor') return;
    if (alertsNeedingEmail.length === 0) return;
    if (!emailStorageKey) return;
    const alreadySentToday = lastAlertsEmailDate ? isSameDay(new Date(lastAlertsEmailDate), new Date()) : false;
    if (alreadySentToday) return;

    let cancelled = false;
    (async () => {
      const token = await getGoogleAccessToken({ silent: true });
      if (!token) {
        setNeedsAlertsEmailAuth(true);
        return;
      }
      if (!cancelled) {
        await sendAlertsEmailInternal(token);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [alertsNeedingEmail, userInfo, emailStorageKey, lastAlertsEmailDate, getGoogleAccessToken, sendAlertsEmailInternal]);

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
          {isAdvisor && (
            <>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Facturación del Período</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${currentMonthBilling.toLocaleString('es-AR')}</div>
                    <p className="text-xs text-muted-foreground">Facturas (pagadas o a pagar) con fecha en el mes actual.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Facturación Mes Anterior</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${previousMonthBilling.toLocaleString('es-AR')}</div>
                    <p className="text-xs text-muted-foreground">Facturas con fecha en el mes anterior.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ingresos Previstos</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${forecastedIncome.toLocaleString('es-AR')}</div>
                    <p className="text-xs text-muted-foreground">Propuestas creadas este mes en Propuesta/Negociación.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">En Prospección</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${prospectingIncome.toLocaleString('es-AR')}</div>
                    <p className="text-xs text-muted-foreground">Valor de propuestas nuevas creadas este mes.</p>
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
                   Seguimiento de tu facturación pagada y a pagar en comparación con tu objetivo para este mes.
                 </CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="flex justify-between items-baseline">
                     <p className="text-4xl font-bold text-primary">${currentMonthBilling.toLocaleString('es-AR')}</p>
                     <p className="text-lg text-muted-foreground">de ${monthlyObjective.toLocaleString('es-AR')}</p>
                 </div>
                 <Progress value={Math.min(progressPercentage, 100)} className="h-4" />
                 <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                   <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Pagadas ${currentMonthPaidBilling.toLocaleString('es-AR')}</span>
                   <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />A pagar ${currentMonthPendingBilling.toLocaleString('es-AR')}</span>
                 </div>
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

              <AdvisorAlertsPanel
                alerts={advisorAlerts}
                pendingEmailCount={alertsNeedingEmail.length}
                isSendingEmail={isSendingAlertsEmail}
                lastEmailSentAt={lastAlertsEmailDate}
                onSendEmail={alertsNeedingEmail.length ? handleAlertsEmailRequest : undefined}
                emailError={alertsEmailError}
                needsEmailAuth={needsAlertsEmailAuth}
                onAlertSelect={handleAlertSelect}
              />
            </>
          )}

        {isBoss && (
          <div className="space-y-4">
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

            <Card>
              <CardHeader>
                <CardTitle>Alcance del Objetivo del Equipo</CardTitle>
                <CardDescription>
                  Progreso combinado de los asesores respecto a sus objetivos mensuales.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <p className="text-3xl font-bold text-primary">${teamAggregateProgress.totalBilling.toLocaleString('es-AR')}</p>
                  <p className="text-sm text-muted-foreground">de ${teamAggregateProgress.totalObjective.toLocaleString('es-AR')}</p>
                </div>
                <Progress value={Math.min(teamAggregateProgress.progressPercentage, 100)} className="h-3" />
                <p className="text-xs text-muted-foreground">{teamAggregateProgress.progressPercentage.toFixed(2)}% del objetivo grupal alcanzado.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {selectedProspect && (
        <Dialog open={!!selectedProspect} onOpenChange={open => !open && setSelectedProspect(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Prospecto: {selectedProspect.companyName}</DialogTitle>
              <DialogDescription>Revisa el prospecto sin salir de tus alertas.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p><span className="font-semibold">Estado:</span> {selectedProspect.status}</p>
              <p><span className="font-semibold">Contacto:</span> {selectedProspect.contactName || 'Sin datos'}</p>
              <p><span className="font-semibold">Email:</span> {selectedProspect.contactEmail || 'Sin datos'}</p>
              <p><span className="font-semibold">Último cambio:</span> {formatDisplayDate(selectedProspect.statusChangedAt || selectedProspect.createdAt)}</p>
            </div>
            <div className="flex items-center justify-between pt-2">
              <Link href={`/prospects?prospectId=${selectedProspect.id}`} className="text-sm font-semibold text-primary hover:underline">
                Abrir en Prospectos
              </Link>
              <Button variant="secondary" onClick={() => setSelectedProspect(null)}>Cerrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {selectedClient && (
        <Dialog open={!!selectedClient} onOpenChange={open => !open && setSelectedClient(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Cliente: {selectedClient.denominacion}</DialogTitle>
              <DialogDescription>Resumen rápido del cliente.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p><span className="font-semibold">Email:</span> {selectedClient.email || 'Sin datos'}</p>
              <p><span className="font-semibold">Teléfono:</span> {selectedClient.phone || 'Sin datos'}</p>
              <p><span className="font-semibold">Creado:</span> {formatDisplayDate(selectedClient.createdAt)}</p>
            </div>
            <div className="flex items-center justify-between pt-2">
              <Link href={`/clients/${selectedClient.id}`} className="text-sm font-semibold text-primary hover:underline">
                Abrir en Clientes
              </Link>
              <Button variant="secondary" onClick={() => setSelectedClient(null)}>Cerrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {selectedOpportunity && (
        <Dialog open={!!selectedOpportunity} onOpenChange={open => !open && setSelectedOpportunity(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Propuesta: {selectedOpportunity.title}</DialogTitle>
              <DialogDescription>Consulta los datos clave de la oportunidad.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="font-semibold">Etapa:</span> {selectedOpportunity.stage}</p>
              <p><span className="font-semibold">Cliente:</span> {clients.find(client => client.id === selectedOpportunity.clientId)?.denominacion || 'Sin datos'}</p>
              <p><span className="font-semibold">Valor estimado:</span> ${Number(selectedOpportunity.value ?? 0).toLocaleString('es-AR')}</p>
              <p><span className="font-semibold">Última actualización:</span> {formatDisplayDate(selectedOpportunity.updatedAt || selectedOpportunity.manualUpdateDate || selectedOpportunity.createdAt)}</p>
            </div>
            <div className="flex items-center justify-between pt-2">
              <Link href={`/opportunities?opportunityId=${selectedOpportunity.id}`} className="text-sm font-semibold text-primary hover:underline">
                Abrir en Oportunidades
              </Link>
              <Button variant="secondary" onClick={() => setSelectedOpportunity(null)}>Cerrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

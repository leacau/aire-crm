'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, CheckCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { getOpportunities, getInvoices, getClients } from '@/lib/firebase-service';
import type { Opportunity, Invoice, Client } from '@/lib/types';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import Confetti from 'react-dom-confetti';

export default function ObjectivesPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (userInfo) {
      setLoadingData(true);
      Promise.all([
        getOpportunities(),
        getInvoices(),
        getClients()
      ]).then(([opps, invs, cls]) => {
        setOpportunities(opps);
        setInvoices(invs);
        setClients(cls);
        setLoadingData(false);
      }).catch(err => {
        console.error("Error fetching objectives data", err);
        setLoadingData(false);
      });
    }
  }, [userInfo]);

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
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    
    const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
    const userOppIds = new Set(opportunities.filter(opp => userClientIds.has(opp.clientId)).map(opp => opp.id));

    const userInvoices = invoices.filter(inv => userOppIds.has(inv.opportunityId));

    const currentMonthPaidInvoices = userInvoices
      .filter(inv => inv.status === 'Pagada' && inv.datePaid && isWithinInterval(parseISO(inv.datePaid), { start: currentMonthStart, end: currentMonthEnd }))
      .reduce((sum, inv) => sum + inv.amount, 0);

    const prevMonthBilling = userInfo.monthlyClosures?.[prevMonthKey] ?? 0;
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
                    <span>Te faltan ${(monthlyObjective - currentMonthBilling).toLocaleString('es-AR')}</span>
                 ) : (
                    <span className="text-green-600">¡Objetivo superado por ${(currentMonthBilling - monthlyObjective).toLocaleString('es-AR')}!</span>
                 )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

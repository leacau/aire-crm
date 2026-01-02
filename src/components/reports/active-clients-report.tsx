'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getClients, getAllOpportunities } from '@/lib/firebase-service';
import type { Client, Opportunity } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { addMonths, parseISO, startOfDay } from 'date-fns';

interface ActiveClientsReportProps {
  selectedAdvisor: string;
}

export function ActiveClientsReport({ selectedAdvisor }: ActiveClientsReportProps) {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [allClients, allOpps] = await Promise.all([
            getClients(),
            getAllOpportunities()
        ]);
        setClients(allClients);
        setOpportunities(allOpps);
      } catch (error) {
        console.error("Error fetching active clients data:", error);
        toast({ title: 'Error al cargar datos de clientes activos', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [toast]);

  const activeClientsCount = useMemo(() => {
    const today = startOfDay(new Date());

    const relevantClients = selectedAdvisor === 'all'
      ? clients
      : clients.filter(c => c.ownerId === selectedAdvisor);

    const relevantClientIds = new Set(relevantClients.map(c => c.id));

    const getPeriodDurationInMonths = (period: string): number => {
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

    const isOpportunityActive = (opp: Opportunity): boolean => {
      const isClosedWon = opp.stage === 'Cerrado - Ganado' || opp.stage === 'Ganado (Recurrente)';
      if (!isClosedWon || !opp.createdAt) return false;

      const creationDate = parseISO(opp.createdAt);
      if (Number.isNaN(creationDate.getTime())) return false;

      const startDate = startOfDay(creationDate);
      const durationMonths = getPeriodDurationInMonths(opp.periodicidad?.[0] || 'Mensual');
      const endDate = addMonths(startDate, durationMonths);

      return today >= startDate && today < endDate;
    };

    const clientsWithActiveOpportunities = new Set<string>();

    opportunities
      .filter(opp => relevantClientIds.has(opp.clientId))
      .forEach(opp => {
        if (isOpportunityActive(opp)) {
          clientsWithActiveOpportunities.add(opp.clientId);
        }
      });

    return clientsWithActiveOpportunities.size;
  }, [clients, opportunities, selectedAdvisor]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clientes Activos</CardTitle>
        <CardDescription>
          Número de clientes con oportunidades cerradas vigentes según su periodicidad.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <Spinner />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-full">
                <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
                <p className="text-3xl font-bold">{activeClientsCount}</p>
                <p className="text-sm text-muted-foreground">clientes con oportunidades activas</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

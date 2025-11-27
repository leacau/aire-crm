'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getClients, getAllOpportunities } from '@/lib/firebase-service';
import type { Client, Opportunity } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const relevantClients = selectedAdvisor === 'all'
      ? clients
      : clients.filter(c => c.ownerId === selectedAdvisor);

    const relevantClientIds = new Set(relevantClients.map(c => c.id));

    const getOpportunityEndDate = (opp: Opportunity): Date | null => {
      if (opp.finalizationDate) {
        const parsed = new Date(opp.finalizationDate);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }

      const endDates = (opp.ordenesPautado || [])
        .map(pauta => (pauta.fechaFin ? new Date(pauta.fechaFin) : null))
        .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()));

      if (endDates.length === 0) return null;

      return endDates.reduce(
        (latest, current) => (current.getTime() > latest.getTime() ? current : latest),
        endDates[0]
      );
    };

    const clientsWithActiveOpportunities = new Set<string>();

    opportunities
      .filter(opp => relevantClientIds.has(opp.clientId))
      .forEach(opp => {
        const isClosedWon = opp.stage === 'Cerrado - Ganado' || opp.stage === 'Ganado (Recurrente)';
        if (!isClosedWon) return;

        const endDate = getOpportunityEndDate(opp);
        if (endDate && endDate >= today) {
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
          Número de clientes con al menos una oportunidad cerrada vigente (ganada o recurrente).
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

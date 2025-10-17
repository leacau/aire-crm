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

    const clientsWithActivePautas = new Set<string>();

    const relevantClients = selectedAdvisor === 'all' 
        ? clients 
        : clients.filter(c => c.ownerId === selectedAdvisor);
    
    const relevantClientIds = new Set(relevantClients.map(c => c.id));
    
    const relevantOpps = opportunities.filter(opp => relevantClientIds.has(opp.clientId));

    relevantOpps.forEach(opp => {
      if (opp.pautados && opp.pautados.length > 0) {
        const hasActivePauta = opp.pautados.some(pauta => {
          if (!pauta.fechaFin) return false;
          const endDate = new Date(pauta.fechaFin);
          return endDate >= today;
        });
        if (hasActivePauta) {
          clientsWithActivePautas.add(opp.clientId);
        }
      }
    });

    return clientsWithActivePautas.size;
  }, [clients, opportunities, selectedAdvisor]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clientes Activos</CardTitle>
        <CardDescription>
          Número de clientes con al menos una pauta publicitaria activa (fecha de fin futura).
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
                <p className="text-sm text-muted-foreground">clientes con pautas activas</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

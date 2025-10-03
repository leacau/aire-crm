

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getAllUsers, getClients } from '@/lib/firebase-service';
import type { Opportunity, User, Client } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef } from '@tanstack/react-table';

interface AdvisorStats {
  user: User;
  wonOpps: number;
  totalRevenue: number;
  activeOpps: number;
  pipelineValue: number;
}

export function TeamPerformanceTable() {
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [allOpps, allAdvisors, allClients] = await Promise.all([
            getAllOpportunities(),
            getAllUsers('Asesor'),
            getClients()
        ]);
        setOpportunities(allOpps);
        setAdvisors(allAdvisors);
        setClients(allClients);
      } catch (error) {
        console.error("Error fetching team data:", error);
        toast({ title: 'Error al cargar los datos del equipo', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [toast]);

  const advisorStats = useMemo<AdvisorStats[]>(() => {
    if (advisors.length === 0 || clients.length === 0) return [];
    
    return advisors.map(advisor => {
        const advisorClientIds = new Set(clients.filter(c => c.ownerId === advisor.id).map(c => c.id));
        const userOpps = opportunities.filter(opp => advisorClientIds.has(opp.clientId));
        
        const wonOpps = userOpps.filter(opp => opp.stage === 'Cerrado - Ganado');
        const totalRevenue = wonOpps.reduce((sum, opp) => sum + (opp.valorCerrado || opp.value), 0);
        
        const activeOpps = userOpps.filter(opp => opp.stage !== 'Cerrado - Ganado' && opp.stage !== 'Cerrado - Perdido');
        const pipelineValue = activeOpps.reduce((sum, opp) => sum + opp.value, 0);

        return {
            user: advisor,
            wonOpps: wonOpps.length,
            totalRevenue,
            activeOpps: activeOpps.length,
            pipelineValue
        };
    }).sort((a,b) => b.totalRevenue - a.totalRevenue); // Sort by revenue
  }, [advisors, opportunities, clients]);
  
  const columns = useMemo<ColumnDef<AdvisorStats>[]>(() => [
    {
      accessorKey: 'user',
      header: 'Asesor',
      cell: ({ row }) => {
        const { user } = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={`https://picsum.photos/seed/${user.id}/40/40`} alt={user.name} data-ai-hint="person face" />
              <AvatarFallback>{user.initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium">{user.name}</span>
              <span className="text-sm text-muted-foreground">{user.email}</span>
            </div>
          </div>
        );
      },
      minSize: 250,
    },
    {
      accessorKey: 'wonOpps',
      header: () => <div className="text-right">Opps Ganadas</div>,
      cell: ({ row }) => <div className="text-right">{row.original.wonOpps}</div>,
    },
    {
      accessorKey: 'totalRevenue',
      header: () => <div className="text-right">Ingresos</div>,
      cell: ({ row }) => <div className="text-right font-semibold">${row.original.totalRevenue.toLocaleString('es-AR')}</div>,
    },
    {
      accessorKey: 'activeOpps',
      header: () => <div className="text-right">Opps Activas</div>,
      cell: ({ row }) => <div className="text-right">{row.original.activeOpps}</div>,
    },
    {
      accessorKey: 'pipelineValue',
      header: () => <div className="text-right">Valor Pipeline</div>,
      cell: ({ row }) => <div className="text-right">${row.original.pipelineValue.toLocaleString('es-AR')}</div>,
    }
  ], []);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <ResizableDataTable
      columns={columns}
      data={advisorStats}
      emptyStateMessage="No se encontraron asesores."
    />
  );
}

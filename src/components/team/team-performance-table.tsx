
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getAllUsers, getClients } from '@/lib/firebase-service';
import type { Opportunity, User, Client } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import Link from 'next/link';

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

  const advisorStats = useMemo(() => {
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

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asesor</TableHead>
            <TableHead className="text-right">Oportunidades Ganadas</TableHead>
            <TableHead className="text-right">Ingresos Generados</TableHead>
            <TableHead className="text-right">Oportunidades Activas</TableHead>
            <TableHead className="text-right">Valor del Pipeline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {advisorStats.map(stats => (
            <TableRow key={stats.user.id}>
              <TableCell>
                 <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                        <AvatarImage src={`https://picsum.photos/seed/${stats.user.id}/40/40`} alt={stats.user.name} data-ai-hint="person face" />
                        <AvatarFallback>{stats.user.initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <span className="font-medium">{stats.user.name}</span>
                        <span className="text-sm text-muted-foreground">{stats.user.email}</span>
                    </div>
                </div>
              </TableCell>
              <TableCell className="text-right">{stats.wonOpps}</TableCell>
              <TableCell className="text-right font-semibold">${stats.totalRevenue.toLocaleString('es-AR')}</TableCell>
              <TableCell className="text-right">{stats.activeOpps}</TableCell>
              <TableCell className="text-right">${stats.pipelineValue.toLocaleString('es-AR')}</TableCell>
            </TableRow>
          ))}
          {advisorStats.length === 0 && (
             <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No se encontraron asesores.
                </TableCell>
              </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
